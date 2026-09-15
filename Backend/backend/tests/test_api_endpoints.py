"""
tests/test_api_endpoints.py — Comprehensive integration tests for FastAPI endpoints.

Tests:
  - GET / (root)
  - GET /health
  - POST /api/v1/analyze (Image, Audio, Video, Validation errors)
  - GET /api/v1/jobs/{job_id} (found and 404)
  - GET /api/v1/reports/{report_id} (found and 404)
  - GET /api/v1/reports (pagination)
  - GET /api/v1/reports/{report_id}/export (JSON and Certificate)
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models.schemas import AnalyzeResponse, JobStatusResponse, ReportResponse


@pytest.fixture(scope="module")
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


class TestSystemEndpoints:
    def test_root_endpoint(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert "service" in data
        assert "version" in data
        assert data["version"] == "1.0.0"

    def test_health_endpoint(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "firestore" in data
        assert "cloudinary" in data
        assert "timestamp" in data


class TestAnalyzeEndpointValidation:
    def test_empty_file_rejected(self, client):
        resp = client.post(
            "/api/v1/analyze",
            files={"file": ("empty.jpg", b"", "image/jpeg")},
        )
        assert resp.status_code == 400
        assert "empty" in resp.json()["error"]["message"].lower()

    def test_unsupported_mime_type_rejected(self, client):
        resp = client.post(
            "/api/v1/analyze",
            files={"file": ("data.exe", b"MZexecutabledata", "application/x-msdownload")},
        )
        assert resp.status_code == 415
        assert "not supported" in resp.json()["error"]["message"].lower()

    def test_missing_file_rejected(self, client):
        resp = client.post("/api/v1/analyze")
        assert resp.status_code == 422


class TestAnalyzeFlow:
    @patch("app.core.cloudinary_client.upload_file")
    @patch("app.core.persistence.create_job")
    @patch("app.core.persistence.update_job")
    @patch("app.core.persistence.create_report")
    def test_analyze_image_synchronous(
        self, mock_create_report, mock_update_job, mock_create_job, mock_upload, client
    ):
        mock_upload.side_effect = Exception("Cloudinary disabled for test")
        import io
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (64, 64), color=(120, 150, 180)).save(buf, format="JPEG")
        valid_image = buf.getvalue()

        resp = client.post(
            "/api/v1/analyze",
            files={"file": ("sample.jpg", valid_image, "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "complete"
        assert data["modality"] == "image"
        assert "job_id" in data
        assert "report_id" in data
        assert "confidence" in data
        assert "is_deepfake" in data
        assert "indicators" in data
        assert len(data["indicators"]) > 0

    @patch("app.core.cloudinary_client.upload_file")
    @patch("app.core.persistence.create_job")
    @patch("app.core.persistence.update_job")
    @patch("app.core.persistence.create_report")
    def test_analyze_audio_synchronous(
        self, mock_create_report, mock_update_job, mock_create_job, mock_upload, client
    ):
        mock_upload.side_effect = Exception("Cloudinary disabled for test")
        import io, math, struct, wave
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            samples = [int(4000 * math.sin(2 * math.pi * 440 * i / 16000)) for i in range(1600)]
            wf.writeframes(struct.pack(f"<{len(samples)}h", *samples))
        valid_audio = buf.getvalue()

        resp = client.post(
            "/api/v1/analyze",
            files={"file": ("speech.wav", valid_audio, "audio/wav")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "complete"
        assert data["modality"] == "audio"
        assert "report_id" in data

    @patch("app.core.cloudinary_client.upload_file")
    @patch("app.core.persistence.create_job")
    def test_analyze_video_returns_processing_job(
        self, mock_create_job, mock_upload, client
    ):
        mock_upload.side_effect = Exception("Cloudinary disabled for test")
        fake_video = b"\x00\x00\x00\x20ftypisom" + b"\x00" * 32

        resp = client.post(
            "/api/v1/analyze",
            files={"file": ("clip.mp4", fake_video, "video/mp4")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "processing"
        assert data["modality"] == "video"
        assert "job_id" in data


class TestJobsAndReportsEndpoints:
    @patch("app.core.persistence.get_job")
    def test_get_job_found(self, mock_get_job, client):
        mock_get_job.return_value = {
            "jobId": "job_12345",
            "status": "complete",
            "modality": "image",
            "reportId": "rpt_99999",
            "createdAt": datetime.now(timezone.utc),
            "updatedAt": datetime.now(timezone.utc),
        }
        resp = client.get("/api/v1/jobs/job_12345")
        assert resp.status_code == 200
        data = resp.json()
        assert data["job_id"] == "job_12345"
        assert data["status"] == "complete"
        assert data["report_id"] == "rpt_99999"

    @patch("app.core.persistence.get_job")
    def test_get_job_not_found(self, mock_get_job, client):
        mock_get_job.return_value = None
        resp = client.get("/api/v1/jobs/non_existent_job")
        assert resp.status_code == 404

    @patch("app.core.persistence.get_report")
    def test_get_report_found(self, mock_get_report, client):
        mock_get_report.return_value = {
            "reportId": "rpt_12345",
            "jobId": "job_12345",
            "modality": "image",
            "verdict": "fake",
            "confidenceScore": 0.94,
            "analyzerResults": {},
            "fusion": {"method": "passthrough", "finalScore": 0.94},
            "summary": "Deepfake detected.",
            "sha256": "abcdef1234567890",
            "latencyMs": 142,
            "indicators": [
                {
                    "name": "Spatial Frequency Residuals",
                    "score": 92,
                    "status": "anomalous",
                    "description": "GAN artifacts detected.",
                }
            ],
            "createdAt": datetime.now(timezone.utc),
        }
        resp = client.get("/api/v1/reports/rpt_12345")
        assert resp.status_code == 200
        data = resp.json()
        assert data["report_id"] == "rpt_12345"
        assert data["verdict"] == "fake"
        assert data["is_deepfake"] is True
        assert data["confidence"] == 94.0

    @patch("app.core.persistence.get_report")
    def test_get_report_not_found(self, mock_get_report, client):
        mock_get_report.return_value = None
        resp = client.get("/api/v1/reports/rpt_missing")
        assert resp.status_code == 404

    @patch("app.core.persistence.list_reports")
    @patch("app.core.persistence.count_reports")
    def test_list_reports_pagination(self, mock_count, mock_list, client):
        mock_list.return_value = [
            {
                "reportId": f"rpt_{i}",
                "jobId": f"job_{i}",
                "modality": "image",
                "verdict": "real",
                "confidenceScore": 0.1,
                "summary": "Authentic",
                "createdAt": datetime.now(timezone.utc),
            }
            for i in range(5)
        ]
        mock_count.return_value = 15

        resp = client.get("/api/v1/reports?page=1&per_page=5")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 5
        assert data["total"] == 15
        assert data["page"] == 1
        assert data["per_page"] == 5
        assert data["has_next"] is True

    @patch("app.core.persistence.get_report")
    def test_export_report_json(self, mock_get_report, client):
        mock_get_report.return_value = {
            "reportId": "rpt_exp1",
            "jobId": "job_exp1",
            "modality": "image",
            "verdict": "fake",
            "confidenceScore": 0.89,
            "summary": "Deepfake detected.",
            "sha256": "1122334455667788",
            "latencyMs": 110,
            "indicators": [],
            "createdAt": datetime.now(timezone.utc),
        }
        resp = client.get("/api/v1/reports/rpt_exp1/export?format=json")
        assert resp.status_code == 200
        data = resp.json()
        assert data["format"] == "json"
        assert "OMNIFACE" in data["content"]
        assert data["filename"].endswith(".json")

    @patch("app.core.persistence.get_report")
    def test_export_report_certificate(self, mock_get_report, client):
        mock_get_report.return_value = {
            "reportId": "rpt_exp2",
            "jobId": "job_exp2",
            "modality": "image",
            "verdict": "real",
            "confidenceScore": 0.05,
            "summary": "Authentic media verified.",
            "sha256": "aabbccddeeff0011",
            "latencyMs": 95,
            "indicators": [],
            "createdAt": datetime.now(timezone.utc),
        }
        resp = client.get("/api/v1/reports/rpt_exp2/export?format=certificate")
        assert resp.status_code == 200
        data = resp.json()
        assert data["format"] == "certificate"
        assert "FORENSIC ATTESTATION" in data["content"]
        assert data["filename"].endswith(".txt")
