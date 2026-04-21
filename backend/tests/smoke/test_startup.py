"""Phase 0 smoke: FastAPI 앱 기동 + /health 200 응답 확인."""
from starlette.testclient import TestClient


def test_health_returns_200():
    from app.main import app

    with TestClient(app) as client:
        r = client.get("/health")
    assert r.status_code == 200


def test_health_response_has_status_field():
    from app.main import app

    with TestClient(app) as client:
        r = client.get("/health")
    body = r.json()
    assert "status" in body
    assert body["status"] in ("ok", "degraded")
