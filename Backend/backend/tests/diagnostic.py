"""
Diagnostic script to inspect signal values on authentic vs synthetic samples.
"""
import io
import numpy as np
from PIL import Image
from tests.benchmark_suite import (
    create_authentic_image,
    create_synthetic_image,
    create_authentic_audio,
    create_synthetic_audio,
)
from app.analyzers.image import ImageAnalyzer
from app.analyzers.audio import AudioAnalyzer

img_analyzer = ImageAnalyzer()
audio_analyzer = AudioAnalyzer()

print("--- IMAGE DIAGNOSTICS ---")
real_img_bytes = create_authentic_image(512, 512, with_portrait=True, seed=42)
fake_gan_bytes = create_synthetic_image(512, 512, method="gan", seed=100)
fake_diff_bytes = create_synthetic_image(512, 512, method="diffusion", seed=100)

real_sigs = img_analyzer._analyze_image(real_img_bytes)
fake_gan_sigs = img_analyzer._analyze_image(fake_gan_bytes)
fake_diff_sigs = img_analyzer._analyze_image(fake_diff_bytes)

print("REAL IMAGE SIGNALS:", real_sigs)
print("FAKE GAN SIGNALS:  ", fake_gan_sigs)
print("FAKE DIFF SIGNALS: ", fake_diff_sigs)

print("\n--- AUDIO DIAGNOSTICS ---")
real_aud_bytes = create_authentic_audio(1.5, seed=42)
fake_aud_bytes = create_synthetic_audio(1.5, seed=100)

real_aud_sigs = audio_analyzer._analyze_audio(real_aud_bytes)
fake_aud_sigs = audio_analyzer._analyze_audio(fake_aud_bytes)

print("REAL AUDIO SIGNALS:", real_aud_sigs)
print("FAKE AUDIO SIGNALS:", fake_aud_sigs)
