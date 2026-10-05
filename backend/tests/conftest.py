from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from gerar_projeto_ficticio import build_pdf  # noqa: E402

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    rules_dir = tmp_path / "rules"
    shutil.copytree(ROOT / "rules", rules_dir)
    return Settings(
        data_dir=tmp_path / "data",
        rules_dir=rules_dir,
        active_rules_version=None,
        max_upload_mb=5,
        timezone="America/Fortaleza",
        log_level="WARNING",
        allowed_origins=("http://localhost:3000",),
    )


@pytest.fixture
def client(settings: Settings) -> TestClient:
    return TestClient(create_app(settings))


@pytest.fixture(scope="session")
def sample_pdf(tmp_path_factory: pytest.TempPathFactory) -> bytes:
    return build_pdf(tmp_path_factory.mktemp("amostra") / "projeto.pdf").read_bytes()
