"""Trilha de auditoria encadeada por hash.

Cada registro guarda o hash do anterior. Alterar qualquer registro antigo
quebra todos os hashes seguintes, e a verificação aponta onde.
O payload guarda apenas ids, versões e hashes: nunca o texto do projeto.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass
from typing import Any

from app.domain.clock import iso, now_utc
from app.domain.hashing import canonical_json, sha256_text

GENESIS = "0" * 64
log = logging.getLogger("audit")


@dataclass(frozen=True)
class AuditEntry:
    seq: int
    ts: str
    analysis_id: str | None
    event: str
    actor: str
    payload: dict[str, Any]
    prev_hash: str
    entry_hash: str


@dataclass(frozen=True)
class ChainVerification:
    ok: bool
    entries: int
    last_hash: str
    broken_at: int | None = None
    reason: str | None = None


def _entry_hash(prev_hash: str, ts: str, analysis_id: str | None, event: str, actor: str, payload_json: str) -> str:
    material = canonical_json({"prev": prev_hash, "ts": ts, "analysis_id": analysis_id, "event": event, "actor": actor, "payload": payload_json})
    return sha256_text(material)


def append(conn: sqlite3.Connection, *, event: str, actor: str, analysis_id: str | None, payload: dict[str, Any]) -> AuditEntry:
    """Inclui um registro. Deve ser chamado dentro de Database.transaction()."""
    row = conn.execute("SELECT entry_hash FROM audit_log ORDER BY seq DESC LIMIT 1").fetchone()
    prev = row["entry_hash"] if row else GENESIS
    ts = iso(now_utc())
    payload_json = canonical_json(payload)
    entry_hash = _entry_hash(prev, ts, analysis_id, event, actor, payload_json)
    cur = conn.execute(
        "INSERT INTO audit_log (ts, analysis_id, event, actor, payload_json, prev_hash, entry_hash) VALUES (?,?,?,?,?,?,?)",
        (ts, analysis_id, event, actor, payload_json, prev, entry_hash),
    )
    seq = int(cur.lastrowid)
    log.info("audit.append", extra={"ctx": {"seq": seq, "event": event, "analysis_id": analysis_id}})
    return AuditEntry(seq, ts, analysis_id, event, actor, payload, prev, entry_hash)


def _row(r: sqlite3.Row) -> AuditEntry:
    return AuditEntry(r["seq"], r["ts"], r["analysis_id"], r["event"], r["actor"], json.loads(r["payload_json"]), r["prev_hash"], r["entry_hash"])


def list_for_analysis(conn: sqlite3.Connection, analysis_id: str) -> list[AuditEntry]:
    rows = conn.execute("SELECT * FROM audit_log WHERE analysis_id = ? ORDER BY seq", (analysis_id,)).fetchall()
    return [_row(r) for r in rows]


def verify_chain(conn: sqlite3.Connection) -> ChainVerification:
    prev = GENESIS
    count = 0
    for r in conn.execute("SELECT * FROM audit_log ORDER BY seq"):
        count += 1
        if r["prev_hash"] != prev:
            return ChainVerification(False, count, prev, r["seq"], "o elo com o registro anterior foi quebrado")
        expected = _entry_hash(prev, r["ts"], r["analysis_id"], r["event"], r["actor"], r["payload_json"])
        if expected != r["entry_hash"]:
            return ChainVerification(False, count, prev, r["seq"], "o conteúdo do registro foi alterado")
        prev = r["entry_hash"]
    return ChainVerification(True, count, prev)
