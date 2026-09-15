"""
fusion/engine.py — Fusion Engine that combines AnalyzerResult(s) into a final verdict.

For single-modality files: normalizes and passes through.
For video: weighted ensemble of visual frame scores + audio track score.
Produces a FusionResult containing the final verdict, confidence, weights, and rationale.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Literal

from app.analyzers.base import AnalyzerResult

logger = logging.getLogger(__name__)

# Confidence threshold above which we call "fake", below which we call "real"
FAKE_THRESHOLD = 0.60
REAL_THRESHOLD = 0.40


@dataclass(frozen=True)
class FusionResult:
    method: str
    weights: Dict[str, float]
    final_score: float          # 0.0 = real, 1.0 = fake
    verdict: Literal["real", "fake", "uncertain"]
    rationale: str


class FusionEngine:
    """
    Combines one or more AnalyzerResult objects into an authoritative verdict.

    Supported fusion methods:
        - "passthrough" — single modality result, normalized directly
        - "weighted_average" — for video: visual (0.65) + audio (0.35)
    """

    # Default weights for video fusion (visual + audio)
    VIDEO_WEIGHTS: Dict[str, float] = {
        "video": 0.65,
        "audio": 0.35,
    }

    def fuse(self, results: List[AnalyzerResult]) -> FusionResult:
        """
        Fuse a list of AnalyzerResult objects into a single FusionResult.

        Args:
            results: One result for image/audio; two results (video + audio) for video.

        Returns:
            FusionResult — always returns, never raises.

        Raises:
            ValueError if results list is empty.
        """
        if not results:
            raise ValueError("FusionEngine.fuse() called with empty results list.")

        # ── Single modality: passthrough ───────────────────────────────────────
        if len(results) == 1:
            return self._passthrough(results[0])

        # ── Multi-modality (video + audio): weighted average ───────────────────
        return self._weighted_average(results)

    def _passthrough(self, result: AnalyzerResult) -> FusionResult:
        """Direct pass-through for single-modality (image or audio) results."""
        score = result.confidence
        if result.label == "uncertain":
            verdict: Literal["real", "fake", "uncertain"] = "uncertain"
        elif score >= FAKE_THRESHOLD:
            verdict = "fake"
        elif score <= REAL_THRESHOLD:
            verdict = "real"
        else:
            verdict = "uncertain"

        rationale = (
            f"Single-modality {result.modality} analysis yielded confidence={score:.3f}. "
            f"Label '{result.label}' from analyzer; verdict='{verdict}' "
            f"(thresholds: fake>={FAKE_THRESHOLD}, real<={REAL_THRESHOLD})."
        )

        logger.info(
            "Fusion passthrough: modality=%s score=%.3f verdict=%s",
            result.modality, score, verdict,
        )
        return FusionResult(
            method="passthrough",
            weights={result.modality: 1.0},
            final_score=round(score, 4),
            verdict=verdict,
            rationale=rationale,
        )

    def _weighted_average(self, results: List[AnalyzerResult]) -> FusionResult:
        """
        Weighted ensemble for multi-modality results.
        Currently supports video (visual) + audio combinations.
        """
        modality_map: Dict[str, AnalyzerResult] = {r.modality: r for r in results}

        weights = {}
        if "video" in modality_map and "audio" in modality_map:
            weights = {"video": self.VIDEO_WEIGHTS["video"], "audio": self.VIDEO_WEIGHTS["audio"]}
        else:
            w = round(1.0 / len(results), 4)
            weights = {r.modality: w for r in results}

        final_score = sum(
            modality_map[mod].confidence * w
            for mod, w in weights.items()
            if mod in modality_map
        )
        final_score = round(final_score, 4)

        any_uncertain = any(r.label == "uncertain" for r in results)
        if any_uncertain and final_score >= 0.45 and final_score <= 0.65:
            verdict: Literal["real", "fake", "uncertain"] = "uncertain"
        elif final_score >= FAKE_THRESHOLD:
            verdict = "fake"
        elif final_score <= REAL_THRESHOLD:
            verdict = "real"
        else:
            verdict = "uncertain"

        component_summaries = ", ".join(
            f"{mod}={modality_map[mod].confidence:.3f}x{w}"
            for mod, w in weights.items()
            if mod in modality_map
        )
        rationale = (
            f"Weighted ensemble fusion ({component_summaries}) -> "
            f"final_score={final_score:.3f}, verdict='{verdict}'."
        )

        logger.info(
            "Fusion weighted_average: components=%s final_score=%.3f verdict=%s",
            component_summaries, final_score, verdict,
        )
        return FusionResult(
            method="weighted_average",
            weights=weights,
            final_score=final_score,
            verdict=verdict,
            rationale=rationale,
        )
