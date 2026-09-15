"""
core/config.py — Application settings loaded from environment variables.

All secrets (Firebase, Cloudinary) MUST be provided via .env or environment.
Hardcoded credential defaults have been intentionally removed for security.
"""

from __future__ import annotations

from functools import lru_cache
from typing import List

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(_ENV_FILE), ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Environment ────────────────────────────────────────────────────────────
    # Set to "production" to disable Swagger UI and tighten security defaults.
    environment: str = "production"

    # Set to True ONLY during local development — never in production.
    debug: bool = False

    # ── Firebase ──────────────────────────────────────────────────────────────
    # Path to the Firebase Admin SDK service account JSON file.
    # In production, use GOOGLE_APPLICATION_CREDENTIALS or pass JSON content.
    # REQUIRED — no default provided intentionally.
    firebase_service_account_path: str = ""

    # ── Cloudinary ────────────────────────────────────────────────────────────
    # REQUIRED — no defaults provided intentionally.
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # ── HuggingFace ───────────────────────────────────────────
    # Free token from https://huggingface.co/settings/tokens
    # Optional — improves rate limits on the Inference API.
    huggingface_api_token: str = ""

    # ── Auth ─────────────────────────────────────────────────────────────────
    # MUST be True in production — requires valid Firebase ID tokens.
    # Setting False is ONLY for local development/testing.
    require_auth: bool = True

    # ── Upload limits ─────────────────────────────────────────────────────────
    max_file_size_mb: int = 100

    allowed_mime_types: List[str] = [
        # Images
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/bmp",
        "image/tiff",
        # Audio
        "audio/mpeg",
        "audio/wav",
        "audio/x-wav",
        "audio/ogg",
        "audio/flac",
        "audio/mp4",
        "audio/aac",
        "audio/webm",
        # Video
        "video/mp4",
        "video/quicktime",
        "video/x-msvideo",
        "video/webm",
        "video/mpeg",
        "video/x-matroska",
        "video/ogg",
    ]

    # ── CORS ──────────────────────────────────────────────────────────────────
    # List of allowed origins for CORS.
    # Replace localhost URLs with your production frontend URL before deploying.
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # ── Background job timeout ────────────────────────────────────────────────
    # Maximum seconds a video background job may run before being marked failed.
    job_timeout_seconds: int = 300

    # ── Video frame sampling ─────────────────────────────────────────────────
    video_frame_sample_count: int = 8

    # ── Rate limiting ─────────────────────────────────────────────────────────
    rate_limit_analyze: str = "10/minute"

    # ── Filename safety ────────────────────────────────────────────────────────
    max_filename_length: int = 200

    # ── ML Inference / Stub Mode ──────────────────────────────────────────────
    # True = development stub mode (models return randomized valid signals with warnings).
    # False = production mode (real models MUST be loaded; if not loaded, fails closed).
    # WARNING: Must be False in true production environments to avoid treating random
    # results as real forensic detection.
    ml_stub_mode: bool = True

    @field_validator("max_file_size_mb")
    @classmethod
    def validate_file_size(cls, v: int) -> int:
        if v <= 0 or v > 1000:
            raise ValueError("max_file_size_mb must be between 1 and 1000")
        return v

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def docs_enabled(self) -> bool:
        """Swagger UI / ReDoc / OpenAPI schema are only enabled outside production."""
        return not self.is_production


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached Settings singleton."""
    return Settings()  # type: ignore[call-arg]
