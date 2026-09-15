"""
tests/test_analyzers.py — Unit tests for all three analyzer stubs.

Tests verify that:
  - Each analyzer returns a valid AnalyzerResult
  - label is one of "real", "fake", "uncertain"
  - confidence is within [0.0, 1.0]
  - signals dict is non-empty
  - Analyzers never raise exceptions (fail-closed contract)
  - Results are deterministic for the same public_id (seed-based stubs)

No real Firebase, Cloudinary, or model dependencies are required.
"""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from app.analyzers.audio import AudioAnalyzer
from app.analyzers.base import AnalyzerResult, CloudinaryFileRef
from app.analyzers.image import ImageAnalyzer
from app.analyzers.video import VideoAnalyzer


# ── Test fixtures ─────────────────────────────────────────────────────────────

def make_file_ref(
    public_id: str = "test/sample_image",
    resource_type: str = "image",
    fmt: str = "jpg",
    duration: float | None = None,
) -> CloudinaryFileRef:
    return CloudinaryFileRef(
        public_id=public_id,
        secure_url=f"https://res.cloudinary.com/test/image/upload/{public_id}",
        resource_type=resource_type,
        format=fmt,
        duration=duration,
    )


# ── ImageAnalyzer tests ───────────────────────────────────────────────────────

class TestImageAnalyzer:
    @pytest.fixture
    def analyzer(self):
        return ImageAnalyzer()

    @pytest.fixture
    def image_ref(self):
        return make_file_ref("test/image_001", "image", "jpg")

    def test_analyze_returns_valid_result(self, analyzer, image_ref):
        result = asyncio.run(analyzer.analyze(image_ref))
        assert isinstance(result, AnalyzerResult)
        assert result.modality == "image"

    def test_label_is_valid(self, analyzer, image_ref):
        result = asyncio.run(analyzer.analyze(image_ref))
        assert result.label in ("real", "fake", "uncertain")

    def test_confidence_in_range(self, analyzer, image_ref):
        result = asyncio.run(analyzer.analyze(image_ref))
        assert 0.0 <= result.confidence <= 1.0

    def test_signals_non_empty(self, analyzer, image_ref):
        result = asyncio.run(analyzer.analyze(image_ref))
        assert isinstance(result.signals, dict)
        assert len(result.signals) > 0

    def test_all_signal_scores_in_range(self, analyzer, image_ref):
        result = asyncio.run(analyzer.analyze(image_ref))
        for key, value in result.signals.items():
            assert 0.0 <= value <= 1.0, f"Signal '{key}' out of range: {value}"

    def test_processing_time_positive(self, analyzer, image_ref):
        result = asyncio.run(analyzer.analyze(image_ref))
        assert result.processing_time_ms >= 0

    def test_deterministic_for_same_public_id(self, analyzer, image_ref):
        """Same public_id should produce same label (seed-based)."""
        result1 = asyncio.run(analyzer.analyze(image_ref))
        result2 = asyncio.run(analyzer.analyze(image_ref))
        assert result1.label == result2.label
        assert result1.confidence == result2.confidence

    def test_fail_closed_on_exception(self, analyzer):
        """If an internal error occurs, returns uncertain — never raises."""
        bad_ref = make_file_ref("", "image", "jpg")  # Edge case: empty public_id

        with patch.object(analyzer, "_run_stub", side_effect=RuntimeError("model crash")):
            result = asyncio.run(analyzer.analyze(bad_ref))
            assert result.label == "uncertain"
            assert result.error_message is not None


# ── AudioAnalyzer tests ───────────────────────────────────────────────────────

class TestAudioAnalyzer:
    @pytest.fixture
    def analyzer(self):
        return AudioAnalyzer()

    @pytest.fixture
    def audio_ref(self):
        return make_file_ref("test/audio_001", "raw", "wav")

    def test_analyze_returns_valid_result(self, analyzer, audio_ref):
        result = asyncio.run(analyzer.analyze(audio_ref))
        assert isinstance(result, AnalyzerResult)
        assert result.modality == "audio"

    def test_label_is_valid(self, analyzer, audio_ref):
        result = asyncio.run(analyzer.analyze(audio_ref))
        assert result.label in ("real", "fake", "uncertain")

    def test_confidence_in_range(self, analyzer, audio_ref):
        result = asyncio.run(analyzer.analyze(audio_ref))
        assert 0.0 <= result.confidence <= 1.0

    def test_expected_signals_present(self, analyzer, audio_ref):
        result = asyncio.run(analyzer.analyze(audio_ref))
        expected_signals = {"vocoder_harmonics", "formant_continuity", "prosody_drift"}
        assert expected_signals.issubset(set(result.signals.keys()))

    def test_fail_closed_on_exception(self, analyzer, audio_ref):
        with patch.object(analyzer, "_run_stub", side_effect=ValueError("CUDA OOM")):
            result = asyncio.run(analyzer.analyze(audio_ref))
            assert result.label == "uncertain"
            assert result.error_message == "CUDA OOM"


# ── VideoAnalyzer tests ───────────────────────────────────────────────────────

class TestVideoAnalyzer:
    @pytest.fixture
    def analyzer(self):
        return VideoAnalyzer()

    @pytest.fixture
    def video_ref(self):
        return make_file_ref("test/video_001", "video", "mp4", duration=30.0)

    def test_analyze_returns_valid_result(self, analyzer, video_ref):
        """VideoAnalyzer runs the full frame+audio pipeline (stubs)."""
        with (
            patch("app.core.cloudinary_client.extract_video_frame_urls") as mock_frames,
            patch("app.core.cloudinary_client.extract_audio_track_url") as mock_audio,
        ):
            mock_frames.return_value = [
                "https://res.cloudinary.com/test/video/upload/test/video_001.jpg"
            ] * 4
            mock_audio.return_value = "https://res.cloudinary.com/test/video/upload/test/video_001.mp3"

            result = asyncio.run(analyzer.analyze(video_ref))

        assert isinstance(result, AnalyzerResult)
        assert result.modality == "video"

    def test_label_is_valid(self, analyzer, video_ref):
        with (
            patch("app.core.cloudinary_client.extract_video_frame_urls") as mock_frames,
            patch("app.core.cloudinary_client.extract_audio_track_url") as mock_audio,
        ):
            mock_frames.return_value = ["https://example.com/frame.jpg"] * 4
            mock_audio.return_value = "https://example.com/audio.mp3"
            result = asyncio.run(analyzer.analyze(video_ref))

        assert result.label in ("real", "fake", "uncertain")

    def test_video_signals_present(self, analyzer, video_ref):
        with (
            patch("app.core.cloudinary_client.extract_video_frame_urls") as mock_frames,
            patch("app.core.cloudinary_client.extract_audio_track_url") as mock_audio,
        ):
            mock_frames.return_value = ["https://example.com/frame.jpg"] * 4
            mock_audio.return_value = "https://example.com/audio.mp3"
            result = asyncio.run(analyzer.analyze(video_ref))

        expected = {"frame_mean_score", "lip_sync_mismatch", "temporal_coherence"}
        assert expected.issubset(set(result.signals.keys()))

    def test_fail_closed_on_exception(self, analyzer, video_ref):
        with patch.object(analyzer, "_run_pipeline", side_effect=RuntimeError("FFmpeg missing")):
            result = asyncio.run(analyzer.analyze(video_ref))
            assert result.label == "uncertain"
            assert result.error_message is not None


class TestMLStubModeEnforcement:
    """Verify that stub mode behavior and production safety fail-closed guards work as designed."""

    def test_stub_mode_active_discloses_warnings(self):
        analyzer = ImageAnalyzer()
        ref = make_file_ref("test/sample_img", "image", "jpg")
        result = asyncio.run(analyzer.analyze(ref))
        assert result.is_stub is True
        assert result.stub_warning is not None
        assert "DEVELOPMENT STUB" in result.stub_warning

    def test_production_mode_fails_closed_without_model(self):
        analyzer = ImageAnalyzer()
        ref = make_file_ref("test/sample_img", "image", "jpg")
        with patch("app.analyzers.image.get_settings") as mock_settings:
            mock_settings.return_value.ml_stub_mode = False
            result = asyncio.run(analyzer.analyze(ref))
            assert result.label == "uncertain"
            assert result.is_stub is False
            assert result.error_message is not None
            assert "Real ML model weights required" in result.error_message

    def test_audio_production_mode_fails_closed_without_model(self):
        analyzer = AudioAnalyzer()
        ref = make_file_ref("test/sample_audio", "video", "mp3")
        with patch("app.analyzers.audio.get_settings") as mock_settings:
            mock_settings.return_value.ml_stub_mode = False
            result = asyncio.run(analyzer.analyze(ref))
            assert result.label == "uncertain"
            assert result.is_stub is False
            assert "Real ML model weights required" in result.error_message

    def test_video_production_mode_fails_closed_without_model(self):
        analyzer = VideoAnalyzer()
        ref = make_file_ref("test/sample_vid", "video", "mp4")
        with patch("app.analyzers.video.get_settings") as mock_settings:
            mock_settings.return_value.ml_stub_mode = False
            result = asyncio.run(analyzer.analyze(ref))
            assert result.label == "uncertain"
            assert result.is_stub is False
            assert "Real ML model weights required" in result.error_message


class TestRealMediaInferencePipeline:
    """Test genuine forensic computer vision and signal processing inference on real media bytes."""

    def test_real_image_inference_produces_genuine_signals(self):
        import io
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (128, 128), color=(140, 160, 180)).save(buf, format="JPEG")
        valid_jpeg = buf.getvalue()

        analyzer = ImageAnalyzer()
        ref = CloudinaryFileRef(
            public_id="real_image_001",
            secure_url="",
            resource_type="image",
            format="jpg",
            duration=None,
            raw_bytes=valid_jpeg,
        )
        result = asyncio.run(analyzer.analyze(ref))
        assert result.is_stub is False
        assert result.stub_warning is None
        assert result.label in ("real", "fake", "uncertain")
        assert 0.0 <= result.confidence <= 1.0
        expected_signals = {
            "gan_fingerprint", "sensor_noise", "compression_artifact",
            "facial_symmetry", "corneal_reflection",
        }
        assert expected_signals.issubset(set(result.signals.keys()))
        for k, v in result.signals.items():
            assert 0.0 <= v <= 1.0, f"Signal {k} out of range: {v}"

    def test_real_audio_inference_produces_genuine_signals(self):
        import io, math, struct, wave
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            samples = [int(3000 * math.sin(2 * math.pi * 440 * i / 16000)) for i in range(8000)]
            wf.writeframes(struct.pack(f"<{len(samples)}h", *samples))
        valid_wav = buf.getvalue()

        analyzer = AudioAnalyzer()
        ref = CloudinaryFileRef(
            public_id="real_audio_001",
            secure_url="",
            resource_type="video",
            format="wav",
            duration=0.5,
            raw_bytes=valid_wav,
        )
        result = asyncio.run(analyzer.analyze(ref))
        assert result.is_stub is False
        assert result.stub_warning is None
        assert result.label in ("real", "fake", "uncertain")
        assert 0.0 <= result.confidence <= 1.0
        expected_signals = {
            "vocoder_harmonics", "formant_continuity", "prosody_drift",
            "background_noise_floor", "spectral_flatness",
        }
        assert expected_signals.issubset(set(result.signals.keys()))

    def test_real_video_inference_produces_genuine_signals(self):
        import cv2, numpy as np, tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp_path = tmp.name

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(tmp_path, fourcc, 10.0, (128, 128))
        for i in range(12):
            frame = np.full((128, 128, 3), 110 + i * 3, dtype=np.uint8)
            out.write(frame)
        out.release()

        with open(tmp_path, "rb") as f:
            valid_mp4 = f.read()
        os.remove(tmp_path)

        analyzer = VideoAnalyzer()
        ref = CloudinaryFileRef(
            public_id="real_video_001",
            secure_url="",
            resource_type="video",
            format="mp4",
            duration=1.2,
            raw_bytes=valid_mp4,
        )
        result = asyncio.run(analyzer.analyze(ref))
        assert result.is_stub is False
        assert result.stub_warning is None
        assert result.label in ("real", "fake", "uncertain")
        assert 0.0 <= result.confidence <= 1.0
        expected_signals = {
            "frame_mean_score", "lip_sync_mismatch", "temporal_coherence",
            "audio_visual_sync", "rppg_pulse",
        }
        assert expected_signals.issubset(set(result.signals.keys()))

    def test_corrupted_image_fails_closed_with_error_message(self):
        analyzer = ImageAnalyzer()
        ref = CloudinaryFileRef(
            public_id="bad_image",
            secure_url="",
            resource_type="image",
            format="jpg",
            duration=None,
            raw_bytes=b"completely invalid binary data",
        )
        result = asyncio.run(analyzer.analyze(ref))
        assert result.label == "uncertain"
        assert result.is_stub is False
        assert result.error_message is not None


