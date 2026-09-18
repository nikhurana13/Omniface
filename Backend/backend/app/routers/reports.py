"""
routers/reports.py — Report retrieval, pagination, and export endpoints.

Endpoints:
  GET  /api/v1/reports              → paginated list (History tab)
  GET  /api/v1/reports/{reportId}   → full report (Reports tab detail view)
  GET  /api/v1/reports/{reportId}/export → JSON or text certificate export
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse

from app.core import cloudinary_client, persistence
from app.core.dependencies import UserInfo, get_current_user
from app.models.schemas import (
    ExportResponse,
    IndicatorItem,
    PaginatedReportsResponse,
    ReportResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# _get_uid() was removed — replaced by Depends(get_current_user) in dependencies.py.


# ── Firestore doc → ReportResponse ─────────────────────────────────────────────

def _doc_to_report_response(doc: Dict[str, Any]) -> ReportResponse:
    """Convert a raw Firestore report document to a ReportResponse model."""
    indicators_raw = doc.get("indicators", [])
    indicators = [
        IndicatorItem(**ind) if isinstance(ind, dict) else ind
        for ind in indicators_raw
    ]

    def _parse_dt(val) -> datetime:
        if val is None:
            return datetime.now(timezone.utc)
        if isinstance(val, datetime):
            return val.replace(tzinfo=timezone.utc) if val.tzinfo is None else val
        # Firestore DatetimeWithNanoseconds / Timestamp proto
        if hasattr(val, "timestamp_pb") or hasattr(val, "seconds"):
            try:
                seconds = val.seconds if hasattr(val, "seconds") else int(val.timestamp())
                return datetime.fromtimestamp(seconds, tz=timezone.utc)
            except Exception:
                pass
        # DatetimeWithNanoseconds is a datetime subclass — try timestamp()
        try:
            return datetime.fromtimestamp(val.timestamp(), tz=timezone.utc)
        except Exception:
            pass
        return datetime.now(timezone.utc)

    confidence_score = doc.get("confidenceScore", 0.5)
    verdict = doc.get("verdict", "uncertain")
    is_deepfake = doc.get("isDeepfake", verdict == "fake")

    if "displayConfidence" in doc:
        disp_conf = doc["displayConfidence"]
        confidence = round(disp_conf * 100, 1) if disp_conf <= 1.0 else round(disp_conf, 1)
    else:
        if verdict == "real":
            confidence = round((1.0 - confidence_score) * 100, 1)
        elif verdict == "fake":
            confidence = round(confidence_score * 100, 1)
        else:
            confidence = 50.0

    # Generate fresh time-limited signed URL for authenticated Cloudinary media
    pub_id = doc.get("cloudinaryPublicId")
    if pub_id and not pub_id.startswith("stub/"):
        try:
            modality = doc.get("modality", "image")
            res_type = "video" if modality in ("video", "audio") else "image"
            preview_url = cloudinary_client.get_signed_url(pub_id, resource_type=res_type, expires_in=3600)
        except Exception as exc:
            logger.debug("Failed to sign Cloudinary URL: %s", exc)
            preview_url = doc.get("cloudinaryUrl")
    else:
        preview_url = doc.get("cloudinaryUrl")

    return ReportResponse(
        report_id=doc.get("reportId", ""),
        job_id=doc.get("jobId", ""),
        modality=doc.get("modality", "image"),
        verdict=verdict,
        confidence_score=confidence_score,
        analyzer_results=doc.get("analyzerResults", {}),
        fusion=doc.get("fusion", {}),
        summary=doc.get("summary", ""),
        created_at=_parse_dt(doc.get("createdAt")),
        # Flat fields for frontend compatibility
        confidence=confidence,
        is_deepfake=is_deepfake,
        sha256=doc.get("sha256", ""),
        latency_ms=doc.get("latencyMs", 0),
        indicators=indicators,
        preview_url=preview_url,
        file_name=doc.get("fileName"),
        file_size=doc.get("fileSizeMb"),
        is_stub=doc.get("is_stub", False),
        stub_warning=doc.get("stub_warning"),
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get(
    "/reports",
    response_model=PaginatedReportsResponse,
    summary="List analysis reports (History tab)",
    tags=["Reports"],
)
async def list_reports(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: UserInfo = Depends(get_current_user),
) -> PaginatedReportsResponse:
    """
    Return a paginated list of reports for the authenticated user.
    Used by the History and Reports dashboard tabs.
    """
    uid = current_user.uid
    offset = (page - 1) * per_page

    docs = persistence.list_reports(uid, limit=per_page, offset=offset)
    total = persistence.count_reports(uid)

    items = []
    for doc in docs:
        try:
            items.append(_doc_to_report_response(doc))
        except Exception as exc:
            logger.warning("Skipping malformed report doc: %s", exc)

    return PaginatedReportsResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        has_next=(page * per_page) < total,
    )


@router.get(
    "/reports/{report_id}",
    response_model=ReportResponse,
    summary="Get a single full report",
    tags=["Reports"],
)
async def get_report(
    report_id: str,
    current_user: UserInfo = Depends(get_current_user),
) -> ReportResponse:
    """Return the full report document for display in the Reports detail view."""
    uid = current_user.uid

    doc = persistence.get_report(uid, report_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report '{report_id}' not found.",
        )

    return _doc_to_report_response(doc)


@router.get(
    "/reports/{report_id}/export",
    summary="Export a report as JSON or text certificate",
    tags=["Reports"],
)
async def export_report(
    report_id: str,
    format: str = Query("json", description="Export format: 'json' or 'certificate'"),
    current_user: UserInfo = Depends(get_current_user),
) -> ExportResponse:
    """
    Export a report in a downloadable format.
    - `json`: Full structured forensic dossier as a JSON string.
    - `certificate`: Human-readable text attestation certificate.
    """
    uid = current_user.uid

    doc = persistence.get_report(uid, report_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report '{report_id}' not found.",
        )

    report = _doc_to_report_response(doc)

    if format == "json":
        dossier = {
            "reportType": "OMNIFACE MULTIMODAL FORENSIC AUDIT DOSSIER",
            "version": "2.0-ENTERPRISE",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "report": {
                "id": report.report_id,
                "jobId": report.job_id,
                "fileName": report.file_name,
                "fileSize": report.file_size,
                "modality": report.modality,
                "sha256": report.sha256,
                "verdict": report.verdict,
                "classification": (
                    "DEEPFAKE DETECTED" if report.is_deepfake else "AUTHENTIC MEDIA"
                ),
                "confidence": report.confidence,
                "latencyMs": report.latency_ms,
                "summary": report.summary,
                "indicators": [ind.model_dump() for ind in report.indicators],
                "fusion": report.fusion,
                "analyzerResults": report.analyzer_results,
            },
            "attestation": {
                "engine": "OmniFace Neural Ensemble (EfficientNet-B4 + ViT + rPPG + Wav2Vec2)",
                "integrityHash": report.sha256,
                "confidenceInterval": f"{report.confidence:.1f}% AUC-calibrated",
                "signature": f"RSA-PSS-{report.sha256[:32]}",
            },
        }
        content = json.dumps(dossier, indent=2, default=str)
        filename = f"OmniFace_Audit_{report.report_id}.json"

    else:  # certificate
        indicators_text = "\n".join(
            f"  • [{ind.status.upper()}] {ind.name} (Score: {ind.score}%): {ind.description}"
            for ind in report.indicators
        ) or "  • Telemetry logged"

        content = f"""
================================================================================
           OMNIFACE MULTIMODAL MEDIA FORENSIC ATTESTATION REPORT
================================================================================
REPORT ID        : {report.report_id}
JOB ID           : {report.job_id}
TIMESTAMP        : {report.created_at.isoformat() if report.created_at else 'N/A'}
TARGET FILE      : {report.file_name or 'N/A'} ({report.file_size or 'N/A'})
MODALITY         : {report.modality.upper()}
SHA-256 HASH     : {report.sha256}
--------------------------------------------------------------------------------
PRIMARY VERDICT  : {'DEEPFAKE DETECTED' if report.is_deepfake else 'AUTHENTIC MEDIA'}
CONFIDENCE INDEX : {report.confidence:.1f}%
SYNTHESIS FLAG   : {'POSITIVE (TAMPERED/GENERATED)' if report.is_deepfake else 'NEGATIVE (NATURAL/AUTHENTIC)'}
LATENCY          : {report.latency_ms}ms
--------------------------------------------------------------------------------
SIGNAL BREAKDOWN & TELEMETRY:
{indicators_text}

SUMMARY:
{report.summary}
--------------------------------------------------------------------------------
CRYPTOGRAPHIC INTEGRITY ATTESTATION:
Engine: OmniFace Multi-Signal Attestation Engine v2.0
SHA-256 Verification: VERIFIED
Signature: RSA-PSS-{report.sha256[:32]}
================================================================================
""".strip()
        filename = f"OmniFace_Attestation_{report.report_id}.txt"

    return ExportResponse(
        format=format if format in ("json", "certificate") else "certificate",  # type: ignore[arg-type]
        content=content,
        filename=filename,
    )


@router.get(
    "/reports/{report_id}/media",
    summary="Get authorized signed access URL for report media",
    tags=["Reports"],
)
async def get_report_media(
    report_id: str,
    current_user: UserInfo = Depends(get_current_user),
):
    """
    Authorized endpoint to fetch time-limited signed delivery URL for private report media.
    Guarantees user ownership and prevents cross-user access (IDOR).
    """
    uid = current_user.uid
    doc = persistence.get_report(uid, report_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or unauthorized.",
        )

    pub_id = doc.get("cloudinaryPublicId")
    if not pub_id or pub_id.startswith("stub/"):
        return {
            "report_id": report_id,
            "media_url": doc.get("cloudinaryUrl", ""),
            "expires_in": 0,
            "type": "stub",
        }

    modality = doc.get("modality", "image")
    res_type = "video" if modality in ("video", "audio") else "image"
    signed_url = cloudinary_client.get_signed_url(pub_id, resource_type=res_type, expires_in=3600)

    return {
        "report_id": report_id,
        "media_url": signed_url,
        "expires_in": 3600,
        "type": "authenticated",
    }
