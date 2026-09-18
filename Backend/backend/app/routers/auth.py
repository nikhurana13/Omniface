"""
routers/auth.py — Authentication endpoints using Firebase as the JWT provider.

Firebase ID tokens are RS256-signed JWTs issued by Google's secure token
service. This router does NOT handle registration or login — the Firebase
client SDK handles those client-side. This router provides:

  GET  /api/v1/auth/me      — Return current user's profile from Firestore / JWT claims
  POST /api/v1/auth/logout  — Server-side token revocation via Firebase Admin SDK

Why only 2 endpoints?
  /register → Firebase createUserWithEmailAndPassword() (client-side, no backend needed)
  /login    → Firebase signInWithEmailAndPassword()    (client-side, no backend needed)
  /refresh  → Firebase SDK auto-refreshes tokens every hour (client-side, no backend needed)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from firebase_admin import auth as firebase_auth

from app.core.dependencies import UserInfo, get_current_user
from app.core import persistence
from app.models.schemas import MessageResponse, UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── GET /api/v1/auth/me ───────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get authenticated user profile",
    description=(
        "Returns the profile of the currently authenticated user. "
        "Data is read from Firestore users/{uid}, falling back to Firebase JWT claims "
        "if the Firestore document does not exist yet."
    ),
)
async def get_me(
    current_user: UserInfo = Depends(get_current_user),
) -> UserResponse:
    """
    Return the authenticated user's profile.

    Attempts to fetch the full profile from Firestore (populated by upsert_user
    on every authenticated request). Falls back to JWT claims if unavailable.
    """
    doc: dict | None = None
    try:
        doc = persistence.get_user_by_uid(current_user.uid)
    except Exception as exc:
        logger.debug("Could not fetch user from Firestore: %s", exc)

    if doc:
        return UserResponse(
            id=current_user.uid,
            name=doc.get("displayName") or current_user.name,
            email=doc.get("email") or current_user.email,
            role=doc.get("role", current_user.role),
            avatar_url=doc.get("avatarUrl"),
            created_at=doc.get("createdAt"),
            last_login_at=doc.get("updatedAt"),
        )

    # Fallback: construct response from JWT claims when Firestore is unavailable
    logger.debug("User doc not found in Firestore for uid=%s — using JWT claims", current_user.uid)
    return UserResponse(
        id=current_user.uid,
        name=current_user.name,
        email=current_user.email,
        role=current_user.role,
    )


# ── POST /api/v1/auth/logout ──────────────────────────────────────────────────

@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Server-side logout — revoke Firebase refresh tokens",
    description=(
        "Revokes all Firebase refresh tokens for the user server-side via the Admin SDK. "
        "This invalidates all existing sessions across all devices. "
        "The client should also call Firebase signOut() to clear local state."
    ),
)
async def logout(
    current_user: UserInfo = Depends(get_current_user),
) -> MessageResponse:
    """
    Server-side logout: revoke Firebase refresh tokens for this user.

    After revocation, all existing Firebase ID tokens will fail verification
    within the token's remaining lifetime (max 1 hour for Firebase tokens).
    For immediate invalidation, the client must also call Firebase signOut().
    """
    if current_user.uid == "anonymous":
        return MessageResponse(message="Already logged out.")

    try:
        firebase_auth.revoke_refresh_tokens(current_user.uid)
        logger.info("Revoked Firebase refresh tokens for uid=%s", current_user.uid)
    except Exception as exc:
        # Non-fatal: client-side Firebase signOut() will clear local session
        # even if the server-side revocation fails.
        logger.warning(
            "Failed to revoke Firebase refresh tokens for uid=%s: %s",
            current_user.uid,
            exc,
        )

    return MessageResponse(message="Logged out successfully.")
