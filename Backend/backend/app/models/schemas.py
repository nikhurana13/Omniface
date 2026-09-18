"""
models/schemas.py — All Pydantic request/response models for OmniFace API.

These are the typed contracts between the FastAPI backend and the Next.js frontend.
Every endpoint returns one of these models — no raw dicts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ── Sub-models ─────────────────────────────────────────────────────────────────

class IndicatorItem(BaseModel):
    """Maps to the frontend's AnalysisIndicator type."""
    name: str
    score: float = Field(..., ge=0, le=100, description="Score 0–100")
    status: Literal["normal", "suspicious", "anomalous"]
    description: str


class ImageAnalyzerResult(BaseModel):
    label: Literal["real", "fake", "uncertain"]
    confidence: float = Field(..., ge=0.0, le=1.0)
    signals: Dict[str, float]
    heatmap_url: Optional[str] = None
    processing_time_ms: int


class AudioAnalyzerResult(BaseModel):
    label: Literal["real", "fake", "uncertain"]
    confidence: float = Field(..., ge=0.0, le=1.0)
    signals: Dict[str, float]
    spectrogram_url: Optional[str] = None
    processing_time_ms: int


class VideoAnalyzerResult(BaseModel):
    label: Literal["real", "fake", "uncertain"]
    confidence: float = Field(..., ge=0.0, le=1.0)
    signals: Dict[str, float]
    frame_scores: List[float] = Field(default_factory=list)
    audio_result: Optional[AudioAnalyzerResult] = None
    processing_time_ms: int


class FusionResult(BaseModel):
    method: str
    weights: Dict[str, float]
    final_score: float = Field(..., ge=0.0, le=1.0)
    rationale: str


# ── API Response Models ────────────────────────────────────────────────────────

class AnalyzeResponse(BaseModel):
    """
    Response from POST /api/v1/analyze.

    For image/audio: all fields populated synchronously.
    For video: only job_id and status="processing" are returned; frontend polls /jobs/{jobId}.
    """
    job_id: str
    status: Literal["complete", "processing"]

    # Populated on synchronous completion (image/audio fast-path)
    report_id: Optional[str] = None
    confidence: Optional[float] = None         # 0–1 float (frontend multiplies ×100)
    is_deepfake: Optional[bool] = None
    sha256: Optional[str] = None
    latency_ms: Optional[int] = None
    verdict: Optional[Literal["real", "fake", "uncertain"]] = None
    indicators: Optional[List[IndicatorItem]] = None
    summary: Optional[str] = None
    modality: Optional[Literal["image", "audio", "video"]] = None

    # ML stub isolation & disclosure
    is_stub: Optional[bool] = Field(False, description="True if inference was produced by dev stub instead of real trained models")
    stub_warning: Optional[str] = Field(None, description="Disclaimer when running in development stub mode")


class JobStatusResponse(BaseModel):
    """Response from GET /api/v1/jobs/{jobId}."""
    job_id: str
    status: Literal["queued", "processing", "complete", "failed"]
    modality: str
    report_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict()


class ReportResponse(BaseModel):
    """
    Full report object returned by GET /api/v1/reports/{reportId}.
    Contains both the rich Firestore schema AND the flat fields the frontend reads.
    """
    report_id: str
    job_id: str
    modality: Literal["image", "audio", "video"]
    verdict: Literal["real", "fake", "uncertain"]
    confidence_score: float = Field(..., ge=0.0, le=1.0)

    analyzer_results: Dict[str, Any] = Field(default_factory=dict)
    fusion: Dict[str, Any] = Field(default_factory=dict)
    summary: str

    created_at: datetime

    # Flat fields the frontend's analysis.ts reads directly
    # NOTE: `confidence` here is 0–100 (percentage, ready to display)
    # whereas AnalyzeResponse.confidence is 0–1 (fraction, frontend multiplies ×100).
    confidence: float = Field(..., ge=0.0, le=100.0, description="Display confidence 0–100%")
    is_deepfake: bool
    sha256: str
    latency_ms: int
    indicators: List[IndicatorItem] = Field(default_factory=list)

    # Optional preview/media URL
    preview_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[str] = None

    # ML stub isolation & disclosure
    is_stub: bool = Field(False, description="True if inference was produced by dev stub instead of real trained models")
    stub_warning: Optional[str] = Field(None, description="Disclaimer when running in development stub mode")

    model_config = ConfigDict()


class PaginatedReportsResponse(BaseModel):
    """Response from GET /api/v1/reports (paginated list for History tab)."""
    items: List[ReportResponse]
    total: int
    page: int
    per_page: int
    has_next: bool


class ExportResponse(BaseModel):
    """Response from GET /api/v1/reports/{id}/export."""
    format: Literal["json", "certificate"]
    content: str        # JSON string or text certificate
    filename: str


class HealthResponse(BaseModel):
    """Response from GET /health."""
    status: Literal["ok", "degraded", "error"]
    firestore: str
    cloudinary: str
    timestamp: datetime

    model_config = ConfigDict()


# ── Error Models ───────────────────────────────────────────────────────────────

class ErrorDetail(BaseModel):
    code: str
    message: str
    field: Optional[str] = None


class ErrorResponse(BaseModel):
    """Standard error envelope returned on all 4xx/5xx responses."""
    error: ErrorDetail


# ── Auth Response Models ───────────────────────────────────────────────────────

class UserResponse(BaseModel):
    """
    Authenticated user profile returned by GET /api/v1/auth/me.

    Firebase manages credentials — hashed_password is never stored here.
    All identity data comes from the Firebase JWT claims or Firestore user doc.
    """
    id: str = Field(..., description="Firebase UID")
    name: str = Field(..., description="User display name")
    email: str = Field(..., description="User email address")
    role: str = Field(default="investigator", description="User role: investigator | analyst | admin")
    avatar_url: Optional[str] = Field(None, description="Profile picture URL")
    created_at: Optional[datetime] = Field(None, description="Account creation timestamp (UTC)")
    last_login_at: Optional[datetime] = Field(None, description="Last successful login (UTC)")

    model_config = ConfigDict()


class MessageResponse(BaseModel):
    """Generic message response — used by POST /api/v1/auth/logout."""
    message: str
