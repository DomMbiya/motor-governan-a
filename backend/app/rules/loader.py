"""Carregamento, validação e versionamento da base de regras.

- Cada arquivo regras_v*.yaml é validado por completo (forma, semântica e
  cobertura total da lógica do indicativo).
- A versão ativa é a maior versão válida, ou a fixada em RULES_ACTIVE_VERSION.
- Cada versão vista é registrada com o checksum do arquivo. Se o conteúdo de
  uma versão já registrada mudar sem incremento de versão, o carregador recusa
  o arquivo: um dossiê antigo nunca pode passar a apontar para regras diferentes.
- Arquivos alterados em disco são detectados pela data de modificação, sem
  reiniciar o servidor (demo: editar texto de ajuda, subir versão, recarregar).
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from pathlib import Path

import yaml
from pydantic import ValidationError

from app.audit import repository as audit
from app.domain.clock import iso, now_utc
from app.domain.errors import NotFound, RulesError
from app.domain.hashing import sha256_bytes
from app.persistence.db import Database
from app.rules.schema import RuleBase

log = logging.getLogger("rules")


@dataclass(frozen=True)
class LoadedRules:
    rules: RuleBase
    checksum: str
    path: Path

    @property
    def version(self) -> str:
        return self.rules.version


@dataclass(frozen=True)
class RejectedFile:
    path: Path
    reason: str


def _semver_key(version: str) -> tuple[int, ...]:
    return tuple(int(p) for p in version.split("."))


def parse_rules_file(path: Path) -> LoadedRules:
    raw = path.read_bytes()
    try:
        data = yaml.safe_load(raw)
    except yaml.YAMLError as exc:
        raise RulesError(f"{path.name}: YAML malformado ({exc})") from exc
    if not isinstance(data, dict):
        raise RulesError(f"{path.name}: o arquivo deve conter um mapa na raiz")
    try:
        rules = RuleBase.model_validate(data)
    except ValidationError as exc:
        problems = "; ".join(f"{'.'.join(str(p) for p in e['loc']) or 'raiz'}: {e['msg']}" for e in exc.errors())
        raise RulesError(f"{path.name}: {problems}") from exc
    expected_name = f"regras_v{rules.version}.yaml"
    if path.name != expected_name:
        raise RulesError(f"{path.name}: o nome do arquivo deve ser {expected_name} para a versão declarada")
    return LoadedRules(rules=rules, checksum=sha256_bytes(raw), path=path)


class RulesRepository:
    def __init__(self, rules_dir: Path, db: Database, pinned_version: str | None = None) -> None:
        self._dir = rules_dir
        self._db = db
        self._pinned = pinned_version
        self._lock = threading.Lock()
        self._fingerprint: tuple[tuple[str, float, int], ...] = ()
        self._versions: dict[str, LoadedRules] = {}
        self._rejected: list[RejectedFile] = []
        self.refresh()

    # ---------------------------------------------------------------- public
    def active(self) -> LoadedRules:
        self.refresh()
        if not self._versions:
            reasons = "; ".join(r.reason for r in self._rejected) or "nenhum arquivo regras_v*.yaml encontrado"
            raise RulesError(f"Nenhuma base de regras válida disponível: {reasons}")
        if self._pinned:
            if self._pinned not in self._versions:
                raise RulesError(f"A versão fixada {self._pinned} não está disponível ou é inválida")
            return self._versions[self._pinned]
        return self._versions[max(self._versions, key=_semver_key)]

    def get(self, version: str, checksum: str | None = None) -> LoadedRules:
        self.refresh()
        loaded = self._versions.get(version)
        if loaded is None:
            raise NotFound(f"A versão de regras {version} não está mais disponível no diretório de regras")
        if checksum and loaded.checksum != checksum:
            raise RulesError(f"O conteúdo da versão {version} difere do registrado quando a análise foi criada")
        return loaded

    def versions(self) -> list[LoadedRules]:
        self.refresh()
        return sorted(self._versions.values(), key=lambda lr: _semver_key(lr.version), reverse=True)

    def rejected(self) -> list[RejectedFile]:
        self.refresh()
        return list(self._rejected)

    # -------------------------------------------------------------- internal
    def refresh(self) -> None:
        files = sorted(self._dir.glob("regras_v*.yaml"))
        fingerprint = tuple((f.name, f.stat().st_mtime, f.stat().st_size) for f in files)
        if fingerprint == self._fingerprint:
            return
        with self._lock:
            if fingerprint == self._fingerprint:
                return
            versions: dict[str, LoadedRules] = {}
            rejected: list[RejectedFile] = []
            for path in files:
                try:
                    loaded = parse_rules_file(path)
                    self._register(loaded)
                    versions[loaded.version] = loaded
                except RulesError as exc:
                    rejected.append(RejectedFile(path, exc.message))
                    log.error("rules.rejected", extra={"ctx": {"file": path.name, "reason": exc.message}})
            self._versions, self._rejected, self._fingerprint = versions, rejected, fingerprint
            log.info("rules.loaded", extra={"ctx": {"versions": sorted(versions), "rejected": [r.path.name for r in rejected]}})

    def _register(self, loaded: LoadedRules) -> None:
        with self._db.transaction() as conn:
            row = conn.execute("SELECT checksum FROM rules_registry WHERE version = ?", (loaded.version,)).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO rules_registry (version, checksum, first_seen) VALUES (?,?,?)",
                    (loaded.version, loaded.checksum, iso(now_utc())),
                )
                audit.append(
                    conn,
                    event="rules.registered",
                    actor="sistema",
                    analysis_id=None,
                    payload={"version": loaded.version, "checksum": loaded.checksum, "file": loaded.path.name},
                )
            elif row["checksum"] != loaded.checksum:
                raise RulesError(
                    f"o conteúdo da versão {loaded.version} mudou sem incremento de versão. "
                    "Crie um novo arquivo com a versão seguinte e registre a mudança no changelog."
                )
