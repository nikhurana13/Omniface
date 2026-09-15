"""
core/cloudinary_client.py — Cloudinary SDK configuration and file-operation helpers.

Configured once at import time from environment variables.
All upload/transform helpers return typed dataclasses; never raw dicts.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List

import cloudinary
import cloudinary.api
import cloudinary.uploader

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_initialized = False


def initialize_cloudinary() -> None:
    """
    Configure the Cloudinary SDK with credentials from environment.
    Safe to call multiple times — subsequent calls are no-ops.
    """
    global _initialized
    if _initialized:
        return

    settings = get_settings()
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )
    _initialized = True
    logger.info("Cloudinary SDK configured (cloud=%s).", settings.cloudinary_cloud_name)


# ── Typed results ──────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class CloudinaryUploadResult:
    public_id: str
    secure_url: str
    resource_type: str      # "image" | "video" | "raw"
    format: str             # e.g. "mp4", "jpg", "wav"
    bytes: int
    duration: float | None  # seconds; only for video/audio


@dataclass(frozen=True)
class CloudinaryFileRef:
    """Passed into Analyzer.analyze() so analyzers don't hold raw bytes."""
    public_id: str
    secure_url: str
    resource_type: str
    format: str
    duration: float | None


# ── Upload ─────────────────────────────────────────────────────────────────────

def upload_file(
    file_bytes: bytes,
    filename: str,
    resource_type: str = "auto",
    folder: str = "omniface/uploads",
    delivery_type: str = "authenticated",
) -> CloudinaryUploadResult:
    """
    Upload raw bytes to Cloudinary with authenticated delivery.

    Security:
        All private user uploads and generated media are stored with type="authenticated".
        They are NEVER accessible via open, permanent, or unauthenticated CDN URLs.
        Access requires short-lived signed URLs generated server-side.

    Args:
        file_bytes:    The raw file content.
        filename:      Original filename (used for public_id suffix).
        resource_type: "image" | "video" | "raw" | "auto" (default; let Cloudinary detect).
        folder:        Cloudinary folder path (scoped by user UID in callers).
        delivery_type: "authenticated" (default for private media) or "upload".

    Returns:
        CloudinaryUploadResult with the public_id and secure_url.

    Raises:
        cloudinary.exceptions.Error on upload failure.
    """
    initialize_cloudinary()

    # Strip extension from filename for a cleaner public_id
    base_name = filename.rsplit(".", 1)[0] if "." in filename else filename

    full_public_id = f"{folder.rstrip('/')}/{base_name}" if folder else base_name
    result = cloudinary.uploader.upload(
        file_bytes,
        public_id=full_public_id,
        folder=folder,
        resource_type=resource_type,
        type=delivery_type,
        overwrite=False,
        unique_filename=True,
        use_filename=True,
    )

    return CloudinaryUploadResult(
        public_id=result["public_id"],
        secure_url=result["secure_url"],
        resource_type=result["resource_type"],
        format=result.get("format", ""),
        bytes=result.get("bytes", 0),
        duration=result.get("duration"),
    )


# ── Signed URLs ────────────────────────────────────────────────────────────────

def get_signed_url(
    public_id: str,
    resource_type: str = "image",
    expires_in: int = 3600,
    format: str | None = None,
) -> str:
    """
    Generate a signed, time-limited Cloudinary URL for an authenticated resource.

    Args:
        public_id:     Cloudinary public_id of the resource.
        resource_type: "image" | "video" | "raw".
        expires_in:    Lifetime in seconds (default 1 hour).
        format:        Optional target format (e.g. "jpg", "mp3").

    Returns:
        Signed URL string with token parameters.
    """
    initialize_cloudinary()
    import time

    expiry_timestamp = int(time.time()) + expires_in
    url, _ = cloudinary.utils.cloudinary_url(
        public_id,
        resource_type=resource_type,
        type="authenticated",
        sign_url=True,
        expires_at=expiry_timestamp,
        format=format,
    )
    return url or ""


# ── Video Frame Sampling ───────────────────────────────────────────────────────

def extract_video_frame_urls(
    public_id: str,
    count: int = 8,
    width: int = 640,
    expires_in: int = 3600,
) -> List[str]:
    """
    Build authenticated, signed Cloudinary transformation URLs to extract N evenly-spaced frames
    from a video as JPEG images.

    Args:
        public_id:  Cloudinary video public_id.
        count:      Number of frames to sample.
        width:      Resize width for each frame (height auto-scales).
        expires_in: Signature expiry in seconds.

    Returns:
        List of signed JPEG frame URLs.
    """
    initialize_cloudinary()
    import time
    expiry_timestamp = int(time.time()) + expires_in
    urls = []
    for i in range(count):
        # Cloudinary's `so_` (start offset) accepts percentage strings
        percent = int((i / max(count - 1, 1)) * 100)
        url, _ = cloudinary.utils.cloudinary_url(
            public_id,
            resource_type="video",
            type="authenticated",
            sign_url=True,
            expires_at=expiry_timestamp,
            format="jpg",
            transformation=[
                {"width": width, "crop": "scale"},
                {"start_offset": f"{percent}p"},
            ],
        )
        if url:
            urls.append(url)
    return urls


def extract_audio_track_url(public_id: str, expires_in: int = 3600) -> str:
    """
    Build a signed authenticated Cloudinary URL that extracts and serves just the
    audio track of a video as an MP3 file.

    Args:
        public_id:  Cloudinary video public_id.
        expires_in: Signature expiry in seconds.

    Returns:
        Signed MP3 audio URL.
    """
    initialize_cloudinary()
    import time
    expiry_timestamp = int(time.time()) + expires_in
    url, _ = cloudinary.utils.cloudinary_url(
        public_id,
        resource_type="video",
        type="authenticated",
        sign_url=True,
        expires_at=expiry_timestamp,
        format="mp3",
    )
    return url or ""


# ── Resource Cleanup & Deletion ────────────────────────────────────────────────

def delete_file(public_id: str, resource_type: str = "image") -> dict:
    """
    Delete an authenticated resource from Cloudinary and invalidate CDN caches.

    Args:
        public_id:     Cloudinary public_id.
        resource_type: "image" | "video" | "raw".

    Returns:
        Cloudinary API response dict.
    """
    initialize_cloudinary()
    try:
        res = cloudinary.uploader.destroy(
            public_id,
            resource_type=resource_type,
            type="authenticated",
            invalidate=True,
        )
        logger.info("Deleted Cloudinary authenticated resource: %s (result=%s)", public_id, res.get("result"))
        return res
    except Exception as exc:
        logger.warning("Failed to delete Cloudinary resource %s: %s", public_id, exc)
        return {"result": "error", "error": str(exc)}


# ── Health Check ───────────────────────────────────────────────────────────────

async def check_cloudinary_connectivity() -> str:
    """
    Lightweight health-check: call the Cloudinary ping endpoint.

    Returns "ok" on success or an error description on failure.
    """
    try:
        initialize_cloudinary()
        result = cloudinary.api.ping()
        if result.get("status") == "ok":
            return "ok"
        return f"unexpected response: {result}"
    except Exception as exc:  # noqa: BLE001
        logger.warning("Cloudinary health-check failed: %s", exc)
        return f"error: {exc}"
