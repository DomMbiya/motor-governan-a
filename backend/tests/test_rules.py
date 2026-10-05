from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.domain.errors import RulesError
from app.persistence.db import Database
from app.rules.loader import RulesRepository, parse_rules_file

RULES = Path(__file__).resolve().parents[1] / "rules" / "regras_v1.0.0.yaml"


def _write(tmp: Path, data: dict, version: str = "1.0.0") -> Path:
    path = tmp / f"regras_v{version}.yaml"
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), "utf-8")
    return path


def test_official_rules_are_valid_and_fully_covered() -> None:
    loaded = parse_rules_file(RULES)
    assert loaded.version == "1.0.0"
    assert len(loaded.rules.criterios) == 5
    assert loaded.rules.coverage_size() == 486


def test_incomplete_indicative_logic_is_rejected(tmp_path: Path) -> None:
    data = yaml.safe_load(RULES.read_text("utf-8"))
    data["indicativo"]["regras"] = [r for r in data["indicativo"]["regras"] if r["id"] != "IND-04"]
    with pytest.raises(RulesError, match="não cobre"):
        parse_rules_file(_write(tmp_path, data))


def test_broken_reference_is_rejected(tmp_path: Path) -> None:
    data = yaml.safe_load(RULES.read_text("utf-8"))
    data["criterios"][0]["fonte"] = "fonte_inexistente"
    with pytest.raises(RulesError, match="fonte_inexistente"):
        parse_rules_file(_write(tmp_path, data))


def test_filename_must_match_version(tmp_path: Path) -> None:
    data = yaml.safe_load(RULES.read_text("utf-8"))
    with pytest.raises(RulesError, match="nome do arquivo"):
        parse_rules_file(_write(tmp_path, data, version="9.9.9"))


def test_changelog_must_register_current_version(tmp_path: Path) -> None:
    data = yaml.safe_load(RULES.read_text("utf-8"))
    data["metadados"]["versao"] = "1.1.0"
    with pytest.raises(RulesError, match="changelog"):
        parse_rules_file(_write(tmp_path, data, version="1.1.0"))


def test_content_change_without_version_bump_is_rejected(tmp_path: Path) -> None:
    rules_dir = tmp_path / "rules"
    rules_dir.mkdir()
    data = yaml.safe_load(RULES.read_text("utf-8"))
    path = _write(rules_dir, data)
    db = Database(tmp_path / "db.sqlite")
    repo = RulesRepository(rules_dir, db)
    assert repo.active().version == "1.0.0"

    data["criterios"][0]["definicao"] = "Texto alterado sem subir a versão."
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), "utf-8")
    with pytest.raises(RulesError, match="Nenhuma base de regras válida"):
        repo.active()
    assert "sem incremento de versão" in repo.rejected()[0].reason


def test_new_version_becomes_active_without_restart(tmp_path: Path) -> None:
    rules_dir = tmp_path / "rules"
    rules_dir.mkdir()
    data = yaml.safe_load(RULES.read_text("utf-8"))
    _write(rules_dir, data)
    repo = RulesRepository(rules_dir, Database(tmp_path / "db.sqlite"))
    data["metadados"]["versao"] = "1.1.0"
    data["metadados"]["changelog"].append({"versao": "1.1.0", "data": "2026-10-06", "descricao": "Texto de ajuda revisado."})
    data["criterios"][0]["definicao"] = "Definição revisada."
    _write(rules_dir, data, version="1.1.0")
    assert repo.active().version == "1.1.0"
    assert repo.get("1.0.0").version == "1.0.0"
