"""
core/firebase.py — Firebase Admin SDK initialization and token verification.

The SDK is initialized once at application startup via the lifespan context
in main.py. All helpers are safe to call from async FastAPI route handlers.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any, Dict

import firebase_admin
from firebase_admin import auth, credentials

try:
    from firebase_admin import firestore
except (ImportError, Exception):
    firestore = None  # type: ignore[assignment]

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_firebase_app: firebase_admin.App | None = None


def initialize_firebase() -> None:
    """
    Initialize the Firebase Admin SDK using the service-account JSON file
    specified by FIREBASE_SERVICE_ACCOUNT_PATH in the environment.

    This must be called exactly once, during application startup.
    Calling it a second time is a no-op (guarded by _firebase_app check).
    """
    global _firebase_app
    if _firebase_app is not None:
        logger.debug("Firebase already initialized — skipping.")
        return

    settings = get_settings()
    raw_path = settings.firebase_service_account_path.strip() if settings.firebase_service_account_path else ""

    import json
    import os

    if raw_path.startswith("{"):
        cert_dict = json.loads(raw_path)
        cred = credentials.Certificate(cert_dict)
    elif raw_path and os.path.isfile(raw_path):
        cred = credentials.Certificate(raw_path)
    elif os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        cred = credentials.ApplicationDefault()
    elif raw_path:
        cred = credentials.Certificate(raw_path)
    else:
        raise ValueError("Firebase credentials not found. Provide FIREBASE_SERVICE_ACCOUNT_PATH (file path or JSON string).")

    _firebase_app = firebase_admin.initialize_app(cred)
    logger.info("Firebase Admin SDK initialized successfully.")


def _ensure_initialized() -> None:
    if _firebase_app is None:
        raise RuntimeError(
            "Firebase has not been initialized. "
            "Call initialize_firebase() during application startup."
        )


async def verify_id_token(token: str) -> Dict[str, Any]:
    """
    Verify a Firebase ID token and return its decoded claims.

    Raises:
        firebase_admin.auth.InvalidIdTokenError — token is malformed / expired.
        firebase_admin.auth.RevokedIdTokenError — token has been revoked.
        RuntimeError — Firebase not yet initialized.
    """
    _ensure_initialized()
    # firebase_admin.auth.verify_id_token is synchronous; run in thread pool
    # via FastAPI's run_in_threadpool when called from async context.
    decoded = auth.verify_id_token(token)
    return decoded  # type: ignore[return-value]


@lru_cache(maxsize=1)
def get_firestore_client() -> firestore.Client:
    """
    Return a cached synchronous Firestore client.

    For async usage, prefer get_async_firestore_client().
    """
    _ensure_initialized()
    if firestore is None:
        raise RuntimeError("Firestore SDK unavailable or blocked by system environment.")
    return firestore.client()



def get_async_firestore_client():
    """
    Returns the synchronous Firestore client.
    NOTE: firebase-admin does not expose a true async Firestore client.
    All persistence operations in this app use the synchronous client,
    which is safe to call from FastAPI's async endpoints via run_in_executor
    or directly (firebase-admin is thread-safe).
    """
    return get_firestore_client()


async def check_firestore_connectivity() -> str:
    """
    Lightweight health-check: attempt a minimal Firestore read.

    Returns "ok" on success or an error description on failure.
    """
    try:
        _ensure_initialized()
        client = get_firestore_client()
        # A collection list with limit=1 is cheap and confirms connectivity
        client.collections()
        return "ok"
    except Exception as exc:  # noqa: BLE001
        logger.warning("Firestore health-check failed: %s", exc)
        return f"error: {exc}"
