"""
main.py — FastAPI application entry point.

Responsibilities:
  - Application lifespan: initialize Firebase + Cloudinary at startup
  - Security headers middleware (X-Content-Type-Options, X-Frame-Options, etc.)
  - CORS middleware (restricted to configured allowed origins)
  - Rate limiting via slowapi
  - Mount all routers under /api/v1
  - /health endpoint (checks Firestore + Cloudinary connectivity)
  - Global exception handlers mapping typed errors to HTTP responses
  - Swagger/ReDoc/OpenAPI disabled in production (ENVIRONMENT=production)
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address
except ImportError:
    # Graceful fallback for IDE language server or environments without slowapi
    class RateLimitExceeded(Exception):  # type: ignore[no-redef]
        pass

    async def _rate_limit_exceeded_handler(request: Request, exc: Exception):  # type: ignore[no-redef]
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})

    def get_remote_address(request: Request) -> str:  # type: ignore[no-redef]
        return request.client.host if request.client else "127.0.0.1"

    class Limiter:  # type: ignore[no-redef]
        def __init__(self, key_func=None, default_limits=None):
            self.key_func = key_func

        def limit(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator


from app.core.cloudinary_client import check_cloudinary_connectivity, initialize_cloudinary
from app.core.config import get_settings
from app.core.firebase import check_firestore_connectivity, initialize_firebase
from app.models.schemas import ErrorDetail, ErrorResponse, HealthResponse
from app.routers import analyze, auth, jobs, reports

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Application startup and shutdown lifecycle.
    Initializes Firebase Admin SDK and Cloudinary SDK once at startup.
    """
    logger.info("OmniFace backend starting up...")
    settings = get_settings()

    try:
        initialize_firebase()
        logger.info("✓ Firebase Admin SDK ready.")
    except Exception as exc:
        logger.error("✗ Firebase initialization failed: %s", exc)
        # Don't crash the server — let /health report the issue

    try:
        initialize_cloudinary()
        logger.info("✓ Cloudinary SDK ready.")
    except Exception as exc:
        logger.error("✗ Cloudinary initialization failed: %s", exc)

    logger.info(
        "OmniFace backend ready. env=%s require_auth=%s max_file_mb=%d",
        settings.environment, settings.require_auth, settings.max_file_size_mb,
    )
    yield
    logger.info("OmniFace backend shutting down.")


# ── App factory ───────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    # Disable Swagger / ReDoc / OpenAPI schema in production to reduce attack surface.
    docs_url = None if settings.is_production else "/docs"
    redoc_url = None if settings.is_production else "/redoc"
    openapi_url = None if settings.is_production else "/openapi.json"

    app = FastAPI(
        title="OmniFace Deepfake Forensics API",
        description=(
            "Multimodal deepfake and synthetic media detection API. "
            "Supports image, audio, and video analysis with Firebase Auth and Cloudinary storage."
        ),
        version="1.0.0",
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
        lifespan=lifespan,
    )

    # ── Rate limiting ─────────────────────────────────────────────────────────
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── CORS ──────────────────────────────────────────────────────────────────
    # In development: allow_origin_regex matches ANY localhost port so Next.js
    # dev server (which may pick 3000, 3001, 3002 etc.) always passes preflight.
    # In production: only explicit cors_origins are allowed (regex is ignored via None).
    _dev_origin_regex = (
        r"http://(localhost|127\.0\.0\.1)(:\d+)?"
        if not settings.is_production
        else None
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=_dev_origin_regex,   # ← fixes OPTIONS 400 in dev
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS", "HEAD", "DELETE", "PATCH"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Accept",
            "Origin",
            "X-Requested-With",
        ],
        expose_headers=[
            "X-Request-ID",
            "X-Processing-Time-Ms",
            "X-Analysis-Engine",
            "X-Analysis-Warning",
        ],
    )

    # ── Security Headers Middleware ────────────────────────────────────────────
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        # Let CORS middleware handle OPTIONS preflight — don't intercept it here.
        if request.method == "OPTIONS":
            return await call_next(request)

        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # HSTS — only meaningful over HTTPS; add it and let the TLS terminator handle it.
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"

        # ML Stub Disclosure Headers: prevent clients from mistaking test stubs for real models
        if settings.ml_stub_mode:
            response.headers["X-Analysis-Engine"] = "development-stub"
            response.headers["X-Analysis-Warning"] = "synthetic-model-results"
        else:
            response.headers["X-Analysis-Engine"] = "production-model"

        return response

    # ── Request ID + timing middleware ────────────────────────────────────────
    @app.middleware("http")
    async def add_request_metadata(request: Request, call_next):
        import uuid
        # Pass OPTIONS preflight through immediately — CORS middleware owns it.
        if request.method == "OPTIONS":
            return await call_next(request)

        request_id = str(uuid.uuid4())[:8]
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Processing-Time-Ms"] = str(elapsed_ms)
        logger.info(
            "HTTP %s %s → %d [%dms] req_id=%s",
            request.method, request.url.path,
            response.status_code, elapsed_ms, request_id,
        )
        return response

    # ── Global exception handlers ─────────────────────────────────────────────
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        first_error = exc.errors()[0] if exc.errors() else {}
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(
                error=ErrorDetail(
                    code="VALIDATION_ERROR",
                    message=first_error.get("msg", "Invalid request payload."),
                    field=".".join(str(loc) for loc in first_error.get("loc", [])),
                )
            ).model_dump(),
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                error=ErrorDetail(
                    code=f"HTTP_{exc.status_code}",
                    message=exc.detail if isinstance(exc.detail, str) else str(exc.detail),
                )
            ).model_dump(),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        # Log the full exception server-side but never expose stack traces to clients.
        logger.exception("Unhandled exception: %s", exc)
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                error=ErrorDetail(
                    code="INTERNAL_SERVER_ERROR",
                    message="An unexpected error occurred. Please try again.",
                )
            ).model_dump(),
        )

    # ── Health endpoint ───────────────────────────────────────────────────────
    @app.get(
        "/health",
        response_model=HealthResponse,
        tags=["System"],
        summary="Health check — verifies Firestore and Cloudinary connectivity",
    )
    async def health_check() -> HealthResponse:
        firestore_status = await check_firestore_connectivity()
        cloudinary_status = await check_cloudinary_connectivity()

        overall = (
            "ok"
            if firestore_status == "ok" and cloudinary_status == "ok"
            else "degraded"
        )

        return HealthResponse(
            status=overall,
            firestore=firestore_status,
            cloudinary=cloudinary_status,
            timestamp=datetime.now(timezone.utc),
        )

    # ── Root redirect ─────────────────────────────────────────────────────────
    @app.get("/", include_in_schema=False)
    async def root():
        return {"service": "OmniFace Deepfake Forensics API", "version": "1.0.0"}

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(analyze.router, prefix="/api/v1")
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(jobs.router, prefix="/api/v1")
    app.include_router(reports.router, prefix="/api/v1")

    return app


app = create_app()
