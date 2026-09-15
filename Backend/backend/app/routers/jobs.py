"""
routers/jobs.py — GET /api/v1/jobs/{jobId}

Polling endpoint for video background jobs. Frontend calls this repeatedly
until status == "complete" or "failed".
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status

from app.core import persistence
from app.core.firebase import verify_id_token
from app.core.config import get_settings
from app.models.schemas import JobStatusResponse

logger = logging.getLogger(__name__)

router = APIRouter()


async def _get_uid(authorization: Optional[str]) -> str:
    settings = get_settings()
    if not authorization:
        if settings.require_auth:
            raise HTTPException(status_code=401, detail="Authorization required.")
        return "anonymous"
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required.")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        decoded = await verify_id_token(token)
        return decoded["uid"]
    except Exception:
        if settings.require_auth:
            raise HTTPException(status_code=401, detail="Invalid token.")
        return "anonymous"


@router.get(
    "/jobs/{job_id}",
    response_model=JobStatusResponse,
    summary="Poll the status of an analysis job",
    tags=["Jobs"],
)
async def get_job_status(
    job_id: str,
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> JobStatusResponse:
    """
    Poll the status of a background analysis job (primarily used for video).

    Returns the job status, and when complete, includes the `report_id`
    so the frontend can fetch the full report.
    """
    uid = await _get_uid(authorization)

    job = persistence.get_job(uid, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )

    def _parse_dt(val) -> datetime:
        if val is None:
            return datetime.now(timezone.utc)
        if isinstance(val, datetime):
            return val.replace(tzinfo=timezone.utc) if val.tzinfo is None else val
        # Firestore DatetimeWithNanoseconds / Timestamp → use its own timestamp()
        if hasattr(val, "timestamp_pb") or hasattr(val, "seconds"):
            try:
                import calendar
                seconds = val.seconds if hasattr(val, "seconds") else int(val.timestamp())
                return datetime.fromtimestamp(seconds, tz=timezone.utc)
            except Exception:
                pass
        # Try converting via timestamp() method (DatetimeWithNanoseconds is a datetime subclass)
        try:
            return datetime.fromtimestamp(val.timestamp(), tz=timezone.utc)
        except Exception:
            pass
        return datetime.now(timezone.utc)

    return JobStatusResponse(
        job_id=job_id,
        status=job.get("status", "queued"),
        modality=job.get("modality", "unknown"),
        report_id=job.get("reportId"),
        error_message=job.get("errorMessage"),
        created_at=_parse_dt(job.get("createdAt")),
        updated_at=_parse_dt(job.get("updatedAt")),
    )
