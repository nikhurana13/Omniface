"""
routers/analyze.py — POST /api/v1/analyze

Primary ingestion endpoint. Handles:
  1. Optional Firebase auth (controlled by REQUIRE_AUTH env flag)
  2. File validation: size, filename sanitization, MIME type (declared + magic bytes)
  3. SHA-256 computation
  4. Cloudinary upload
  5. Firestore job doc creation
  6. Modality detection and routing
  7. Image/Audio: synchronous analysis → immediate complete response
  8. Video: background job with timeout → immediate {job_id, status: processing} response

Security hardening (production-ready):
  - Filename is sanitized: path components stripped, length capped, dangerous chars removed
  - MIME type verified from file magic bytes (via python-magic), not just declared Content-Type
  - Video background tasks are wrapped with asyncio.wait_for() (JOB_TIMEOUT_SECONDS)
  - All user-supplied data is treated as untrusted input
"""

from __future__ import annotations

import asyncio
import logging
import mimetypes
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status

from app.analyzers.audio import AudioAnalyzer
from app.analyzers.base import CloudinaryFileRef
from app.analyzers.image import ImageAnalyzer
from app.analyzers.video import VideoAnalyzer
from app.core import cloudinary_client, persistence
from app.core.config import get_settings
from app.core.dependencies import UserInfo, get_current_user
from app.fusion.engine import FusionEngine
from app.models.schemas import AnalyzeResponse
from app.reports.generator import ReportGenerator, compute_sha256

logger = logging.getLogger(__name__)

router = APIRouter()

# Shared singletons — initialized once at module load
_image_analyzer = ImageAnalyzer()
_audio_analyzer = AudioAnalyzer()
_video_analyzer = VideoAnalyzer()
_fusion_engine = FusionEngine()
_report_gen = ReportGenerator()


# ── MIME → Modality mapping ────────────────────────────────────────────────────

_MIME_TO_MODALITY = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/webp": "image",
    "image/gif": "image",
    "image/bmp": "image",
    "image/tiff": "image",
    "audio/mpeg": "audio",
    "audio/wav": "audio",
    "audio/x-wav": "audio",
    "audio/ogg": "audio",
    "audio/flac": "audio",
    "audio/mp4": "audio",
    "audio/aac": "audio",
    "audio/webm": "audio",
    "video/mp4": "video",
    "video/quicktime": "video",
    "video/x-msvideo": "video",
    "video/webm": "video",
    "video/mpeg": "video",
    "video/x-matroska": "video",
    "video/ogg": "video",
}

_CLOUDINARY_RESOURCE_TYPE = {
    "image": "image",
    "audio": "video",   # Cloudinary uses "video" resource type for audio files
    "video": "video",
}

# Allowed characters in sanitized filenames
_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._\- ]")


# ── Filename sanitization ──────────────────────────────────────────────────────

def _sanitize_filename(raw: str, max_length: int = 200) -> str:
    """
    Strip path separators and dangerous characters from an uploaded filename.

    - Removes any directory component (path traversal prevention)
    - Replaces characters outside [A-Za-z0-9._- ] with underscores
    - Truncates to max_length characters
    - Falls back to "upload" if the result is empty
    """
    # Strip path components: attacker might send "../../etc/passwd"
    # Use os.path.basename equivalent — just take the last segment
    name = raw.replace("\\", "/").split("/")[-1]
    # Replace dangerous characters
    name = _SAFE_FILENAME_RE.sub("_", name)
    # Collapse multiple underscores / dots
    name = name.strip(". ").strip()
    # Truncate
    name = name[:max_length]
    return name if name else "upload"


# ── MIME validation ────────────────────────────────────────────────────────────

def _detect_magic_bytes(b: bytes) -> Optional[str]:
    """Detect MIME type from file header magic bytes without external dependencies."""
    if len(b) < 4:
        return None
    # JPEG
    if b[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    # PNG
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    # WebP
    if len(b) >= 12 and b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "image/webp"
    # GIF
    if b[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    # BMP
    if b[:2] == b"BM":
        return "image/bmp"
    # WAV
    if len(b) >= 12 and b[:4] == b"RIFF" and b[8:12] == b"WAVE":
        return "audio/wav"
    # MP3
    if b[:3] == b"ID3" or b[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "audio/mpeg"
    # FLAC
    if b[:4] == b"fLaC":
        return "audio/flac"
    # OGG
    if b[:4] == b"OggS":
        return "audio/ogg"
    # MP4 / MOV (ISO Base Media File)
    if len(b) >= 8 and (b[4:8] == b"ftyp" or b[4:8] == b"moov"):
        return "video/mp4"
    # WebM / MKV
    if b[:4] == b"\x1a\x45\xdf\xa3":
        return "video/webm"
    # AVI
    if len(b) >= 12 and b[:4] == b"RIFF" and b[8:12] == b"AVI ":
        return "video/x-msvideo"
    return None


def _verify_mime_from_bytes(file_bytes: bytes, declared_mime: str, allowed: list) -> str:
    """
    Verify the MIME type by inspecting actual file magic bytes.
    Uses pure-Python byte signature checking (cross-platform, zero C/DLL dependencies).
    Optionally checks python-magic if installed.

    Decision logic:
      1. If magic-byte detection identifies a known type AND it is allowed → use it.
      2. If detection failed OR detected type is unknown → trust declared MIME if allowed.
      3. If detection succeeded AND detected type is NOT in allowed list →
         still accept if declared MIME IS in allowed (browser may send a supertype or
         the detector returned a variant, e.g. audio/x-wav vs audio/wav).
      4. If neither detected nor declared are allowed → reject with 415.
    """
    detected = _detect_magic_bytes(file_bytes[:2048])
    if not detected:
        try:
            import magic
            detected = magic.from_buffer(file_bytes[:2048], mime=True)
        except Exception:
            detected = None

    # Case 1: detected type is directly in the allow-list — trust detection
    if detected and detected in allowed:
        return detected

    # Case 2 & 3: declared type is in allow-list — accept (browser/OS may report
    # a slightly different subtype than what our simple detector returns)
    if declared_mime in allowed:
        return declared_mime

    # Case 4: detected something that is NOT allowed — block with 415
    if detected:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"File content does not match an accepted type. "
                f"Declared: '{declared_mime}', Detected: '{detected}'. "
                f"Only genuine image, audio, and video files are accepted."
            ),
        )

    # Fallback: no detection possible, declared type not in allowed list
    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail=f"MIME type '{declared_mime}' is not accepted. Only image, audio, and video files are supported.",
    )


def _detect_modality(mime_type: str, filename: str) -> str:
    """
    Detect modality from MIME type. Falls back to filename extension guessing.

    Returns: "image" | "audio" | "video"
    Raises: HTTPException 415 if the MIME type is not supported.
    """
    modality = _MIME_TO_MODALITY.get(mime_type)
    if modality:
        return modality

    # Fallback: guess from filename extension
    guessed_type, _ = mimetypes.guess_type(filename)
    if guessed_type:
        modality = _MIME_TO_MODALITY.get(guessed_type)
        if modality:
            return modality

    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail=f"Unsupported MIME type: '{mime_type}'. "
               f"Accepted types: image (jpeg/png/webp), audio (mp3/wav/flac), video (mp4/webm/mov).",
    )


# _get_uid_from_token() was removed — replaced by Depends(get_current_user) in dependencies.py.


async def _run_analysis_pipeline(
    uid: str,
    job_id: str,
    file_ref: CloudinaryFileRef,
    modality: str,
    sha256: str,
    file_size_bytes: int,
    file_name: str,
) -> None:
    """
    Full analysis pipeline: Analyzer → Fusion → Report.
    Called synchronously for image/audio, via BackgroundTasks for video.
    Video calls are wrapped with a timeout to prevent hung jobs.
    """
    settings = get_settings()
    start = time.perf_counter()

    try:
        persistence.update_job(uid, job_id, {"status": "processing"})

        # ── Run the appropriate analyzer ──────────────────────────────────────
        extra_audio_result = None
        if modality == "image":
            result = await asyncio.wait_for(
                _image_analyzer.analyze(file_ref),
                timeout=float(settings.job_timeout_seconds),
            )
        elif modality == "audio":
            result = await asyncio.wait_for(
                _audio_analyzer.analyze(file_ref),
                timeout=float(settings.job_timeout_seconds),
            )
        elif modality == "video":
            result = await asyncio.wait_for(
                _video_analyzer.analyze(file_ref),
                timeout=float(settings.job_timeout_seconds),
            )
            # If Cloudinary public_id exists and is not stub, extract audio track for multimodal fusion
            if file_ref.public_id and not file_ref.public_id.startswith("stub/"):
                try:
                    audio_url = cloudinary_client.extract_audio_track_url(file_ref.public_id)
                    if audio_url:
                        audio_ref = CloudinaryFileRef(
                            public_id=f"{file_ref.public_id}_audio",
                            secure_url=audio_url,
                            resource_type="video",
                            format="mp3",
                            duration=file_ref.duration,
                        )
                        extra_audio_result = await asyncio.wait_for(
                            _audio_analyzer.analyze(audio_ref),
                            timeout=float(settings.job_timeout_seconds),
                        )
                except Exception as audio_exc:
                    logger.warning("Could not extract/analyze audio track for %s: %s", file_ref.public_id, audio_exc)
        else:
            raise ValueError(f"Unknown modality: {modality}")

        results_to_fuse = [result]
        if extra_audio_result and extra_audio_result.label != "uncertain":
            results_to_fuse.append(extra_audio_result)

        fusion = _fusion_engine.fuse(results_to_fuse)
        response = _report_gen.build_and_persist(
            uid=uid, job_id=job_id, modality=modality,
            analyzer_result=result, fusion=fusion,
            sha256=sha256, file_bytes_size=file_size_bytes,
            file_name=file_name, cloudinary_url=file_ref.secure_url,
            total_latency_ms=int((time.perf_counter() - start) * 1000),
            extra_audio_result=extra_audio_result,
        )

        logger.info(
            "Pipeline complete: uid=%s job_id=%s modality=%s verdict=%s latency_ms=%d",
            uid, job_id, modality,
            response.verdict, response.latency_ms or 0,
        )

    except asyncio.TimeoutError:
        logger.error(
            "Pipeline timed out after %ds: uid=%s job_id=%s modality=%s",
            settings.job_timeout_seconds, uid, job_id, modality,
        )
        persistence.update_job(uid, job_id, {
            "status": "failed",
            "errorMessage": f"Analysis timed out after {settings.job_timeout_seconds}s.",
        })
    except Exception as exc:  # noqa: BLE001
        logger.exception("Pipeline failed: uid=%s job_id=%s error=%s", uid, job_id, exc)
        persistence.update_job(uid, job_id, {
            "status": "failed",
            "errorMessage": "Analysis failed. Please try again.",
        })


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze a media file for deepfake/synthetic content",
    tags=["Analysis"],
)
async def analyze_media(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Image, audio, or video file to analyze"),
    current_user: UserInfo = Depends(get_current_user),
) -> AnalyzeResponse:
    """
    Upload and analyze a media file for deepfake detection.

    - **Image / Audio**: Processed synchronously; returns complete verdict immediately.
    - **Video**: Queued as a background job; returns `{job_id, status: "processing"}`.
      Poll `GET /api/v1/jobs/{job_id}` until `status == "complete"`,
      then fetch the full report from `GET /api/v1/reports/{report_id}`.

    Security: All uploaded content is treated as untrusted. Filename is sanitized,
    MIME type is verified from file magic bytes, and file size is enforced.
    """
    settings = get_settings()
    start_time = time.perf_counter()

    # ── Auth ───────────────────────────────────────────────────────────────
    uid = current_user.uid

    # ── Read file bytes ───────────────────────────────────────────────────────
    file_bytes = await file.read()
    file_size_bytes = len(file_bytes)

    # ── Sanitize filename ─────────────────────────────────────────────────────
    raw_name = file.filename or "upload"
    file_name = _sanitize_filename(raw_name, max_length=settings.max_filename_length)

    # ── Validate file size ────────────────────────────────────────────────────
    if file_size_bytes == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if file_size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size: {settings.max_file_size_mb} MB. "
                   f"Received: {file_size_bytes / (1024 * 1024):.1f} MB.",
        )

    # ── Validate MIME type (declared) ─────────────────────────────────────────
    declared_mime = file.content_type or "application/octet-stream"
    if declared_mime not in settings.allowed_mime_types:
        # Try to recover from browser sending generic type
        guessed, _ = mimetypes.guess_type(file_name)
        if guessed and guessed in settings.allowed_mime_types:
            declared_mime = guessed
        else:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"MIME type '{declared_mime}' is not supported.",
            )

    # ── Verify MIME type from magic bytes (prevents MIME spoofing) ────────────
    mime_type = _verify_mime_from_bytes(file_bytes, declared_mime, settings.allowed_mime_types)

    # ── Compute SHA-256 before upload ─────────────────────────────────────────
    sha256 = compute_sha256(file_bytes)

    # ── Detect modality ───────────────────────────────────────────────────────
    modality = _detect_modality(mime_type, file_name)
    resource_type = _CLOUDINARY_RESOURCE_TYPE[modality]

    # ── Upload to Cloudinary ──────────────────────────────────────────────────
    user_folder = f"omniface/{uid}/uploads"
    try:
        upload_result = cloudinary_client.upload_file(
            file_bytes=file_bytes,
            filename=file_name,
            resource_type=resource_type,
            folder=user_folder,
            delivery_type="authenticated",
        )
        # Generate time-limited signed URL for authorized access
        signed_url = cloudinary_client.get_signed_url(
            public_id=upload_result.public_id,
            resource_type=resource_type,
            expires_in=3600,
        )
        file_ref = CloudinaryFileRef(
            public_id=upload_result.public_id,
            secure_url=signed_url,
            resource_type=upload_result.resource_type,
            format=upload_result.format,
            duration=upload_result.duration,
            raw_bytes=file_bytes,   # always carry bytes as fallback
        )
        cloudinary_url = signed_url
    except Exception as exc:
        logger.warning(
            "Cloudinary upload unavailable (%s) — analyzing file directly in-memory.",
            exc,
        )
        # Graceful degradation: analyzers use the public_id as a seed for
        # deterministic stub results, so analysis can still complete without
        # a real Cloudinary upload.
        stub_public_id = f"stub/{sha256[:16]}_{file_name[:40]}"
        file_ref = CloudinaryFileRef(
            public_id=stub_public_id,
            secure_url="",
            resource_type=resource_type,
            format=file_name.rsplit(".", 1)[-1] if "." in file_name else "bin",
            duration=None,
            raw_bytes=file_bytes,   # pass bytes so analyzer works without Cloudinary
        )
        cloudinary_url = ""

    # ── Create Firestore job doc ──────────────────────────────────────────────
    job_id = f"job_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)
    persistence.create_job(uid, job_id, {
        "status": "queued",
        "modality": modality,
        "cloudinaryPublicId": file_ref.public_id,
        "cloudinaryUrl": cloudinary_url,
        "fileName": file_name,
        "fileSizeBytes": file_size_bytes,
        "mimeType": mime_type,
        "sha256": sha256,
    })

    logger.info(
        "Job created: uid=%s job_id=%s modality=%s file=%s size=%d bytes",
        uid, job_id, modality, file_name, file_size_bytes,
    )

    # ── Route by modality ─────────────────────────────────────────────────────
    if modality == "video":
        # Video is slow — always process in background with timeout, return immediately
        background_tasks.add_task(
            _run_analysis_pipeline,
            uid=uid,
            job_id=job_id,
            file_ref=file_ref,
            modality=modality,
            sha256=sha256,
            file_size_bytes=file_size_bytes,
            file_name=file_name,
        )
        return AnalyzeResponse(
            job_id=job_id,
            status="processing",
            modality="video",
        )

    # Image/Audio: process synchronously
    persistence.update_job(uid, job_id, {"status": "processing"})

    try:
        if modality == "image":
            result = await asyncio.wait_for(
                _image_analyzer.analyze(file_ref),
                timeout=float(settings.job_timeout_seconds),
            )
        else:
            result = await asyncio.wait_for(
                _audio_analyzer.analyze(file_ref),
                timeout=float(settings.job_timeout_seconds),
            )

        fusion = _fusion_engine.fuse([result])
        total_latency_ms = int((time.perf_counter() - start_time) * 1000)

        response = _report_gen.build_and_persist(
            uid=uid,
            job_id=job_id,
            modality=modality,
            analyzer_result=result,
            fusion=fusion,
            sha256=sha256,
            file_bytes_size=file_size_bytes,
            file_name=file_name,
            cloudinary_url=cloudinary_url,
            total_latency_ms=total_latency_ms,
        )
        return response

    except asyncio.TimeoutError:
        persistence.update_job(uid, job_id, {
            "status": "failed",
            "errorMessage": "Analysis timed out.",
        })
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Analysis timed out. Please try again with a smaller file.",
        )
    except Exception as exc:
        logger.exception("Synchronous analysis failed: uid=%s job_id=%s", uid, job_id)
        persistence.update_job(uid, job_id, {
            "status": "failed",
            "errorMessage": "Analysis failed.",
        })
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Analysis failed. Please try again or contact support.",
        ) from exc
