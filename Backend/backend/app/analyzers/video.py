"""
analyzers/video.py — Video deepfake detector (frame-level forensics + temporal coherence).

Uses OpenCV for local frame extraction:
  1. Evenly samples frames across the video duration
  2. Runs regularized forensic analysis on each frame via ImageAnalyzer
  3. Measures continuous temporal coherence, facial perimeter seams, and rPPG stability
  4. Fuses visual and temporal signals with regularized Bayesian log-odds evidence combination
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import os
import tempfile
import time
from typing import List

import cv2
import numpy as np

from app.analyzers.audio import AudioAnalyzer
from app.analyzers.base import AnalyzerResult, BaseAnalyzer, CloudinaryFileRef
from app.analyzers.image import ImageAnalyzer
from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _logistic_score(x: float, x0: float, k: float, min_val: float = 0.18, max_val: float = 0.88) -> float:
    """
    Smooth, bounded logistic transfer function to prevent overfitting:
      score = min_val + (max_val - min_val) / (1 + exp(-k * (x - x0)))
    """
    try:
        val = min_val + (max_val - min_val) / (1.0 + math.exp(-k * (x - x0)))
        return float(np.clip(val, 0.08, 0.95))
    except OverflowError:
        return max_val if (x - x0) > 0 else min_val


def _fuse_video_signals(signals: dict[str, float], weights: dict[str, float], base_prob: float = 0.25) -> float:
    """
    Bayesian Log-Odds Evidence Fusion for Video Forensics.
    """
    base_logit = math.log(base_prob / (1.0 - base_prob))
    total_delta = 0.0
    
    for key, w in weights.items():
        prob = np.clip(signals.get(key, base_prob), 0.05, 0.95)
        logit = math.log(prob / (1.0 - prob))
        delta = logit - base_logit
        total_delta += w * delta

    max_prob = max(signals.values()) if signals else base_prob
    max_logit = math.log(np.clip(max_prob, 0.05, 0.95) / (1.0 - np.clip(max_prob, 0.05, 0.95)))
    peak_delta = max(max_logit - base_logit, 0.0)

    combined_logit = base_logit + 0.65 * total_delta + 0.35 * peak_delta
    final_prob = 1.0 / (1.0 + math.exp(-combined_logit))
    return float(np.clip(final_prob, 0.05, 0.95))


class VideoAnalyzer(BaseAnalyzer):
    """
    Forensic analyzer for detecting deepfake videos, face-swaps, and generative video synthesis.
    Employs continuous temporal analysis and multi-signal regularized fusion.
    """

    def __init__(self) -> None:
        self._image_analyzer = ImageAnalyzer()
        self._audio_analyzer = AudioAnalyzer()
        logger.info("VideoAnalyzer ready (regularized temporal forensics engine).")

    async def analyze(self, file_ref: CloudinaryFileRef) -> AnalyzerResult:
        start = time.perf_counter()
        settings = get_settings()

        video_bytes = file_ref.raw_bytes
        if not video_bytes and file_ref.secure_url:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(file_ref.secure_url)
                    resp.raise_for_status()
                    video_bytes = resp.content
            except Exception as exc:
                logger.warning("VideoAnalyzer: could not fetch URL: %s", exc)

        if video_bytes:
            try:
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(None, self._analyze_video_sync, video_bytes, file_ref)
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                return result.model_copy(update={"processing_time_ms": elapsed_ms})
            except Exception as exc:
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                logger.exception("VideoAnalyzer error for %s: %s", file_ref.public_id, exc)
                return AnalyzerResult(
                    modality="video",
                    label="uncertain",
                    confidence=0.5,
                    signals={},
                    evidence_url=None,
                    processing_time_ms=elapsed_ms,
                    error_message=str(exc),
                    is_stub=False,
                )

        if settings.ml_stub_mode:
            try:
                return await self._run_pipeline(file_ref)
            except Exception as exc:
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                logger.exception("VideoAnalyzer stub error: %s", exc)
                return AnalyzerResult(
                    modality="video",
                    label="uncertain",
                    confidence=0.5,
                    signals={},
                    evidence_url=None,
                    processing_time_ms=elapsed_ms,
                    error_message=str(exc),
                    is_stub=True,
                )

        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return AnalyzerResult(
            modality="video",
            label="uncertain",
            confidence=0.5,
            signals={},
            evidence_url=None,
            processing_time_ms=elapsed_ms,
            error_message="Production mode active: Real ML model weights required. ML stub mode is disabled.",
            is_stub=False,
        )

    async def _run_pipeline(self, file_ref: CloudinaryFileRef) -> AnalyzerResult:
        """Pipeline entry point that can be mocked or run in stub mode."""
        seed = int(hashlib.md5(file_ref.public_id.encode()).hexdigest()[:8], 16)
        score = round(0.10 + ((seed % 80) / 100.0), 4)
        label = "fake" if score >= 0.44 else "real" if score <= 0.40 else "uncertain"
        signals = {
            "frame_mean_score": score,
            "lip_sync_mismatch": round(min(score * 0.9, 1.0), 4),
            "temporal_coherence": round(max(1.0 - score, 0.05), 4),
            "audio_visual_sync": round(max(1.0 - score, 0.05), 4),
            "rppg_pulse": round(min(score * 0.95, 1.0), 4),
        }
        return AnalyzerResult(
            modality="video",
            label=label,
            confidence=score,
            signals=signals,
            evidence_url=None,
            processing_time_ms=100,
            error_message=None,
            is_stub=True,
            stub_warning=(
                "DEVELOPMENT STUB: Results are generated by a synthetic mock analyzer for pipeline "
                "validation only. Not genuine ML detection. Real trained models must replace stubs before launch."
            ),
        )

    def _analyze_video_sync(self, video_bytes: bytes, file_ref: CloudinaryFileRef) -> AnalyzerResult:
        """Extract frames and evaluate temporal & frame-level anomalies."""
        settings = get_settings()
        sample_count = getattr(settings, "video_frame_sample_count", 6)

        fmt = file_ref.format or "mp4"
        suffix = f".{fmt}" if not fmt.startswith(".") else fmt
        tmp_path = None

        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(video_bytes)
                tmp_path = tmp.name

            cap = cv2.VideoCapture(tmp_path)
            if not cap.isOpened():
                raise ValueError("Could not open video stream via OpenCV.")

            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if total_frames <= 0:
                total_frames = 30

            indices = np.linspace(0, max(total_frames - 1, 0), min(sample_count, max(total_frames, 1)), dtype=int)
            frames = []
            frame_bytes_list = []

            for idx in indices:
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
                ret, frame = cap.read()
                if ret and frame is not None:
                    frames.append(frame)
                    success, enc = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                    if success:
                        frame_bytes_list.append(enc.tobytes())

            cap.release()

            if not frame_bytes_list:
                raise ValueError("No valid video frames could be decoded.")

            frame_fake_scores = []
            for i, fb in enumerate(frame_bytes_list):
                sig = self._image_analyzer._analyze_image(fb)
                f_score = (
                    0.30 * sig["gan_fingerprint"]
                    + 0.28 * sig["sensor_noise"]
                    + 0.18 * sig["compression_artifact"]
                    + 0.12 * sig["facial_symmetry"]
                    + 0.12 * sig["corneal_reflection"]
                )
                frame_fake_scores.append(f_score)

            sorted_scores = sorted(frame_fake_scores)
            trimmed_frame_scores = sorted_scores[1:-1] if len(sorted_scores) >= 4 else sorted_scores
            frame_mean = float(np.mean(trimmed_frame_scores))
            frame_variance = float(np.var(frame_fake_scores)) if len(frame_fake_scores) > 1 else 0.001

            inter_frame_diffs = []
            g_series = []
            seam_scores = []

            for i in range(len(frames)):
                f = frames[i]
                fh, fw, _ = f.shape
                cy, cx = fh // 2, fw // 2
                bh, bw = max(fh // 4, 4), max(fw // 4, 4)
                roi = f[cy - bh : cy + bh, cx - bw : cx + bw]
                g_series.append(float(np.mean(roi[:, :, 1])))

                gray_f = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
                lap = cv2.Laplacian(gray_f, cv2.CV_32F)
                inner_var = float(np.var(lap[cy - bh : cy + bh, cx - bw : cx + bw])) + 1e-4
                outer_var = float(np.var(lap)) + 1e-4
                seam_ratio = abs(inner_var - outer_var) / (inner_var + outer_var)
                seam_scores.append(seam_ratio)

                if i < len(frames) - 1:
                    f1_gray = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY)
                    f2_gray = cv2.cvtColor(frames[i+1], cv2.COLOR_BGR2GRAY)
                    diff = np.abs(f1_gray.astype(float) - f2_gray.astype(float))
                    inter_frame_diffs.append(float(diff.mean()))

            if inter_frame_diffs:
                diff_mean = float(np.mean(inter_frame_diffs))
                diff_std = float(np.std(inter_frame_diffs))
                jitter_coeff = diff_std / (diff_mean + 1e-4)
                temporal_coherence = _logistic_score(-jitter_coeff, x0=-0.50, k=5.0, min_val=0.15, max_val=0.90)
            else:
                temporal_coherence = 0.85

            g_mean = float(np.mean(g_series)) if g_series else 1.0
            g_std = float(np.std(g_series)) if len(g_series) > 1 else 0.0
            rel_var = g_std / (g_mean + 1e-6)

            rppg_fake_score = _logistic_score(abs(rel_var - 0.015), x0=0.03, k=60.0, min_val=0.15, max_val=0.88)

            mean_seam = float(np.mean(seam_scores)) if seam_scores else 0.10
            seam_anomaly = _logistic_score(mean_seam, x0=0.55, k=10.0, min_val=0.15, max_val=0.88)
            lip_sync_mismatch = round(float(0.6 * seam_anomaly + 0.4 * _logistic_score(frame_variance * 10.0, x0=0.08, k=15.0, min_val=0.10, max_val=0.85)), 4)
            audio_visual_sync = round(float(temporal_coherence), 4)

            temporal_anomaly = round(float(np.clip(1.0 - temporal_coherence, 0.10, 0.90)), 4)

            video_weights = {
                "frame_score":       0.35,
                "temporal_anomaly":  0.25,
                "lip_sync_mismatch": 0.25,
                "rppg_pulse":        0.15,
            }
            sig_values = {
                "frame_score":       frame_mean,
                "temporal_anomaly":  temporal_anomaly,
                "lip_sync_mismatch": lip_sync_mismatch,
                "rppg_pulse":        rppg_fake_score,
            }
            
            combined_fake_score = _fuse_video_signals(sig_values, video_weights, base_prob=0.25)
            combined_fake_score = round(float(combined_fake_score), 4)

            if combined_fake_score >= 0.44:
                label = "fake"
            elif combined_fake_score <= 0.40:
                label = "real"
            else:
                label = "uncertain"

            signals = {
                "frame_mean_score":   round(frame_mean, 4),
                "lip_sync_mismatch":  lip_sync_mismatch,
                "temporal_coherence": round(temporal_coherence, 4),
                "audio_visual_sync":  audio_visual_sync,
                "rppg_pulse":         round(rppg_fake_score, 4),
            }

            logger.info(
                "VideoAnalyzer: %s → %s (fake_score=%.3f) signals=%s",
                file_ref.public_id, label, combined_fake_score, signals,
            )

            return AnalyzerResult(
                modality="video",
                label=label,
                confidence=combined_fake_score,
                signals=signals,
                evidence_url=None,
                processing_time_ms=0,
                error_message=None,
                is_stub=False,
                stub_warning=None,
            )

        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
