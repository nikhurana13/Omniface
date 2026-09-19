"""
tests/test_auth.py — Unit and integration tests for Firebase JWT authentication.

Tests mock firebase_admin.auth.verify_id_token to avoid real Firebase calls.
All tests use the FastAPI TestClient to exercise the full request/response cycle.

Test Coverage:
  - get_current_user() dependency (missing header, wrong scheme, invalid token)
  - GET /api/v1/auth/me (valid token, no token, Firestore fallback)
  - POST /api/v1/auth/logout (valid token, no token, revocation)
  - Backward compatibility: REQUIRE_AUTH=False anonymous access
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    """TestClient for the full FastAPI app."""
    from app.main import app
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture
def decoded_token() -> dict:
    """A decoded Firebase token payload (as returned by verify_id_token)."""
    return {
        "uid": "test_uid_firebase_abc123",
        "sub": "test_uid_firebase_abc123",
        "email": "analyst@omniface.test",
        "name": "Test Analyst",
        "email_verified": True,
    }


@pytest.fixture
def auth_header() -> dict[str, str]:
    """Authorization header containing a mock Bearer token."""
    return {"Authorization": "Bearer mock_firebase_id_token_xyz"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _patch_firebase(decoded: dict):
    """Context manager: mock verify_id_token to return decoded payload."""
    return patch.multiple(
        "app.core.firebase",
        _firebase_app=MagicMock(),
        auth=MagicMock(verify_id_token=MagicMock(return_value=decoded), revoke_refresh_tokens=MagicMock()),
    )


def _patch_firebase_error(exc: Exception):
    """Context manager: mock verify_id_token to raise an exception."""
    return patch.multiple(
        "app.core.firebase",
        _firebase_app=MagicMock(),
        auth=MagicMock(verify_id_token=MagicMock(side_effect=exc)),
    )


# ── TestGetCurrentUserDependency ──────────────────────────────────────────────

class TestGetCurrentUserDependency:
    """Tests for the get_current_user() FastAPI dependency in core/dependencies.py."""

    def test_missing_header_require_auth_true(self, client):
        """No Authorization header + REQUIRE_AUTH=True → 401."""
        with patch("app.core.dependencies.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(require_auth=True)
            response = client.get("/api/v1/auth/me")
        assert response.status_code == 401

    def test_wrong_scheme_basic(self, client):
        """Authorization: Basic ... → 401 (not Bearer)."""
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )
        assert response.status_code == 401

    def test_wrong_scheme_empty_bearer(self, client):
        """Authorization: Bearer (no token) → 401."""
        with patch("app.core.dependencies.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(require_auth=True)
            response = client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer "},
            )
        # Either 401 from decode failure or from empty token
        assert response.status_code in (401, 422)

    def test_invalid_token_signature(self, client, auth_header):
        """Malformed / wrong-key token → 401."""
        with _patch_firebase_error(Exception("invalid signature")), \
             patch("app.core.dependencies.get_settings") as mock_settings, \
             patch("app.core.dependencies.persistence.upsert_user"):
            mock_settings.return_value = MagicMock(require_auth=True)
            response = client.get("/api/v1/auth/me", headers=auth_header)
        assert response.status_code == 401

    def test_expired_token(self, client, auth_header):
        """Expired Firebase token → 401."""
        with _patch_firebase_error(Exception("Token expired")), \
             patch("app.core.dependencies.get_settings") as mock_settings, \
             patch("app.core.dependencies.persistence.upsert_user"):
            mock_settings.return_value = MagicMock(require_auth=True)
            response = client.get("/api/v1/auth/me", headers=auth_header)
        assert response.status_code == 401

    def test_valid_token_passes(self, client, auth_header, decoded_token):
        """Valid Firebase token → dependency resolves, request succeeds."""
        with _patch_firebase(decoded_token), \
             patch("app.core.dependencies.persistence.upsert_user"), \
             patch("app.core.persistence.get_user_by_uid", return_value=None):
            response = client.get("/api/v1/auth/me", headers=auth_header)
        assert response.status_code == 200


# ── TestAuthMeEndpoint ────────────────────────────────────────────────────────

class TestAuthMeEndpoint:
    """Tests for GET /api/v1/auth/me."""

    def test_me_with_valid_token_jwt_fallback(self, client, auth_header, decoded_token):
        """Valid token + no Firestore doc → returns profile from JWT claims."""
        with _patch_firebase(decoded_token), \
             patch("app.core.dependencies.persistence.upsert_user"), \
             patch("app.core.persistence.get_user_by_uid", return_value=None):
            response = client.get("/api/v1/auth/me", headers=auth_header)

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == decoded_token["uid"]
        assert data["email"] == decoded_token["email"]
        assert data["name"] == decoded_token["name"]
        assert data["role"] == "investigator"

    def test_me_with_valid_token_firestore_data(self, client, auth_header, decoded_token):
        """Valid token + Firestore doc exists → returns enriched profile."""
        firestore_doc = {
            "email": "analyst@omniface.test",
            "displayName": "Senior Analyst",
            "role": "analyst",
            "avatarUrl": "https://example.com/avatar.jpg",
            "createdAt": None,
            "updatedAt": None,
        }
        with _patch_firebase(decoded_token), \
             patch("app.core.dependencies.persistence.upsert_user"), \
             patch("app.core.persistence.get_user_by_uid", return_value=firestore_doc):
            response = client.get("/api/v1/auth/me", headers=auth_header)

        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "analyst"
        assert data["name"] == "Senior Analyst"
        assert data["avatar_url"] == "https://example.com/avatar.jpg"

    def test_me_no_token(self, client):
        """No Authorization header → 401 when REQUIRE_AUTH=True."""
        with patch("app.core.dependencies.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                require_auth=True,
                firebase_service_account_path="",
                allowed_mime_types=[],
                max_file_size_mb=100,
                max_filename_length=255,
                job_timeout_seconds=300,
                cors_origins=["*"],
            )
            response = client.get("/api/v1/auth/me")
        assert response.status_code == 401

    def test_me_response_has_no_password_field(self, client, auth_header, decoded_token):
        """Ensure hashed_password is never present in UserResponse."""
        with _patch_firebase(decoded_token), \
             patch("app.core.dependencies.persistence.upsert_user"), \
             patch("app.core.persistence.get_user_by_uid", return_value=None):
            response = client.get("/api/v1/auth/me", headers=auth_header)

        data = response.json()
        assert "password" not in data
        assert "hashed_password" not in data

    def test_me_response_schema(self, client, auth_header, decoded_token):
        """Validate UserResponse schema fields."""
        with _patch_firebase(decoded_token), \
             patch("app.core.dependencies.persistence.upsert_user"), \
             patch("app.core.persistence.get_user_by_uid", return_value=None):
            response = client.get("/api/v1/auth/me", headers=auth_header)

        data = response.json()
        required_fields = {"id", "name", "email", "role"}
        assert required_fields.issubset(data.keys()), (
            f"Missing fields: {required_fields - data.keys()}"
        )


# ── TestAuthLogoutEndpoint ────────────────────────────────────────────────────

class TestAuthLogoutEndpoint:
    """Tests for POST /api/v1/auth/logout."""

    def test_logout_valid_token(self, client, auth_header, decoded_token):
        """Valid token → 200 + success message + Firebase tokens revoked."""
        with _patch_firebase(decoded_token), \
             patch("app.core.dependencies.persistence.upsert_user"), \
             patch("firebase_admin.auth.revoke_refresh_tokens") as mock_revoke:
            response = client.post("/api/v1/auth/logout", headers=auth_header)

        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "logged out" in data["message"].lower()
        mock_revoke.assert_called_once_with(decoded_token["uid"])

    def test_logout_revocation_failure_still_200(self, client, auth_header, decoded_token):
        """Even if Firebase revocation fails, logout still returns 200."""
        with _patch_firebase(decoded_token), \
             patch("app.core.dependencies.persistence.upsert_user"), \
             patch("firebase_admin.auth.revoke_refresh_tokens",
                   side_effect=Exception("Firebase Admin unavailable")):
            response = client.post("/api/v1/auth/logout", headers=auth_header)

        # Should still succeed — revocation failure is non-fatal
        assert response.status_code == 200

    def test_logout_no_token(self, client):
        """No Authorization header → 401."""
        with patch("app.core.dependencies.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                require_auth=True,
                firebase_service_account_path="",
                allowed_mime_types=[],
                max_file_size_mb=100,
                max_filename_length=255,
                job_timeout_seconds=300,
                cors_origins=["*"],
            )
            response = client.post("/api/v1/auth/logout")
        assert response.status_code == 401

    def test_logout_invalid_token(self, client, auth_header):
        """Invalid Firebase token → 401."""
        with _patch_firebase_error(Exception("invalid token")), \
             patch("app.core.dependencies.get_settings") as mock_settings, \
             patch("app.core.dependencies.persistence.upsert_user"):
            mock_settings.return_value = MagicMock(require_auth=True)
            response = client.post("/api/v1/auth/logout", headers=auth_header)
        assert response.status_code == 401


# ── TestAnonymousAccessDevMode ────────────────────────────────────────────────

class TestAnonymousAccessDevMode:
    """Verify that REQUIRE_AUTH=False preserves anonymous access (dev mode)."""

    def test_analyze_anonymous_dev_mode(self, client):
        """
        When REQUIRE_AUTH=False and no token is provided, the dependency
        should return uid='anonymous' instead of raising 401.

        This test verifies the dev-mode fallback behavior is preserved
        after the refactoring from _get_uid() to Depends(get_current_user).
        """
        from app.core.dependencies import get_current_user, UserInfo
        from fastapi import FastAPI
        from fastapi.testclient import TestClient as _TestClient

        test_app = FastAPI()

        @test_app.get("/test-anon")
        async def _test_route(user: UserInfo = __import__('fastapi').Depends(get_current_user)):
            return {"uid": user.uid}

        with patch("app.core.config.get_settings") as mock_settings, \
             patch("app.core.dependencies.persistence.upsert_user"):
            mock_settings.return_value = MagicMock(require_auth=False)
            tc = _TestClient(test_app)
            response = tc.get("/test-anon")

        assert response.status_code == 200
        assert response.json()["uid"] == "anonymous"
