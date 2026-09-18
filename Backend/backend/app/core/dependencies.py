"""
core/dependencies.py — Centralized FastAPI authentication dependency.

Replaces the duplicated _get_uid() / _get_uid_from_token() helpers that were
previously scattered across analyze.py, reports.py, and jobs.py.

All protected routes now use Depends(get_current_user) instead of reading
the Authorization header individually in every router.

Authentication Strategy:
  Firebase ID tokens ARE RS256-signed JWTs issued by Google's secure token
  service (https://securetoken.google.com). verify_id_token() in firebase.py
  is the JWT verification layer — no additional JWT library needed.

Flow:
  Authorization: Bearer <firebase_id_token>
        ↓
  verify_id_token(token)          [firebase.py]
        ↓
  Decoded claims {uid, email, ...}
        ↓
  upsert_user() — sync profile to Firestore
        ↓
  Return UserInfo dataclass
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from fastapi import Depends, Header, HTTPException, status

from app.core.config import get_settings
from app.core.firebase import verify_id_token
from app.core import persistence

logger = logging.getLogger(__name__)


@dataclass
class UserInfo:
    """
    Authenticated user information extracted from a verified Firebase JWT.
    Passed to route handlers via Depends(get_current_user).
    """
    uid: str
    email: str
    name: str
    role: str = field(default="investigator")


async def get_current_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> UserInfo:
    """
    FastAPI dependency — verifies a Firebase ID token (JWT) from the
    Authorization: Bearer header and returns the authenticated user.

    Firebase ID tokens are RS256-signed JWTs validated cryptographically
    by firebase_admin.auth.verify_id_token():
      - Signature verified against Google's public keys
      - Expiry (exp) checked
      - Issuer (iss) validated against project
      - Audience (aud) validated against Firebase project ID

    Dev mode (REQUIRE_AUTH=False):
      Missing header → returns anonymous UserInfo (existing behavior preserved).

    Raises:
      HTTPException 401 — missing, malformed, or expired token (when REQUIRE_AUTH=True).
    """
    settings = get_settings()

    # ── No Authorization header ───────────────────────────────────────────────
    if not authorization:
        if settings.require_auth:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization header required.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Development mode: allow anonymous access
        logger.debug("No auth header — returning anonymous user (REQUIRE_AUTH=False)")
        return UserInfo(uid="anonymous", email="", name="Anonymous")

    # ── Wrong scheme ──────────────────────────────────────────────────────────
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must use Bearer scheme.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.removeprefix("Bearer ").strip()

    # ── Verify Firebase JWT ───────────────────────────────────────────────────
    try:
        decoded = await verify_id_token(token)
    except Exception as exc:
        logger.warning("Firebase token verification failed: %s", exc)
        if settings.require_auth:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired Firebase ID token.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Dev mode fallback: allow request with anonymous identity
        return UserInfo(uid="anonymous", email="", name="Anonymous")

    # ── Extract claims ────────────────────────────────────────────────────────
    uid: str = decoded.get("uid") or decoded.get("sub", "")
    email: str = decoded.get("email", "")
    name: str = decoded.get("name", "")

    # Derive display name from email if Firebase displayName not set
    if not name and email:
        local_part = email.split("@")[0]
        name = local_part.replace(".", " ").replace("_", " ").title()

    # ── Sync user profile in Firestore (idempotent, non-blocking) ────────────
    # This keeps email, displayName, and last_login_at current in Firestore
    # without requiring a separate login endpoint.
    try:
        persistence.upsert_user(uid, {
            "email": email,
            "displayName": name,
        })
    except Exception as exc:
        # Non-critical: the user is authenticated even if the Firestore sync fails
        logger.debug("User Firestore upsert skipped (non-critical): %s", exc)

    return UserInfo(uid=uid, email=email, name=name)
