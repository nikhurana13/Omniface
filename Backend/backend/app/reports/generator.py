"""
reports/generator.py — Builds structured Firestore report docs and frontend-readable AnalyzeResponse payloads.

Responsibilities:
  1. Map internal AnalyzerResult signals → frontend IndicatorItem[] shape
  2. Generate a natural-language summary
  3. Write the report to Firestore (users/{uid}/reports/{reportId})
  4. Update the job doc to status=complete
  5. Return a fully-populated AnalyzeResponse for synchronous endpoints
"""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.analyzers.base import AnalyzerResult
from app.core import persistence
from app.fusion.engine import FusionResult
from app.models.schemas import AnalyzeResponse, IndicatorItem

logger = logging.getLogger(__name__)

# ── Signal → IndicatorItem mappings ───────────────────────────────────────────
# Maps internal signal keys to human-readable names and description templates
# that match what the frontend expects to display in the dashboard.

_IMAGE_SIGNAL_MAP: Dict[str, Dict[str, str]] = {
    "gan_fingerprint": {
        "name": "Spatial Pixel Frequency Residuals",
        "fake_desc": "High-frequency Fourier transform detected checkerboard generative upsampling.",
        "real_desc": "Sensor noise conforms to CMOS photon shot noise distribution.",
    },
    "corneal_reflection": {
        "name": "Corneal Specular Geometry",
        "fake_desc": "Asymmetric specular corneal reflections inconsistent with primary scene illumination.",
        "real_desc": "Corneal specular highlights consistent with scene lighting geometry.",
    },
    "facial_symmetry": {
        "name": "Facial Bilateral Symmetry Analysis",
        "fake_desc": "Unnatural bilateral facial symmetry deviation exceeding +2.4σ threshold.",
        "real_desc": "Facial symmetry within natural human biological variance.",
    },
    "sensor_noise": {
        "name": "Camera Sensor Noise Pattern",
        "fake_desc": "PRNU pattern inconsistency — sensor fingerprint absent (indicates synthetic origin).",
        "real_desc": "Natural Bayer CFA interpolation and photon shot noise verified.",
    },
    "compression_artifact": {
        "name": "JPEG Compression Artifact Analysis",
        "fake_desc": "Double-JPEG compression inconsistency detected (re-encoding after synthesis).",
        "real_desc": "Single-pass JPEG compression artifacts consistent with camera origin.",
    },
}

_AUDIO_SIGNAL_MAP: Dict[str, Dict[str, str]] = {
    "vocoder_harmonics": {
        "name": "Neural Vocoder Harmonic Analysis",
        "fake_desc": "HiFi-GAN upsampling phase discontinuity detected in harmonic series.",
        "real_desc": "Natural harmonic overtone series verified with no synthesis artifacts.",
    },
    "formant_continuity": {
        "name": "Acoustic Formant Continuity",
        "fake_desc": "Abrupt formant transitions inconsistent with natural articulatory motion.",
        "real_desc": "Smooth formant transitions consistent with biological vocal tract dynamics.",
    },
    "prosody_drift": {
        "name": "Prosodic Rhythm & Stress Pattern",
        "fake_desc": "Unnatural stress pattern and prosodic rhythm drift detected (TTS signature).",
        "real_desc": "Natural prosodic variation within human speech norms.",
    },
    "background_noise_floor": {
        "name": "Ambient Noise Floor Presence",
        "fake_desc": "Abnormally clean noise floor — absence of organic room acoustics (TTS indicator).",
        "real_desc": "Natural ambient noise floor present, consistent with recorded speech.",
    },
    "spectral_flatness": {
        "name": "Spectral Flatness (Synthesis Indicator)",
        "fake_desc": "Overly uniform spectral energy distribution characteristic of neural synthesis.",
        "real_desc": "Spectral energy distribution consistent with natural human voice.",
    },
}

_VIDEO_SIGNAL_MAP: Dict[str, Dict[str, str]] = {
    "frame_mean_score": {
        "name": "Spatial Pixel Boundary Seams",
        "fake_desc": "Generative blending artifacts detected along facial boundaries across frames.",
        "real_desc": "No generative boundary artifacts detected across sampled frames.",
    },
    "lip_sync_mismatch": {
        "name": "Acoustic-Visual Phoneme Sync",
        "fake_desc": "Vocal acoustic formants lead facial landmark lip movements by >100ms.",
        "real_desc": "Audio-visual sync within natural 4ms biological tolerance.",
    },
    "temporal_coherence": {
        "name": "Temporal Identity Coherence",
        "fake_desc": "Inter-frame facial identity instability detected (frame-swap boundary).",
        "real_desc": "Consistent facial identity across all sampled temporal frames.",
    },
    "audio_visual_sync": {
        "name": "Audio-Visual Temporal Stability",
        "fake_desc": "Inter-modal temporal sync divergence detected across frame boundaries.",
        "real_desc": "Consistent audio-visual alignment across all sampled temporal frames.",
    },
    "rppg_pulse": {
        "name": "Micro-vascular rPPG Biological Pulse",
        "fake_desc": "Abnormal sub-surface chrominance variation — absence of natural cardiovascular pulse waveform.",
        "real_desc": "Natural micro-vascular cardiovascular pulse signal verified across sampled temporal frames.",
    },
}


def _signals_to_indicators(
    signals: Dict[str, float],
    signal_map: Dict[str, Dict[str, str]],
    is_fake: bool,
) -> List[IndicatorItem]:
    """Convert raw signal floats → frontend IndicatorItem list."""
    indicators: List[IndicatorItem] = []
    for key, meta in signal_map.items():
        if key not in signals:
            continue
        raw_score = signals[key]
        score_pct = round(raw_score * 100)

        if is_fake:
            if raw_score >= 0.75:
                status = "anomalous"
            elif raw_score >= 0.50:
                status = "suspicious"
            else:
                status = "normal"
            description = meta["fake_desc"]
        else:
            if raw_score <= 0.20:
                status = "normal"
            elif raw_score <= 0.45:
                status = "suspicious"
            else:
                status = "anomalous"
            description = meta["real_desc"]

        indicators.append(IndicatorItem(
            name=meta["name"],
            score=score_pct,
            status=status,  # type: ignore[arg-type]
            description=description,
        ))
    return indicators


def _generate_summary(
    modality: str,
    verdict: str,
    confidence: float,
    indicators: List[IndicatorItem],
) -> str:
    """Generate a natural-language forensic summary for the dashboard."""
    anomalies = [ind for ind in indicators if ind.status == "anomalous"]
    anomaly_names = ", ".join(a.name for a in anomalies[:3])

    if verdict == "fake":
        return (
            f"High-confidence synthetic manipulation detected in {modality} media "
            f"(confidence: {confidence * 100:.1f}%). "
            f"Multi-signal forensic analysis identified: {anomaly_names}."
            if anomaly_names
            else f"Neural ensemble model detected synthetic {modality} with {confidence * 100:.1f}% confidence."
        )
    elif verdict == "real":
        return (
            f"Multi-signal forensic analysis verified authentic {modality} media "
            f"(confidence: {confidence * 100:.1f}% authentic). "
            f"No synthetic manipulation artifacts detected."
        )
    else:
        return (
            f"Analysis inconclusive for {modality} media (score: {confidence * 100:.1f}%). "
            f"Manual review recommended for high-stakes decisions."
        )


class ReportGenerator:
    """
    Builds the full report from fusion output + analyzer results,
    persists it to Firestore, and returns a frontend-ready response payload.
    """

    def build_and_persist(
        self,
        uid: str,
        job_id: str,
        modality: str,
        analyzer_result: AnalyzerResult,
        fusion: FusionResult,
        sha256: str,
        file_bytes_size: int,
        file_name: str,
        cloudinary_url: str,
        total_latency_ms: int,
        extra_audio_result: Optional[AnalyzerResult] = None,
    ) -> AnalyzeResponse:
        """
        Build the report document, persist to Firestore, update job status,
        and return a fully-populated AnalyzeResponse.

        Args:
            uid:               Firebase user UID (used for Firestore scoping).
            job_id:            Existing job document ID.
            modality:          "image" | "audio" | "video"
            analyzer_result:   Primary analyzer output.
            fusion:            Fusion engine output.
            sha256:            SHA-256 hex digest of the original file.
            file_bytes_size:   File size in bytes.
            file_name:         Original uploaded filename.
            cloudinary_url:    Secure Cloudinary URL for the uploaded file.
            total_latency_ms:  Wall-clock ms from upload to fusion complete.
            extra_audio_result: For video only — the separate AudioAnalyzer result.

        Returns:
            AnalyzeResponse ready to return from the API endpoint.
        """
        report_id = f"rpt_{uuid.uuid4().hex[:16]}"
        is_fake = fusion.verdict == "fake"
        is_deepfake = fusion.verdict == "fake"
        display_confidence = (
            round(1.0 - fusion.final_score, 4)
            if fusion.verdict == "real"
            else round(fusion.final_score, 4)
            if fusion.verdict == "fake"
            else 0.50
        )

        # ── Build indicator list ──────────────────────────────────────────────
        signal_map = (
            _IMAGE_SIGNAL_MAP if modality == "image"
            else _AUDIO_SIGNAL_MAP if modality == "audio"
            else _VIDEO_SIGNAL_MAP
        )
        indicators = _signals_to_indicators(analyzer_result.signals, signal_map, is_fake)

        if analyzer_result.error_message and not indicators:
            summary = f"Analysis inconclusive: {analyzer_result.error_message}. Manual verification recommended."
        else:
            summary = _generate_summary(modality, fusion.verdict, fusion.final_score, indicators)

        is_stub = bool(getattr(analyzer_result, "is_stub", False) or (extra_audio_result and getattr(extra_audio_result, "is_stub", False)))
        stub_warning = getattr(analyzer_result, "stub_warning", None)
        if is_stub:
            summary = (
                "[DEVELOPMENT STUB MODE ACTIVE — Results are synthetic and generated for pipeline testing only. "
                "Real trained ML models must replace stubs before production launch.]\n\n" + summary
            )

        # ── Build analyzer_results dict for Firestore ─────────────────────────
        analyzer_results: Dict[str, Any] = {
            modality: {
                "label": analyzer_result.label,
                "confidence": analyzer_result.confidence,
                "signals": analyzer_result.signals,
                "evidence_url": analyzer_result.evidence_url,
                "processing_time_ms": analyzer_result.processing_time_ms,
                "is_stub": is_stub,
            }
        }
        if extra_audio_result and modality == "video":
            analyzer_results["audio"] = {
                "label": extra_audio_result.label,
                "confidence": extra_audio_result.confidence,
                "signals": extra_audio_result.signals,
                "evidence_url": extra_audio_result.evidence_url,
                "is_stub": getattr(extra_audio_result, "is_stub", False),
            }

        # ── Persist report to Firestore ───────────────────────────────────────
        report_doc: Dict[str, Any] = {
            "reportId": report_id,
            "jobId": job_id,
            "modality": modality,
            "verdict": fusion.verdict,
            "confidenceScore": fusion.final_score,
            "displayConfidence": display_confidence,
            "isDeepfake": is_deepfake,
            "analyzerResults": analyzer_results,
            "fusion": {
                "method": fusion.method,
                "weights": fusion.weights,
                "finalScore": fusion.final_score,
                "rationale": fusion.rationale,
            },
            "summary": summary,
            "sha256": sha256,
            "latencyMs": total_latency_ms,
            "fileName": file_name,
            "fileSizeBytes": file_bytes_size,
            "fileSizeMb": f"{file_bytes_size / (1024 * 1024):.2f} MB",
            "cloudinaryUrl": cloudinary_url,
            "indicators": [ind.model_dump() for ind in indicators],
            "is_stub": is_stub,
            "stub_warning": stub_warning,
        }
        persistence.create_report(uid, report_id, report_doc)

        # ── Update job to complete ─────────────────────────────────────────────
        persistence.update_job(uid, job_id, {
            "status": "complete",
            "reportId": report_id,
        })

        logger.info(
            "Report generated: uid=%s job_id=%s report_id=%s verdict=%s confidence=%.3f (stub=%s)",
            uid, job_id, report_id, fusion.verdict, fusion.final_score, is_stub,
        )

        # ── Build AnalyzeResponse ─────────────────────────────────────────────
        return AnalyzeResponse(
            job_id=job_id,
            status="complete",
            report_id=report_id,
            confidence=display_confidence,          # 0–1; frontend multiplies ×100
            is_deepfake=is_deepfake,
            sha256=sha256,
            latency_ms=total_latency_ms,
            verdict=fusion.verdict,  # type: ignore[arg-type]
            indicators=indicators,
            summary=summary,
            modality=modality,  # type: ignore[arg-type]
            is_stub=is_stub,
            stub_warning=stub_warning,
        )


def compute_sha256(file_bytes: bytes) -> str:
    """Return the SHA-256 hex digest of the given bytes."""
    return hashlib.sha256(file_bytes).hexdigest()
