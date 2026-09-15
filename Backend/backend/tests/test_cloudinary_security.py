"""
tests/test_cloudinary_security.py — Unit tests for Cloudinary authenticated media security.

Verifies:
  - upload_file sets delivery_type="authenticated"
  - get_signed_url generates signed time-limited authenticated URLs
  - extract_video_frame_urls signs all sampled frame URLs
  - extract_audio_track_url generates signed authenticated audio URLs
  - delete_file calls destroy with type="authenticated" and invalidate=True
  - user folder scoping is strictly enforced (omniface/{uid}/uploads)
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
import pytest

from app.core import cloudinary_client


class TestCloudinaryMediaSecurity:
    """Test authenticated media pipeline."""

    def test_upload_sets_type_authenticated_by_default(self):
        with patch("cloudinary.uploader.upload") as mock_upload:
            mock_upload.return_value = {
                "public_id": "omniface/u123/uploads/sample",
                "secure_url": "https://res.cloudinary.com/test/image/authenticated/s--abc--/sample.jpg",
                "resource_type": "image",
                "format": "jpg",
                "bytes": 1024,
            }

            res = cloudinary_client.upload_file(
                file_bytes=b"sample_content",
                filename="sample.jpg",
                resource_type="image",
                folder="omniface/u123/uploads",
            )

            mock_upload.assert_called_once()
            call_kwargs = mock_upload.call_args.kwargs
            assert call_kwargs.get("type") == "authenticated"
            assert "omniface/u123/uploads" in call_kwargs.get("public_id")
            assert res.public_id == "omniface/u123/uploads/sample"

    def test_get_signed_url_requests_authenticated_and_signed(self):
        with patch("cloudinary.utils.cloudinary_url") as mock_url:
            mock_url.return_value = ("https://res.cloudinary.com/test/image/authenticated/s--signedtoken--/sample.jpg", {})

            url = cloudinary_client.get_signed_url(
                public_id="omniface/u123/uploads/sample",
                resource_type="image",
                expires_in=1800,
            )

            mock_url.assert_called_once()
            call_kwargs = mock_url.call_args.kwargs
            assert call_kwargs.get("type") == "authenticated"
            assert call_kwargs.get("sign_url") is True
            assert "expires_at" in call_kwargs
            assert "https://" in url

    def test_video_frame_urls_are_signed_and_authenticated(self):
        with patch("cloudinary.utils.cloudinary_url") as mock_url:
            mock_url.return_value = ("https://res.cloudinary.com/test/video/authenticated/s--frame--/frame.jpg", {})

            urls = cloudinary_client.extract_video_frame_urls(
                public_id="omniface/u123/uploads/sample_video",
                count=4,
            )

            assert len(urls) == 4
            assert mock_url.call_count == 4
            for call in mock_url.call_args_list:
                kwargs = call.kwargs
                assert kwargs.get("type") == "authenticated"
                assert kwargs.get("sign_url") is True
                assert kwargs.get("resource_type") == "video"

    def test_audio_track_url_is_signed_and_authenticated(self):
        with patch("cloudinary.utils.cloudinary_url") as mock_url:
            mock_url.return_value = ("https://res.cloudinary.com/test/video/authenticated/s--audio--/audio.mp3", {})

            url = cloudinary_client.extract_audio_track_url(
                public_id="omniface/u123/uploads/sample_video",
            )

            mock_url.assert_called_once()
            kwargs = mock_url.call_args.kwargs
            assert kwargs.get("type") == "authenticated"
            assert kwargs.get("sign_url") is True
            assert kwargs.get("format") == "mp3"
            assert "https://" in url

    def test_delete_file_uses_type_authenticated_and_invalidate(self):
        with patch("cloudinary.uploader.destroy") as mock_destroy:
            mock_destroy.return_value = {"result": "ok"}

            res = cloudinary_client.delete_file(
                public_id="omniface/u123/uploads/sample",
                resource_type="image",
            )

            mock_destroy.assert_called_once_with(
                "omniface/u123/uploads/sample",
                resource_type="image",
                type="authenticated",
                invalidate=True,
            )
            assert res.get("result") == "ok"
