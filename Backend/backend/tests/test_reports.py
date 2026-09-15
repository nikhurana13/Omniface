"""
tests/test_reports.py — Unit tests for the ReportGenerator.

Tests verify:
  - build_and_persist returns a valid AnalyzeResponse
  - SHA-256 hash computation is correct
  - Indicators are generated for each modality
  - Summary is a non-empty string
  - Firestore persistence is called correctly (mocked)
"""

from __future__ import annotations

import hashlib
from unittest.mock import MagicMock, patch

import pytest

from app.analyzers.base import AnalyzerResult
from app.fusion.engine import FusionResult
from app.models.schemas import AnalyzeResponse
from app.reports.generator import ReportGenerator, compute_sha256


# ── Fixtures ──────────────────────────────────────────────────────────────────

def make_analyzer_result(
    modality: str = "image",
    label: str = "fake",
    confidence: float = 0.91,
) -> AnalyzerResult:
    signals = {
        "image": {
            "gan_fingerprint": 0.92,
            "corneal_reflection": 0.88,
            "facial_symmetry": 0.85,
            "sensor_noise": 0.78,
            "compression_artifact": 0.75,
        },
        "audio": {
            "vocoder_harmonics": 0.93,
            "formant_continuity": 0.80,
            "prosody_drift": 0.77,
            "background_noise_floor": 0.70,
            "spectral_flatness": 0.65,
        },
        "video": {
            "frame_mean_score": 0.88,
            "frame_variance": 0.12,
            "audio_visual_sync": 0.83,
            "lip_sync_mismatch": 0.79,
            "temporal_coherence": 0.88,
            "rppg_pulse": 0.85,
        },
    }.get(modality, {})

    return AnalyzerResult(
        modality=modality,  # type: ignore[arg-type]
        label=label,  # type: ignore[arg-type]
        confidence=confidence,
        signals=signals,
        evidence_url=None,
        processing_time_ms=150,
        error_message=None,
    )


def make_fusion_result(
    verdict: str = "fake",
    final_score: float = 0.91,
) -> FusionResult:
    return FusionResult(
        method="passthrough",
        weights={"image": 1.0},
        final_score=final_score,
        verdict=verdict,  # type: ignore[arg-type]
        rationale="Test rationale string.",
    )


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestComputeSha256:
    def test_correct_hash(self):
        data = b"hello world"
        expected = hashlib.sha256(data).hexdigest()
        assert compute_sha256(data) == expected

    def test_empty_bytes(self):
        result = compute_sha256(b"")
        assert len(result) == 64  # SHA-256 hex is always 64 chars
        assert all(c in "0123456789abcdef" for c in result)

    def test_different_data_different_hash(self):
        h1 = compute_sha256(b"abc")
        h2 = compute_sha256(b"abd")
        assert h1 != h2


class TestReportGenerator:
    @pytest.fixture
    def generator(self):
        return ReportGenerator()

    def _call_build(
        self,
        generator: ReportGenerator,
        modality: str = "image",
        verdict: str = "fake",
        confidence: float = 0.91,
    ) -> AnalyzeResponse:
        """Helper: call build_and_persist with mocked Firestore calls."""
        with (
            patch("app.reports.generator.persistence.create_report") as mock_create,
            patch("app.reports.generator.persistence.update_job") as mock_update,
        ):
            mock_create.return_value = "rpt_test123"
            mock_update.return_value = None

            result = generator.build_and_persist(
                uid="test_user_123",
                job_id="job_test_abc",
                modality=modality,
                analyzer_result=make_analyzer_result(modality, "fake" if verdict == "fake" else "real", confidence),
                fusion=make_fusion_result(verdict, confidence),
                sha256="a" * 64,
                file_bytes_size=1024 * 1024,
                file_name="test_image.jpg",
                cloudinary_url="https://res.cloudinary.com/test/image/upload/test.jpg",
                total_latency_ms=200,
            )
            return result

    def test_returns_analyze_response(self, generator):
        result = self._call_build(generator, "image", "fake")
        assert isinstance(result, AnalyzeResponse)

    def test_status_is_complete(self, generator):
        result = self._call_build(generator, "image", "fake")
        assert result.status == "complete"

    def test_is_deepfake_true_for_fake_verdict(self, generator):
        result = self._call_build(generator, "image", "fake")
        assert result.is_deepfake is True

    def test_is_deepfake_false_for_real_verdict(self, generator):
        result = self._call_build(generator, "image", "real", 0.05)
        assert result.is_deepfake is False

    def test_sha256_is_set(self, generator):
        result = self._call_build(generator, "image", "fake")
        assert result.sha256 == "a" * 64

    def test_confidence_in_range(self, generator):
        result = self._call_build(generator, "image", "fake", 0.91)
        assert 0.0 <= result.confidence <= 1.0

    def test_latency_ms_positive(self, generator):
        result = self._call_build(generator, "image", "fake")
        assert result.latency_ms >= 0

    def test_summary_non_empty(self, generator):
        result = self._call_build(generator, "image", "fake")
        assert isinstance(result.summary, str)
        assert len(result.summary) > 10

    def test_indicators_non_empty_for_image(self, generator):
        result = self._call_build(generator, "image", "fake")
        assert result.indicators is not None
        assert len(result.indicators) > 0

    def test_indicators_have_valid_status(self, generator):
        result = self._call_build(generator, "audio", "fake")
        for ind in (result.indicators or []):
            assert ind.status in ("normal", "suspicious", "anomalous")

    def test_indicators_scores_in_0_100(self, generator):
        result = self._call_build(generator, "video", "fake")
        for ind in (result.indicators or []):
            assert 0 <= ind.score <= 100, f"Score out of range: {ind.score}"

    def test_modality_video_indicators_include_rppg(self, generator):
        result = self._call_build(generator, "video", "fake")
        names = [ind.name for ind in (result.indicators or [])]
        assert any("rPPG" in name or "Pulse" in name for name in names)

    def test_modality_image_indicators_do_not_contain_rppg(self, generator):
        """Images are static media and must not contain fabricated cardiovascular pulse indicators."""
        result = self._call_build(generator, "image", "fake")
        names = [ind.name for ind in (result.indicators or [])]
        assert not any("rPPG" in name or "Pulse" in name for name in names)

    def test_firestore_persistence_called(self, generator):
        from unittest.mock import ANY, call
        with (
            patch("app.reports.generator.persistence.create_report") as mock_create,
            patch("app.reports.generator.persistence.update_job") as mock_update,
        ):
            mock_create.return_value = "rpt_abc"
            generator.build_and_persist(
                uid="u1", job_id="j1", modality="image",
                analyzer_result=make_analyzer_result("image"),
                fusion=make_fusion_result(),
                sha256="b" * 64, file_bytes_size=512,
                file_name="test.jpg",
                cloudinary_url="https://example.com/test.jpg",
                total_latency_ms=100,
            )
            mock_create.assert_called_once()
            # report_id is a UUID generated inside the function; assert just the status
            mock_update.assert_called_once_with("u1", "j1", {
                "status": "complete",
                "reportId": ANY,   # UUID generated at runtime
            })
