"""Acesso ao SQLite local.

A imutabilidade não depende só do código da aplicação: gatilhos no próprio
banco recusam UPDATE/DELETE no log de auditoria e qualquer alteração em
análises finalizadas. Mesmo um acesso direto ao arquivo pela aplicação
esbarra nessas travas.
"""

from __future__ import annotations

import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS analyses (
    id              TEXT PRIMARY KEY,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('draft', 'finalized')),
    analyst_name    TEXT NOT NULL,
    project_name    TEXT NOT NULL,
    area            TEXT NOT NULL,
    rules_version   TEXT NOT NULL,
    rules_checksum  TEXT NOT NULL,
    document_json   TEXT,
    data_json       TEXT NOT NULL,
    opinion_json    TEXT,
    result_json     TEXT,
    content_hash    TEXT,
    pdf_sha256      TEXT,
    audit_seq       INTEGER,
    finalized_at    TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT NOT NULL,
    analysis_id  TEXT,
    event        TEXT NOT NULL,
    actor        TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    prev_hash    TEXT NOT NULL,
    entry_hash   TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS audit_by_analysis ON audit_log (analysis_id, seq);

CREATE TABLE IF NOT EXISTS rules_registry (
    version     TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    first_seen  TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log aceita apenas inclusão'); END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log aceita apenas inclusão'); END;

CREATE TRIGGER IF NOT EXISTS analyses_finalized_immutable BEFORE UPDATE ON analyses
WHEN OLD.status = 'finalized'
BEGIN SELECT RAISE(ABORT, 'análise finalizada é imutável'); END;

CREATE TRIGGER IF NOT EXISTS analyses_finalized_no_delete BEFORE DELETE ON analyses
WHEN OLD.status = 'finalized'
BEGIN SELECT RAISE(ABORT, 'análise finalizada é imutável'); END;

CREATE TRIGGER IF NOT EXISTS rules_registry_no_update BEFORE UPDATE ON rules_registry
BEGIN SELECT RAISE(ABORT, 'registro de versões de regras é imutável'); END;
"""


class Database:
    """Conexões curtas por operação; escrita serializada por um lock de processo.

    O protótipo roda um único processo (uvicorn sem workers extras), então um
    lock local mais BEGIN IMMEDIATE é suficiente para manter a cadeia de hashes
    da auditoria linear e consistente.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self._write_lock = threading.Lock()
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10, isolation_level=None, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @contextmanager
    def read(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self._write_lock:
            conn = self._connect()
            try:
                conn.execute("BEGIN IMMEDIATE")
                yield conn
                conn.execute("COMMIT")
            except BaseException:
                conn.execute("ROLLBACK")
                raise
            finally:
                conn.close()
