"""
tests/test_fusion.py — Unit tests for the FusionEngine.

Tests verify:
  - Single-modality passthrough returns correct verdict at thresholds
  - Multi-modality weighted average math is correct
  - "uncertain" label from an analyzer propagates correctly
  - Empty input raises ValueError
"""

from __future__ import annotations

import pytest

from app.analyzers.base import AnalyzerResult
from app.fusion.engine import FAKE_THRESHOLD, REAL_THRESHOLD, FusionEngine, FusionResult


def make_result(
    modality: str = "image",
    label: str = "fake",
    confidence: float = 0.90,
    signals: dict | None = None,
) -> AnalyzerResult:
    return AnalyzerResult(
        modality=modality,  # type: ignore[arg-type]
        label=label,  # type: ignore[arg-type]
        confidence=confidence,
        signals=signals or {"test_signal": confidence},
        evidence_url=None,
        processing_time_ms=100,
        error_message=None,
    )


class TestFusionEnginePassthrough:
    @pytest.fixture
    def engine(self):
        return FusionEngine()

    def test_high_confidence_fake_returns_fake(self, engine):
        result = make_result("image", "fake", 0.95)
        fusion = engine.fuse([result])
        assert fusion.verdict == "fake"
        assert fusion.final_score == pytest.approx(0.95, abs=0.001)
        assert fusion.method == "passthrough"

    def test_low_confidence_returns_real(self, engine):
        result = make_result("image", "real", 0.05)
        fusion = engine.fuse([result])
        assert fusion.verdict == "real"
        assert fusion.method == "passthrough"

    def test_mid_confidence_returns_uncertain(self, engine):
        result = make_result("audio", "fake", 0.50)
        fusion = engine.fuse([result])
        assert fusion.verdict == "uncertain"

    def test_at_fake_threshold_boundary(self, engine):
        result = make_result("image", "fake", FAKE_THRESHOLD)
        fusion = engine.fuse([result])
        assert fusion.verdict == "fake"

    def test_at_real_threshold_boundary(self, engine):
        result = make_result("image", "real", REAL_THRESHOLD)
        fusion = engine.fuse([result])
        assert fusion.verdict == "real"

    def test_uncertain_label_from_analyzer_stays_uncertain_at_boundary(self, engine):
        result = make_result("image", "uncertain", 0.50)
        fusion = engine.fuse([result])
        assert fusion.verdict == "uncertain"

    def test_weights_sum_to_one(self, engine):
        result = make_result("audio", "fake", 0.88)
        fusion = engine.fuse([result])
        assert sum(fusion.weights.values()) == pytest.approx(1.0, abs=0.001)

    def test_rationale_is_non_empty_string(self, engine):
        result = make_result("image", "fake", 0.80)
        fusion = engine.fuse([result])
        assert isinstance(fusion.rationale, str)
        assert len(fusion.rationale) > 10


class TestFusionEngineWeightedAverage:
    @pytest.fixture
    def engine(self):
        return FusionEngine()

    def test_video_plus_audio_weights(self, engine):
        video_result = make_result("video", "fake", 0.90)
        audio_result = make_result("audio", "fake", 0.80)
        fusion = engine.fuse([video_result, audio_result])

        # Expected: 0.90 * 0.65 + 0.80 * 0.35 = 0.585 + 0.280 = 0.865
        expected_score = 0.90 * 0.65 + 0.80 * 0.35
        assert fusion.final_score == pytest.approx(expected_score, abs=0.001)
        assert fusion.method == "weighted_average"

    def test_video_fake_audio_real_produces_fake_if_high_visual(self, engine):
        video_result = make_result("video", "fake", 0.95)
        audio_result = make_result("audio", "real", 0.10)
        fusion = engine.fuse([video_result, audio_result])
        # 0.95 * 0.65 + 0.10 * 0.35 = 0.6175 + 0.035 = 0.6525 → fake
        assert fusion.verdict == "fake"

    def test_both_real_returns_real(self, engine):
        video_result = make_result("video", "real", 0.10)
        audio_result = make_result("audio", "real", 0.05)
        fusion = engine.fuse([video_result, audio_result])
        # 0.10 * 0.65 + 0.05 * 0.35 = 0.065 + 0.0175 = 0.0825 → real
        assert fusion.verdict == "real"

    def test_returns_fusion_result_type(self, engine):
        video_result = make_result("video", "fake", 0.80)
        audio_result = make_result("audio", "fake", 0.75)
        fusion = engine.fuse([video_result, audio_result])
        assert isinstance(fusion, FusionResult)

    def test_final_score_in_range(self, engine):
        video_result = make_result("video", "fake", 0.85)
        audio_result = make_result("audio", "real", 0.20)
        fusion = engine.fuse([video_result, audio_result])
        assert 0.0 <= fusion.final_score <= 1.0


class TestFusionEngineEdgeCases:
    @pytest.fixture
    def engine(self):
        return FusionEngine()

    def test_empty_list_raises_value_error(self, engine):
        with pytest.raises(ValueError, match="empty"):
            engine.fuse([])

    def test_three_results_video_audio_image_uses_video_weights(self, engine):
        """When video+audio are present, VIDEO_WEIGHTS takes priority over image."""
        results = [
            make_result("image", "fake", 0.90),   # ignored — video branch fires
            make_result("audio", "fake", 0.80),
            make_result("video", "fake", 0.70),
        ]
        fusion = engine.fuse(results)
        # video+audio branch: 0.70×0.65 + 0.80×0.35 = 0.455 + 0.280 = 0.735
        expected = round(0.70 * 0.65 + 0.80 * 0.35, 4)
        assert fusion.final_score == pytest.approx(expected, abs=0.001)
        assert fusion.method == "weighted_average"

    def test_three_image_audio_only_no_video_uses_equal_weights(self, engine):
        """Without video, equal weighting applies across all modalities."""
        results = [
            make_result("image", "fake", 0.90),
            make_result("audio", "fake", 0.80),
        ]
        fusion = engine.fuse(results)
        # Falls into _weighted_average with 2 results but no video+audio combo
        # Wait — audio IS present but video is NOT, so falls to equal weights
        w = round(1.0 / 2, 4)
        expected = round((0.90 + 0.80) * w, 4)
        assert fusion.final_score == pytest.approx(expected, abs=0.001)

