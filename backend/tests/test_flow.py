"""Fluxo de ponta a ponta: exatamente o roteiro da demonstração para a banca."""

from __future__ import annotations

import sqlite3
import uuid

import pytest
from fastapi.testclient import TestClient

JUST = "Justificativa baseada no trecho anexado do relatório do projeto."


def _ev(text: str, page: int, origin: str = "selecionado_analista", keyword: str | None = None) -> dict:
    return {"id": uuid.uuid4().hex, "text": text, "locator": {"page": page, "rects": []}, "origin": origin, "keyword": keyword}


def _create(client: TestClient) -> str:
    r = client.post(
        "/api/analyses",
        json={"analyst_name": "Ana Lima", "project_name": "Modelo de risco climático", "area": "Inovação e Dados", "lgpd_acknowledged": True},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _upload(client: TestClient, aid: str, pdf: bytes) -> dict:
    r = client.post(f"/api/analyses/{aid}/document", files={"file": ("projeto.pdf", pdf, "application/pdf")})
    assert r.status_code == 200, r.text
    return r.json()


def _fill_all(client: TestClient, aid: str, *, incerteza: str = "inconclusivo", exclusions: list[str] | None = None) -> None:
    sugg = client.get(f"/api/analyses/{aid}/suggestions").json()["items"]
    by_target: dict[str, dict] = {}
    for s in sugg:
        by_target.setdefault(s["target"], s)

    def ev_for(target: str) -> dict:
        s = by_target[target]
        return _ev(s["text"], s["page"], "sugerido_confirmado", ", ".join(s["keywords"]))

    r = client.put(
        f"/api/analyses/{aid}/steps/classificacao",
        json={"option_id": "desenvolvimento_experimental", "justification": JUST, "evidences": [ev_for("criterio:criatividade")]},
    )
    assert r.status_code == 200, r.text
    assert client.post(f"/api/analyses/{aid}/steps/classificacao/complete").status_code == 200

    answers = {"novidade": "sim", "criatividade": "sim", "incerteza": incerteza, "sistematicidade": "sim", "reprodutibilidade": "sim"}
    criteria = {cid: {"answer": a, "justification": JUST, "evidences": [ev_for(f"criterio:{cid}")]} for cid, a in answers.items()}
    r = client.put(f"/api/analyses/{aid}/steps/criterios", json=criteria)
    assert r.status_code == 200, r.text
    assert all(e["verified"] for c in r.json()["data"]["criteria"].values() for e in c["evidences"])
    assert client.post(f"/api/analyses/{aid}/steps/criterios/complete").status_code == 200

    nr = {
        "answers": {q: {"text": JUST, "evidences": [ev_for(f"nao_rotina:{q}")]} for q in ("solucao_existente", "obstaculo_tecnico", "conhecimento_gerado")},
        "exclusions_marked": exclusions or [],
        "exclusions_explanation": "Só o painel de exibição foi configurado; o modelo foi desenvolvido pela equipe." if exclusions else "",
    }
    r = client.put(f"/api/analyses/{aid}/steps/nao_rotina", json=nr)
    assert r.status_code == 200, r.text
    assert client.post(f"/api/analyses/{aid}/steps/nao_rotina/complete").status_code == 200


def test_demo_flow_end_to_end(client: TestClient, sample_pdf: bytes, settings) -> None:
    aid = _create(client)
    view = _upload(client, aid, sample_pdf)
    assert view["document"]["view"] == "pdf" and view["document"]["page_count"] == 3
    assert view["indicative"]["outcome"] == "bloqueado"

    _fill_all(client, aid, incerteza="inconclusivo", exclusions=["software_pronto"])
    view = client.get(f"/api/analyses/{aid}").json()
    assert view["indicative"]["outcome"] == "requer_especialista"
    assert view["indicative"]["rule_id"] == "IND-02"
    assert [s["state"] for s in view["steps"]][:6] == ["complete"] * 4 + ["available"] * 2

    # Divergir sem justificativa é recusado
    r = client.post(f"/api/analyses/{aid}/opinion", json={"decision": "enquadra", "justification": JUST, "acknowledged": True})
    assert r.status_code == 422
    assert any(d["field"] == "divergence_justification" for d in r.json()["error"]["details"])

    r = client.post(
        f"/api/analyses/{aid}/opinion",
        json={
            "decision": "enquadra",
            "justification": JUST,
            "divergence_justification": "A incerteza está documentada na seção 3 e nas atas das quatro rodadas experimentais.",
            "acknowledged": True,
        },
    )
    assert r.status_code == 200, r.text
    final = r.json()
    assert final["status"] == "finalized"
    assert final["opinion"]["divergent"] is True
    assert final["integrity"]["audit_seq"] > 0

    pdf = client.get(f"/api/analyses/{aid}/dossier.pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert pdf.headers["x-content-sha256"] == final["integrity"]["content_hash"]

    integrity = client.get(f"/api/analyses/{aid}/integrity").json()
    assert integrity["ok"] is True

    events = [e["event"] for e in client.get(f"/api/analyses/{aid}/audit").json()["items"]]
    assert events == [
        "analysis.created",
        "document.attached",
        "step.completed",
        "step.completed",
        "step.completed",
        "analysis.finalized",
        "dossier.generated",
    ]

    # Finalizada = imutável, na API e no próprio banco
    assert client.put(f"/api/analyses/{aid}/steps/criterios", json={}).status_code == 409
    conn = sqlite3.connect(settings.db_path)
    with pytest.raises(sqlite3.IntegrityError, match="imutável"):
        conn.execute("UPDATE analyses SET project_name = 'x' WHERE id = ?", (aid,))
    with pytest.raises(sqlite3.IntegrityError, match="apenas inclusão"):
        conn.execute("DELETE FROM audit_log")


def test_aligned_opinion_needs_no_divergence(client: TestClient, sample_pdf: bytes) -> None:
    aid = _create(client)
    _upload(client, aid, sample_pdf)
    _fill_all(client, aid, incerteza="sim")
    view = client.get(f"/api/analyses/{aid}").json()
    assert view["indicative"]["outcome"] == "favoravel"
    r = client.post(f"/api/analyses/{aid}/opinion", json={"decision": "enquadra", "justification": JUST, "acknowledged": True})
    assert r.status_code == 200, r.text
    assert r.json()["opinion"]["divergent"] is False


def test_evidence_not_in_document_blocks_the_step(client: TestClient, sample_pdf: bytes) -> None:
    aid = _create(client)
    _upload(client, aid, sample_pdf)
    fake = _ev("Este texto foi escrito de memória e não está no relatório.", 1)
    r = client.put(
        f"/api/analyses/{aid}/steps/classificacao",
        json={"option_id": "pesquisa_aplicada", "justification": JUST, "evidences": [fake]},
    )
    assert r.status_code == 200
    assert r.json()["data"]["classification"]["evidences"][0]["verified"] is False
    codes = [i["code"] for i in r.json()["issues"]["classificacao"]]
    assert "evidence_not_found" in codes
    blocked = client.post(f"/api/analyses/{aid}/steps/classificacao/complete")
    assert blocked.status_code == 422


def test_cannot_skip_steps(client: TestClient, sample_pdf: bytes) -> None:
    aid = _create(client)
    _upload(client, aid, sample_pdf)
    r = client.put(f"/api/analyses/{aid}/steps/criterios", json={})
    assert r.status_code == 409
    assert "Classificação" in r.json()["error"]["message"]


def test_unknown_ids_are_rejected(client: TestClient, sample_pdf: bytes) -> None:
    aid = _create(client)
    _upload(client, aid, sample_pdf)
    r = client.put(f"/api/analyses/{aid}/steps/classificacao", json={"option_id": "inventada", "justification": "", "evidences": []})
    assert r.status_code == 422


def test_creation_requires_lgpd_acknowledgement(client: TestClient) -> None:
    r = client.post("/api/analyses", json={"analyst_name": "Ana", "project_name": "Projeto", "area": "TI", "lgpd_acknowledged": False})
    assert r.status_code == 422


def test_upload_validation(client: TestClient) -> None:
    aid = _create(client)
    assert client.post(f"/api/analyses/{aid}/document", files={"file": ("x.exe", b"MZ", "application/octet-stream")}).status_code == 415
    assert client.post(f"/api/analyses/{aid}/document", files={"file": ("x.pdf", b"", "application/pdf")}).status_code == 422
    assert client.post(f"/api/analyses/{aid}/document", files={"file": ("x.pdf", b"not a pdf", "application/pdf")}).status_code == 422


def test_text_document_uses_paragraphs(client: TestClient) -> None:
    aid = _create(client)
    text = "Primeiro parágrafo do relatório.\n\nFormulamos a hipótese de que o clima antecipa atrasos de pagamento no semiárido."
    view = _upload_text(client, aid, text)
    assert view["document"]["view"] == "text" and view["document"]["paragraph_count"] == 2
    doc = client.get(f"/api/analyses/{aid}/document/text").json()
    assert doc["paragraphs"][1]["n"] == 2


def _upload_text(client: TestClient, aid: str, text: str) -> dict:
    r = client.post(f"/api/analyses/{aid}/document", files={"file": ("relatorio.txt", text.encode(), "text/plain")})
    assert r.status_code == 200, r.text
    return r.json()


def test_health_reports_offline_and_chain(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["offline"] is True and body["audit_chain_ok"] is True and body["rules_version"] == "1.0.0"


def test_tampering_breaks_the_chain(client: TestClient, settings) -> None:
    _create(client)
    conn = sqlite3.connect(settings.db_path)
    conn.execute("DROP TRIGGER audit_log_no_update")
    conn.execute("UPDATE audit_log SET actor = 'outra pessoa' WHERE seq = 2")
    conn.commit()
    body = client.get("/api/health").json()
    assert body["audit_chain_ok"] is False and body["status"] == "degraded"
