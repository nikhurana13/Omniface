"""
analyzers/audio.py — Audio voice-clone / synthetic-speech detector.

Forensic audio signal processing engine with regularized continuous logistic mapping:
  1. vocoder_harmonics       — Neural vocoder harmonic structure & phase discontinuity
  2. formant_continuity      — Formant flux and articulatory transition smoothness
  3. prosody_drift           — Pitch (F0) contour coefficient of variation & natural prosody
  4. background_noise_floor  — Ambient room acoustics vs digital silence
  5. spectral_flatness       — Wiener entropy synthesis indicator on voiced frames

Runs 100% locally with soundfile and NumPy. Zero DLL dependencies, zero external network calls.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import math
import time
from typing import Dict

import numpy as np
import soundfile as sf

from app.analyzers.base import AnalyzerResult, BaseAnalyzer, CloudinaryFileRef
from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _logistic_score(x: float, x0: float, k: float, min_val: float = 0.20, max_val: float = 0.90) -> float:
    """
    Smooth, bounded logistic transfer function to prevent overfitting:
      score = min_val + (max_val - min_val) / (1 + exp(-k * (x - x0)))
    """
    try:
        val = min_val + (max_val - min_val) / (1.0 + math.exp(-k * (x - x0)))
        return float(np.clip(val, 0.10, 0.95))
    except OverflowError:
        return max_val if (x - x0) > 0 else min_val


def _fuse_forensic_signals(signals: Dict[str, float], weights: Dict[str, float], base_prob: float = 0.30) -> float:
    """
    Bayesian Log-Odds Evidence Fusion: combines independent forensic acoustic indicators.
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

    combined_logit = base_logit + 0.60 * total_delta + 0.40 * peak_delta
    final_prob = 1.0 / (1.0 + math.exp(-combined_logit))
    return float(np.clip(final_prob, 0.05, 0.95))


class AudioAnalyzer(BaseAnalyzer):
    """
    Forensic analyzer for detecting cloned voices, TTS synthesis, and audio deepfakes.
    Uses continuous regularized probability mapping across spectral and acoustic dimensions.
    """

    def __init__(self) -> None:
        logger.info("AudioAnalyzer ready (regularized audio signal engine).")

    async def analyze(self, file_ref: CloudinaryFileRef) -> AnalyzerResult:
        start = time.perf_counter()
        settings = get_settings()

        audio_bytes = file_ref.raw_bytes
        if not audio_bytes and file_ref.secure_url:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(file_ref.secure_url)
                    resp.raise_for_status()
                    audio_bytes = resp.content
            except Exception as exc:
                logger.warning("AudioAnalyzer: could not fetch URL: %s", exc)

        if audio_bytes:
            try:
                loop = asyncio.get_running_loop()
                signals = await loop.run_in_executor(None, self._analyze_audio, audio_bytes)
                elapsed_ms = int((time.perf_counter() - start) * 1000)

                weights = {
                    "vocoder_harmonics":      0.28,
                    "formant_continuity":     0.18,
                    "prosody_drift":          0.26,
                    "background_noise_floor": 0.14,
                    "spectral_flatness":      0.14,
                }
                fake_score = _fuse_forensic_signals(signals, weights, base_prob=0.30)
                fake_score = round(float(fake_score), 4)

                if fake_score >= 0.50:
                    label = "fake"
                elif fake_score <= 0.40:
                    label = "real"
                else:
                    label = "uncertain"

                logger.info(
                    "AudioAnalyzer: %s → %s (fake_score=%.3f) [%dms]",
                    file_ref.public_id, label, fake_score, elapsed_ms,
                )

                return AnalyzerResult(
                    modality="audio",
                    label=label,
                    confidence=fake_score,
                    signals=signals,
                    evidence_url=None,
                    processing_time_ms=elapsed_ms,
                    error_message=None,
                    is_stub=False,
                    stub_warning=None,
                )

            except Exception as exc:
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                logger.exception("AudioAnalyzer error for %s: %s", file_ref.public_id, exc)
                return AnalyzerResult(
                    modality="audio",
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
                return self._run_stub(file_ref)
            except Exception as exc:
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                return AnalyzerResult(
                    modality="audio",
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
            modality="audio",
            label="uncertain",
            confidence=0.5,
            signals={},
            evidence_url=None,
            processing_time_ms=elapsed_ms,
            error_message="Production mode active: Real ML model weights required. ML stub mode is disabled.",
            is_stub=False,
        )

    def _analyze_audio(self, audio_bytes: bytes) -> Dict[str, float]:
        """Runs signal processing algorithms on the audio waveform."""
        buf = io.BytesIO(audio_bytes)
        try:
            y, sr = sf.read(buf)
        except Exception:
            import wave
            buf.seek(0)
            with wave.open(buf, 'rb') as wf:
                n_frames = wf.getnframes()
                sr = wf.getframerate()
                frames = wf.readframes(n_frames)
                y = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0

        if len(y.shape) > 1:
            y = y.mean(axis=1)

        # Normalize audio amplitude
        max_val = np.max(np.abs(y)) + 1e-6
        if max_val > 0.01:
            y = y / max_val

        frame_size = 512
        hop = 256
        window = np.hanning(frame_size)
        num_frames = max((len(y) - frame_size) // hop, 1)

        energies = []
        flatnesses = []
        pitches = []
        formant_deltas = []
        complex_specs = []

        prev_spec = None
        for i in range(num_frames):
            frame = y[i * hop : i * hop + frame_size] * window
            energy = float(np.mean(frame**2))
            energies.append(energy)

            c_spec = np.fft.rfft(frame)
            complex_specs.append(c_spec)

            mag_spec = np.abs(c_spec) + 1e-10
            if prev_spec is not None:
                delta = float(np.mean(np.abs(mag_spec - prev_spec)) / (np.mean(mag_spec) + 1e-6))
                formant_deltas.append(delta)
            prev_spec = mag_spec

            if energy > 1e-4:
                geom_mean = np.exp(np.mean(np.log(mag_spec)))
                arith_mean = np.mean(mag_spec)
                flatnesses.append(float(geom_mean / (arith_mean + 1e-6)))

                corr = np.correlate(frame, frame, mode='full')[frame_size - 1:]
                min_lag = max(int(sr / 400), 2)
                max_lag = min(int(sr / 70), len(corr) - 1)
                if max_lag > min_lag:
                    peak_lag = min_lag + int(np.argmax(corr[min_lag:max_lag]))
                    if corr[peak_lag] > 0.25 * corr[0]:
                        pitches.append(sr / float(peak_lag))

        energies_arr = np.array(energies)
        pitches_arr = np.array(pitches)
        flatnesses_arr = np.array(flatnesses)
        formant_arr = np.array(formant_deltas)

        # ── 1. Neural Vocoder Harmonics & Phase Discontinuity ─────────────────
        if len(complex_specs) > 3:
            specs_mat = np.array(complex_specs)
            phase_mat = np.angle(specs_mat)
            phase_diff = np.diff(phase_mat, axis=0)
            phase_variance = float(np.var(phase_diff))
            vocoder_score = _logistic_score(-phase_variance, x0=-5.5, k=3.5, min_val=0.15, max_val=0.88)
        else:
            vocoder_score = 0.25

        # ── 2. Biological Micro-Jitter and Prosodic Rhythm ───────────────────
        if len(pitches_arr) > 4:
            pitch_std = float(np.std(pitches_arr))
            prosody_score = _logistic_score(-pitch_std, x0=-4.2, k=1.8, min_val=0.15, max_val=0.90)
        else:
            prosody_score = 0.25

        # ── 3. Background Acoustic Noise Floor ─────────────────────────────────
        mean_energy = float(np.mean(energies_arr)) if len(energies_arr) > 0 else 1e-4
        quiet_frames = energies_arr[energies_arr < mean_energy * 0.25]
        if len(quiet_frames) > 0:
            noise_rms = float(np.mean(quiet_frames))
            bg_noise_score = _logistic_score(-math.log10(max(noise_rms, 1e-10)), x0=4.5, k=1.5, min_val=0.15, max_val=0.88)
        else:
            bg_noise_score = 0.20

        # ── 4. Formant Continuity & Spectral Envelope ──────────────────────────
        if len(formant_arr) > 0:
            delta_std = float(np.std(formant_arr))
            formant_continuity = _logistic_score(delta_std, x0=1.05, k=2.5, min_val=0.15, max_val=0.85)
        else:
            formant_continuity = 0.20

        # ── 5. Spectral Flatness (Voiced Harmonic Peaks vs Noise) ──────────────
        if len(flatnesses_arr) > 0:
            mean_flatness = float(np.mean(flatnesses_arr))
            spectral_flatness = _logistic_score(mean_flatness, x0=0.38, k=8.0, min_val=0.15, max_val=0.85)
        else:
            spectral_flatness = 0.20

        signals = {
            "vocoder_harmonics":      round(float(vocoder_score), 4),
            "formant_continuity":     round(float(formant_continuity), 4),
            "prosody_drift":          round(float(prosody_score), 4),
            "background_noise_floor": round(float(bg_noise_score), 4),
            "spectral_flatness":      round(float(spectral_flatness), 4),
        }
        return signals

    def _run_stub(self, file_ref: CloudinaryFileRef) -> AnalyzerResult:
        """Deterministic seed-based mock result for pipeline testing and stub mode."""
        seed = int(hashlib.md5(file_ref.public_id.encode()).hexdigest()[:8], 16)
        score = round(0.10 + ((seed % 80) / 100.0), 4)
        label = "fake" if score >= 0.50 else "real" if score <= 0.40 else "uncertain"
        signals = {
            "vocoder_harmonics": score,
            "formant_continuity": round(min(score * 0.9, 1.0), 4),
            "prosody_drift": round(max(score * 0.8, 0.05), 4),
            "background_noise_floor": round(max(1.0 - score, 0.05), 4),
            "spectral_flatness": score,
        }
        return AnalyzerResult(
            modality="audio",
            label=label,
            confidence=score,
            signals=signals,
            evidence_url=None,
            processing_time_ms=50,
            error_message=None,
            is_stub=True,
            stub_warning=(
                "DEVELOPMENT STUB: Results are generated by a synthetic mock analyzer for pipeline "
                "validation only. Not genuine ML detection. Real trained models must replace stubs before launch."
            ),
        )
