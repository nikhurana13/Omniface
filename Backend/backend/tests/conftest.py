"""
tests/conftest.py — Shared pytest configuration and fixtures.

Ensures all unit tests run with ML_STUB_MODE=True so analyzers return
deterministic stub results instead of failing closed in production mode.
The lru_cache on get_settings() is cleared before and after each test
so monkeypatched env vars take effect cleanly.
"""

import os
import pytest
from app.core.config import get_settings


@pytest.fixture(autouse=True)
def configure_test_environment(monkeypatch):
    """
    Auto-applied fixture: forces ML_STUB_MODE=True for every test.
    Clears the Settings lru_cache before applying env overrides and
    restores it after the test to avoid cross-test contamination.
    """
    # Clear cached settings before the test
    get_settings.cache_clear()
    # Force stub mode on for all unit tests
    monkeypatch.setenv("ML_STUB_MODE", "True")
    yield
    # Clear again after the test so the next test starts fresh
    get_settings.cache_clear()
