"""
core/persistence.py — Firestore CRUD helpers scoped strictly to users/{uid}.

Every write uses set(..., merge=True) for idempotency — safe to retry on failure.
Reads are always scoped to the authenticated user's subcollections; no top-level scans.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    from google.cloud import firestore
except (ImportError, Exception):
    firestore = None  # type: ignore[assignment]

from app.core.firebase import get_firestore_client

logger = logging.getLogger(__name__)

# ── In-memory fallback store (used when Firestore is not available) ───────────
_mem_users: Dict[str, Dict[str, Any]] = {}
_mem_jobs: Dict[str, Dict[str, Dict[str, Any]]] = {}
_mem_reports: Dict[str, Dict[str, Dict[str, Any]]] = {}


# ── Collection path helpers ────────────────────────────────────────────────────

def _jobs_col(uid: str) -> Any:
    return get_firestore_client().collection("users").document(uid).collection("jobs")


def _reports_col(uid: str) -> Any:
    return get_firestore_client().collection("users").document(uid).collection("reports")


def _user_doc(uid: str) -> Any:
    return get_firestore_client().collection("users").document(uid)


# ── User ───────────────────────────────────────────────────────────────────────

def upsert_user(uid: str, data: Dict[str, Any]) -> None:
    """
    Create or update a user document. Idempotent — safe to call on every login.
    """
    now = datetime.now(timezone.utc)
    try:
        doc = _user_doc(uid)
        doc.set(
            {**data, "updatedAt": now},
            merge=True,
        )
        logger.debug("Upserted user doc for uid=%s", uid)
    except Exception as exc:
        logger.debug("Firestore unavailable, using memory fallback for user %s: %s", uid, exc)
        current = _mem_users.get(uid, {})
        _mem_users[uid] = {**current, **data, "updatedAt": now}


# ── Jobs ───────────────────────────────────────────────────────────────────────

def create_job(uid: str, job_id: str, job_data: Dict[str, Any]) -> str:
    """
    Write a new job document. Returns job_id.

    Uses set(merge=True) so re-submission with the same job_id is safe.
    """
    now = datetime.now(timezone.utc)
    full_data = {
        **job_data,
        "jobId": job_id,
        "uid": uid,
        "createdAt": now,
        "updatedAt": now,
    }
    try:
        doc = _jobs_col(uid).document(job_id)
        doc.set(full_data, merge=True)
        logger.info("Created job doc: uid=%s job_id=%s", uid, job_id)
    except Exception as exc:
        logger.debug("Firestore unavailable, storing job in memory for %s: %s", job_id, exc)
        if uid not in _mem_jobs:
            _mem_jobs[uid] = {}
        _mem_jobs[uid][job_id] = full_data
    return job_id


def update_job(uid: str, job_id: str, updates: Dict[str, Any]) -> None:
    """
    Partial update to a job document (merge=True).
    Always stamps updatedAt.
    """
    now = datetime.now(timezone.utc)
    try:
        doc = _jobs_col(uid).document(job_id)
        doc.set(
            {**updates, "updatedAt": now},
            merge=True,
        )
        logger.debug("Updated job: uid=%s job_id=%s fields=%s", uid, job_id, list(updates.keys()))
    except Exception as exc:
        logger.debug("Firestore unavailable, updating job in memory for %s: %s", job_id, exc)
        if uid in _mem_jobs and job_id in _mem_jobs[uid]:
            _mem_jobs[uid][job_id].update({**updates, "updatedAt": now})


def get_job(uid: str, job_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single job document. Returns None if not found."""
    try:
        doc = _jobs_col(uid).document(job_id).get()
        return doc.to_dict() if doc.exists else None
    except Exception as exc:
        logger.debug("Firestore unavailable, reading job from memory for %s: %s", job_id, exc)
        return _mem_jobs.get(uid, {}).get(job_id)


# ── Reports ────────────────────────────────────────────────────────────────────

def create_report(uid: str, report_id: str, report_data: Dict[str, Any]) -> str:
    """
    Write a new report document. Returns report_id.
    Idempotent — safe to retry on transient failures.
    """
    now = datetime.now(timezone.utc)
    full_data = {
        **report_data,
        "reportId": report_id,
        "uid": uid,
        "createdAt": now,
    }
    try:
        doc = _reports_col(uid).document(report_id)
        doc.set(full_data, merge=True)
        logger.info("Created report doc: uid=%s report_id=%s", uid, report_id)
    except Exception as exc:
        logger.debug("Firestore unavailable, storing report in memory for %s: %s", report_id, exc)
        if uid not in _mem_reports:
            _mem_reports[uid] = {}
        _mem_reports[uid][report_id] = full_data
    return report_id


def get_report(uid: str, report_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single report document. Returns None if not found."""
    try:
        doc = _reports_col(uid).document(report_id).get()
        return doc.to_dict() if doc.exists else None
    except Exception as exc:
        logger.debug("Firestore unavailable, reading report from memory for %s: %s", report_id, exc)
        return _mem_reports.get(uid, {}).get(report_id)


def list_reports(
    uid: str,
    limit: int = 20,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """
    List reports for a user, ordered by createdAt descending.

    Firestore does not support native offset pagination efficiently at scale;
    for MVP we fetch limit+offset and slice. Upgrade path: cursor-based pagination
    using createdAt timestamp as the page token.
    """
    try:
        query = (
            _reports_col(uid)
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit + offset)
        )
        docs = query.stream()
        results = [d.to_dict() for d in docs]
        return results[offset : offset + limit]
    except Exception as exc:
        logger.debug("Firestore unavailable, listing reports from memory for uid %s: %s", uid, exc)
        user_reports = list(_mem_reports.get(uid, {}).values())
        user_reports.sort(
            key=lambda r: r.get("createdAt") or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        return user_reports[offset : offset + limit]


def count_reports(uid: str) -> int:
    """Return total report count for a user (used for pagination metadata)."""
    try:
        result = _reports_col(uid).count().get()
        return result[0][0].value  # type: ignore[index]
    except Exception as exc:
        logger.debug("Firestore unavailable, counting reports from memory for uid %s: %s", uid, exc)
        return len(_mem_reports.get(uid, {}))


# ── User reads ────────────────────────────────────────────────────────────────

def get_user_by_uid(uid: str) -> Optional[Dict[str, Any]]:
    """
    Fetch the Firestore user document for a given UID.

    Returns the document as a dict, or None if the user does not exist.
    Used by GET /api/v1/auth/me to populate the full UserResponse.

    Falls back to the in-memory store when Firestore is unavailable.
    """
    try:
        doc = _user_doc(uid).get()
        return doc.to_dict() if doc.exists else None
    except Exception as exc:
        logger.debug("Firestore unavailable, reading user from memory for uid %s: %s", uid, exc)
        return _mem_users.get(uid) or None

