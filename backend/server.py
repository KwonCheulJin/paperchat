"""PyInstaller 엔트리 포인트. uvicorn으로 FastAPI 앱 기동."""
import os
import sys

# Windows 콘솔 한글 출력 인코딩
if sys.platform == "win32":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")


def main() -> None:
    import uvicorn

    host = os.environ.get("PAPERCHAT_HOST", "127.0.0.1")
    port = int(os.environ.get("PAPERCHAT_PORT", "8000"))

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        log_level="info",
        access_log=False,
    )


if __name__ == "__main__":
    main()
