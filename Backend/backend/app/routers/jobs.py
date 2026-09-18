"""
routers/jobs.py — GET /api/v1/jobs/{jobId}

Polling endpoint for video background jobs. Frontend calls this repeatedly
until status == "complete" or "failed".
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.core import persistence
from app.core.dependencies import UserInfo, get_current_user
from app.models.schemas import JobStatusResponse

logger = logging.getLogger(__name__)

router = APIRouter()


async def _get_uid_removed_placeholder() -> None:
    """Placeholder — _get_uid() was removed and replaced by Depends(get_current_user)."""
    pass  # noqa: PIE790


@router.get(
    "/jobs/{job_id}",
    response_model=JobStatusResponse,
    summary="Poll the status of an analysis job",
    tags=["Jobs"],
)
async def get_job_status(
    job_id: str,
    current_user: UserInfo = Depends(get_current_user),
) -> JobStatusResponse:
    """
    Poll the status of a background analysis job (primarily used for video).

    Returns the job status, and when complete, includes the `report_id`
    so the frontend can fetch the full report.
    """
    uid = current_user.uid

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
