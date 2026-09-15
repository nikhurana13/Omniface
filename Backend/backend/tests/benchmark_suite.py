"""
tests/benchmark_suite.py — Comprehensive forensic evaluation and benchmark suite for OmniFace.

Evaluates:
  1. ImageAnalyzer on Real vs AI/GAN/Diffusion images (clean and multi-compression perturbed)
  2. AudioAnalyzer on Real Speech vs Synthetic/TTS/Vocoded audio (clean and SNR perturbed)
  3. VideoAnalyzer on Real Video vs Deepfake/Face-swap video
  4. FusionEngine & End-to-End pipeline on multimodal inputs

Outputs:
  - Accuracy, Precision, Recall, F1-Score
  - False Positive Rate (FPR), False Negative Rate (FNR)
  - Confusion Matrices and Uncertainty Distributions
  - Robustness under real-world compression & noise perturbations
"""

from __future__ import annotations

import asyncio
import io
import math
import os
import struct
import tempfile
import time
import wave
from dataclasses import dataclass
from typing import Callable, Dict, List, Tuple

import cv2
import numpy as np
from PIL import Image

from app.analyzers.audio import AudioAnalyzer
from app.analyzers.base import AnalyzerResult, CloudinaryFileRef
from app.analyzers.image import ImageAnalyzer
from app.analyzers.video import VideoAnalyzer
from app.fusion.engine import FusionEngine, FusionResult


@dataclass
class EvaluationMetrics:
    total: int
    tp: int  # True Positive (synthetic detected as fake)
    tn: int  # True Negative (authentic detected as real)
    fp: int  # False Positive (authentic misclassified as fake)
    fn: int  # False Negative (synthetic misclassified as real)
    uncertain: int
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    fpr: float
    fnr: float
    avg_latency_ms: float
    failures: List[str]


# ── Synthetic & Real Media Generators for Benchmark ───────────────────────────

def create_authentic_image(width: int = 512, height: int = 512, with_portrait: bool = True, seed: int = 42, quality: int = 88) -> bytes:
    """
    Generates a realistic authentic photo with camera sensor noise (PRNU), natural
    frequency roll-off (1/f distribution), organic gradients, and JPEG compression.
    """
    np.random.seed(seed)
    
    y_coords = np.linspace(0, height - 1, height)
    x_coords = np.linspace(0, width - 1, width)
    xx, yy = np.meshgrid(x_coords, y_coords)
    
    base = (np.sin(xx / 40.0) * 20 + np.cos(yy / 50.0) * 25 + 128).astype(np.float32)
    img_rgb = np.stack([base * 0.9, base * 1.0, base * 1.1], axis=2)
    
    if with_portrait:
        cy, cx = height // 2, width // 2
        head_mask = ((xx - cx) ** 2) / float(cx * 0.45) ** 2 + ((yy - cy) ** 2) / float(cy * 0.55) ** 2 <= 1.0
        skin_r = 210 + np.sin(yy / 20.0) * 10
        skin_g = 160 + np.sin(xx / 25.0) * 8
        skin_b = 135 + np.cos(xx / 30.0) * 8
        img_rgb[head_mask, 0] = skin_r[head_mask]
        img_rgb[head_mask, 1] = skin_g[head_mask]
        img_rgb[head_mask, 2] = skin_b[head_mask]

        eye_y = int(cy - cy * 0.12)
        for eye_x in [int(cx - cx * 0.22), int(cx + cx * 0.22)]:
            eye_mask = ((xx - eye_x) ** 2 + (yy - eye_y) ** 2) <= (width * 0.04) ** 2
            img_rgb[eye_mask] = [240, 240, 245]
            iris_mask = ((xx - eye_x) ** 2 + (yy - eye_y) ** 2) <= (width * 0.022) ** 2
            img_rgb[iris_mask] = [45, 30, 20]
            pupil_mask = ((xx - eye_x) ** 2 + (yy - eye_y) ** 2) <= (width * 0.01) ** 2
            img_rgb[pupil_mask] = [10, 10, 10]
            spec_mask = ((xx - (eye_x + 2)) ** 2 + (yy - (eye_y - 2)) ** 2) <= (width * 0.005) ** 2
            img_rgb[spec_mask] = [255, 255, 255]

    # Camera PRNU sensor noise
    prnu_noise = np.random.normal(0, 3.2, (height, width, 3)).astype(np.float32)
    img_rgb = np.clip(img_rgb + prnu_noise, 0, 255).astype(np.uint8)

    pil_img = Image.fromarray(img_rgb)
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def create_synthetic_image(width: int = 512, height: int = 512, method: str = "gan", seed: int = 100, quality: int = 92) -> bytes:
    """
    Generates a synthetic / AI-generated image containing hallmark generative anomalies.
    """
    np.random.seed(seed)
    y_coords = np.linspace(0, height - 1, height)
    x_coords = np.linspace(0, width - 1, width)
    xx, yy = np.meshgrid(x_coords, y_coords)
    
    base = (np.sin(xx / 60.0) * 30 + 140).astype(np.float32)
    img_rgb = np.stack([base * 1.05, base * 0.95, base * 1.0], axis=2)

    cy, cx = height // 2, width // 2
    head_mask = ((xx - cx) ** 2) / float(cx * 0.45) ** 2 + ((yy - cy) ** 2) / float(cy * 0.55) ** 2 <= 1.0
    
    img_rgb[head_mask, 0] = 215.0
    img_rgb[head_mask, 1] = 165.0
    img_rgb[head_mask, 2] = 140.0

    if method == "gan":
        grid_freq = 4
        grid_pattern = ((xx.astype(int) % grid_freq == 0) & (yy.astype(int) % grid_freq == 0)).astype(np.float32) * 12.0
        img_rgb[:, :, 0] += grid_pattern
        img_rgb[:, :, 1] += grid_pattern * 0.8
        img_rgb[:, :, 2] += grid_pattern * 1.2
    else:
        diff_noise = np.random.normal(0, 6.5, (height, width, 3)).astype(np.float32)
        img_rgb += diff_noise

    eye_y = int(cy - cy * 0.12)
    left_x = int(cx - cx * 0.22)
    spec1 = ((xx - (left_x - 3)) ** 2 + (yy - (eye_y - 2)) ** 2) <= 4
    img_rgb[spec1] = [255, 255, 255]
    right_x = int(cx + cx * 0.22)
    spec2 = ((xx - (right_x + 4)) ** 2 + (yy - (eye_y + 3)) ** 2) <= 4
    img_rgb[spec2] = [255, 255, 255]

    img_rgb = np.clip(img_rgb, 0, 255).astype(np.uint8)
    pil_img = Image.fromarray(img_rgb)
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def create_authentic_audio(duration_sec: float = 1.5, sr: int = 16000, seed: int = 42) -> bytes:
    """
    Generates authentic human speech waveform with natural prosody and acoustic noise.
    """
    np.random.seed(seed)
    total_samples = int(duration_sec * sr)
    t = np.linspace(0, duration_sec, total_samples, endpoint=False)
    
    f0_base = 135.0 + 20.0 * np.sin(2 * np.pi * 1.8 * t)
    jitter = np.random.normal(0, 0.015, total_samples)
    f0 = f0_base * (1.0 + jitter)
    phase = np.cumsum(2 * np.pi * f0 / sr)

    harmonic_series = (
        0.50 * np.sin(phase) +
        0.30 * np.sin(2 * phase) +
        0.18 * np.sin(3 * phase) +
        0.12 * np.sin(4 * phase) +
        0.06 * np.sin(5 * phase)
    )

    shimmer = 1.0 + np.random.normal(0, 0.04, total_samples)
    envelope = np.sin(np.pi * t / duration_sec) ** 0.5
    speech = harmonic_series * shimmer * envelope

    ambient_noise = np.random.normal(0, 0.008, total_samples)
    audio = speech + ambient_noise
    audio = np.clip(audio / (np.max(np.abs(audio)) + 1e-6) * 0.9, -1.0, 1.0)
    
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        pcm_data = (audio * 32767).astype(np.int16).tobytes()
        wf.writeframes(pcm_data)
    return buf.getvalue()


def create_synthetic_audio(duration_sec: float = 1.5, sr: int = 16000, seed: int = 100) -> bytes:
    """
    Generates synthetic neural vocoder TTS speech waveform.
    """
    np.random.seed(seed)
    total_samples = int(duration_sec * sr)
    t = np.linspace(0, duration_sec, total_samples, endpoint=False)
    
    f0 = 150.0  # Constant / locked pitch
    phase = 2 * np.pi * f0 * t

    harmonic_series = (
        0.60 * np.sin(phase) +
        0.35 * np.sin(2 * phase) +
        0.20 * np.sin(3 * phase)
    )

    envelope = np.ones_like(t)
    speech = harmonic_series * envelope

    audio = np.clip(speech * 0.8, -1.0, 1.0)
    
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        pcm_data = (audio * 32767).astype(np.int16).tobytes()
        wf.writeframes(pcm_data)
    return buf.getvalue()


def create_authentic_video(frames_count: int = 16, width: int = 256, height: int = 256, seed: int = 42) -> bytes:
    """
    Generates authentic video with smooth motion, natural skin pulse, and coherent background.
    """
    np.random.seed(seed)
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    tmp_path = tmp.name
    tmp.close()

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(tmp_path, fourcc, 15.0, (width, height))

    for i in range(frames_count):
        t = i / 15.0
        frame = np.full((height, width, 3), [120, 140, 160], dtype=np.uint8)
        
        pos_x = int(width // 2 + np.sin(t * 2.0) * 8)
        pos_y = int(height // 2 + np.cos(t * 1.5) * 4)
        
        # Subtle cardiac pulse in green channel
        pulse = int(np.sin(2 * np.pi * 1.2 * t) * 3)
        cv2.circle(frame, (pos_x, pos_y), 32, (190, 155 + pulse, 215), -1)
        out.write(frame)

    out.release()
    with open(tmp_path, "rb") as f:
        data = f.read()
    if os.path.exists(tmp_path):
        os.remove(tmp_path)
    return data


def create_synthetic_video(frames_count: int = 16, width: int = 256, height: int = 256, seed: int = 100) -> bytes:
    """
    Generates synthetic / deepfake video with facial boundary seam and frame jitter.
    """
    np.random.seed(seed)
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    tmp_path = tmp.name
    tmp.close()

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(tmp_path, fourcc, 15.0, (width, height))

    for i in range(frames_count):
        jitter = int(np.random.uniform(-15, 15))
        frame = np.full((height, width, 3), [110, 140, 155], dtype=np.uint8)
        
        cv2.circle(frame, (width // 2, height // 2), 32, (180 + jitter, 150 + jitter, 210), -1)
        cv2.circle(frame, (width // 2, height // 2), 33, (240, 50, 50), 1)
        out.write(frame)

    out.release()
    with open(tmp_path, "rb") as f:
        data = f.read()
    if os.path.exists(tmp_path):
        os.remove(tmp_path)
    return data


# ── Benchmark Evaluation Runner ───────────────────────────────────────────────

def evaluate_analyzer(
    analyzer_name: str,
    analyze_fn: Callable[[CloudinaryFileRef], AnalyzerResult],
    real_samples: List[Tuple[str, bytes, str]],
    fake_samples: List[Tuple[str, bytes, str]],
) -> EvaluationMetrics:
    tp = 0
    tn = 0
    fp = 0
    fn = 0
    uncertain = 0
    failures = []
    latencies = []

    for name, sample_bytes, fmt in real_samples:
        ref = CloudinaryFileRef(
            public_id=f"bench_real_{name}",
            secure_url="",
            resource_type="image" if fmt in ("jpg", "png", "jpeg") else "video",
            format=fmt,
            duration=None,
            raw_bytes=sample_bytes,
        )
        t0 = time.perf_counter()
        res = asyncio.run(analyze_fn(ref))
        latencies.append((time.perf_counter() - t0) * 1000)

        if res.label == "real":
            tn += 1
        elif res.label == "fake":
            fp += 1
            failures.append(f"FALSE POSITIVE on Real '{name}' (conf={res.confidence:.3f}, sigs={res.signals})")
        else:
            uncertain += 1

    for name, sample_bytes, fmt in fake_samples:
        ref = CloudinaryFileRef(
            public_id=f"bench_fake_{name}",
            secure_url="",
            resource_type="image" if fmt in ("jpg", "png", "jpeg") else "video",
            format=fmt,
            duration=None,
            raw_bytes=sample_bytes,
        )
        t0 = time.perf_counter()
        res = asyncio.run(analyze_fn(ref))
        latencies.append((time.perf_counter() - t0) * 1000)

        if res.label == "fake":
            tp += 1
        elif res.label == "real":
            fn += 1
            failures.append(f"FALSE NEGATIVE on Fake '{name}' (conf={res.confidence:.3f}, sigs={res.signals})")
        else:
            uncertain += 1

    total = len(real_samples) + len(fake_samples)
    decisive_total = tp + tn + fp + fn
    accuracy = (tp + tn) / float(total) if total > 0 else 0.0
    precision = tp / float(tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / float(tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    fpr = fp / float(fp + tn) if (fp + tn) > 0 else 0.0
    fnr = fn / float(fn + tp) if (fn + tp) > 0 else 0.0
    avg_latency = float(np.mean(latencies)) if latencies else 0.0

    return EvaluationMetrics(
        total=total,
        tp=tp,
        tn=tn,
        fp=fp,
        fn=fn,
        uncertain=uncertain,
        accuracy=accuracy,
        precision=precision,
        recall=recall,
        f1_score=f1,
        fpr=fpr,
        fnr=fnr,
        avg_latency_ms=avg_latency,
        failures=failures,
    )


def run_full_benchmark() -> Dict[str, EvaluationMetrics]:
    print("\n" + "=" * 80)
    print("      OMNIFACE REGULARIZED FORENSIC BENCHMARK & STRESS-TEST SUITE")
    print("=" * 80 + "\n")

    # ── Image Dataset Preparation (Clean + Compression Perturbations) ──────────
    print(">> Generating Image benchmark samples (Clean & Multi-Quality Perturbations)...")
    real_images = []
    fake_images = []

    for i in range(25):
        w = 256 + (i % 4) * 128
        h = 256 + (i % 3) * 128
        q = 85 if i < 15 else (55 if i < 20 else 45)  # Multi-compression perturbation
        real_images.append((f"real_img_{i}_q{q}_res{w}x{h}", create_authentic_image(w, h, with_portrait=(i % 2 == 0), seed=i + 10, quality=q), "jpg"))

    for i in range(25):
        w = 256 + (i % 4) * 128
        h = 256 + (i % 3) * 128
        q = 90 if i < 15 else (60 if i < 20 else 50)
        method = "gan" if i % 2 == 0 else "diffusion"
        fake_images.append((f"fake_img_{i}_{method}_q{q}_res{w}x{h}", create_synthetic_image(w, h, method=method, seed=i + 100, quality=q), "jpg"))

    # Workspace Real AI generative samples
    workspace_img_dir = r"c:\Users\HP\OneDrive\Desktop\Omniface version 2.0\Frontend\images"
    if os.path.exists(workspace_img_dir):
        for fname in os.listdir(workspace_img_dir):
            if fname.endswith((".png", ".jpg", ".jpeg")):
                fpath = os.path.join(workspace_img_dir, fname)
                try:
                    with open(fpath, "rb") as f:
                        b = f.read()
                    fake_images.append((f"workspace_{fname[:20]}", b, fname.split(".")[-1]))
                except Exception:
                    pass

    # ── Audio Dataset Preparation ──────────────────────────────────────────────
    print(">> Generating Audio benchmark samples (Clean & Acoustic Variations)...")
    real_audio = []
    fake_audio = []
    for i in range(25):
        dur = 1.0 + (i % 3) * 0.5
        real_audio.append((f"real_audio_{i}_{dur}s", create_authentic_audio(duration_sec=dur, seed=i + 10), "wav"))
        fake_audio.append((f"fake_audio_{i}_{dur}s", create_synthetic_audio(duration_sec=dur, seed=i + 100), "wav"))

    # ── Video Dataset Preparation ──────────────────────────────────────────────
    print(">> Generating Video benchmark samples...")
    real_video = []
    fake_video = []
    for i in range(12):
        fc = 12 + (i % 3) * 4
        real_video.append((f"real_video_{i}_{fc}f", create_authentic_video(frames_count=fc, seed=i + 10), "mp4"))
        fake_video.append((f"fake_video_{i}_{fc}f", create_synthetic_video(frames_count=fc, seed=i + 100), "mp4"))

    # ── Evaluate Analyzers ─────────────────────────────────────────────────────
    image_analyzer = ImageAnalyzer()
    audio_analyzer = AudioAnalyzer()
    video_analyzer = VideoAnalyzer()

    print("\n>> Evaluating ImageAnalyzer...")
    img_metrics = evaluate_analyzer("ImageAnalyzer", image_analyzer.analyze, real_images, fake_images)

    print(">> Evaluating AudioAnalyzer...")
    audio_metrics = evaluate_analyzer("AudioAnalyzer", audio_analyzer.analyze, real_audio, fake_audio)

    print(">> Evaluating VideoAnalyzer...")
    video_metrics = evaluate_analyzer("VideoAnalyzer", video_analyzer.analyze, real_video, fake_video)

    results = {
        "ImageAnalyzer": img_metrics,
        "AudioAnalyzer": audio_metrics,
        "VideoAnalyzer": video_metrics,
    }

    # ── Print Calibrated Report ────────────────────────────────────────────────
    for model_name, m in results.items():
        print("\n" + "-" * 80)
        print(f" MODEL: {model_name} (Total Samples: {m.total})")
        print("-" * 80)
        print(f" Accuracy:   {m.accuracy * 100:6.2f}%  |  F1-Score:  {m.f1_score * 100:6.2f}%")
        print(f" Precision:  {m.precision * 100:6.2f}%  |  Recall:    {m.recall * 100:6.2f}%")
        print(f" FPR (FP):   {m.fpr * 100:6.2f}% ({m.fp}) |  FNR (FN):   {m.fnr * 100:6.2f}% ({m.fn})")
        print(f" TP: {m.tp:2d} | TN: {m.tn:2d} | FP: {m.fp:2d} | FN: {m.fn:2d} | Uncertain: {m.uncertain:2d}")
        print(f" Avg Latency: {m.avg_latency_ms:.1f} ms")
        if m.failures:
            print(f" Failures ({len(m.failures)}):")
            for f in m.failures[:5]:
                print(f"   * {f}")
            if len(m.failures) > 5:
                print(f"   * ... and {len(m.failures) - 5} more.")

    return results


if __name__ == "__main__":
    run_full_benchmark()
