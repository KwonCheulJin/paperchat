from pydantic_settings import BaseSettings, SettingsConfigDict
import os


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # llama-server (OpenAI 호환)
    llama_server_url: str = "http://127.0.0.1:11434"
    llama_model: str = "gemma4:e4b"  # 프로필에 따라 .env로 오버라이드

    # 임베딩 모델 (fastembed TextEmbedding 지원 모델)
    # 한국어 지원: intfloat/multilingual-e5-large
    # 영어 전용 경량: BAAI/bge-small-en-v1.5
    embed_model: str = "intfloat/multilingual-e5-large"

    # ChromaDB
    chroma_path: str = "./data/chroma"
    chroma_collection: str = "documents"

    # SQLite (NetworkX 그래프 + 에러 로그 + 메트릭)
    sqlite_path: str = "./data/docrag.db"

    # FastAPI
    api_secret_key: str = ""
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:1420",  # Tauri v2 개발 모드 (Vite dev server)
        "tauri://localhost",
        "http://tauri.localhost",  # Tauri v2 Windows webview 오리진
    ]

    # 하드웨어 프로필
    hardware_profile: str = "standard"

    @property
    def data_dir(self) -> str:
        os.makedirs(self.chroma_path, exist_ok=True)
        return os.path.dirname(self.sqlite_path)


settings = Settings()
