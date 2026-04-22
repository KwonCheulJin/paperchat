# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec — paperchat-server.exe (onefile).

기동 진입점: server.py (uvicorn 래퍼)
FastAPI 앱: app.main:app
"""
from PyInstaller.utils.hooks import (
    collect_submodules,
    collect_data_files,
    copy_metadata,
)

block_cipher = None

# ───────────────────────────────────────────────────────────
# 1. 동적 import가 많은 패키지의 submodule 수집
# ───────────────────────────────────────────────────────────
hiddenimports: list[str] = []
# app 패키지 전체 — uvicorn이 "app.main:app" 문자열로 import하므로 정적 분석에서 누락
hiddenimports += collect_submodules("app")
hiddenimports += collect_submodules("uvicorn")
hiddenimports += collect_submodules("fastembed")
hiddenimports += collect_submodules("chromadb")
hiddenimports += collect_submodules("pypika")
hiddenimports += collect_submodules("kiwipiepy")
hiddenimports += collect_submodules("sentence_transformers")
hiddenimports += collect_submodules("pdfplumber")
hiddenimports += collect_submodules("pytesseract")
hiddenimports += [
    "fitz",            # PyMuPDF 런타임 심볼
    "onnxruntime",
    "onnxruntime.capi._pybind_state",
    "tiktoken_ext",
    "tiktoken_ext.openai_public",
]

# ───────────────────────────────────────────────────────────
# 2. 데이터 파일
# ───────────────────────────────────────────────────────────
datas: list[tuple[str, str]] = []
datas += [("profiles", "profiles")]             # 프로파일 JSON 4종
datas += collect_data_files("kiwipiepy_model")  # 한국어 형태소 모델 (~88MB)
datas += collect_data_files("fastembed")
datas += collect_data_files("chromadb")
datas += collect_data_files("tiktoken_ext")
datas += collect_data_files("tiktoken")

# 일부 패키지는 importlib.metadata로 버전 조회 → 메타데이터 필요
datas += copy_metadata("fastapi")
datas += copy_metadata("uvicorn")
datas += copy_metadata("chromadb")
datas += copy_metadata("fastembed")
datas += copy_metadata("onnxruntime")
datas += copy_metadata("tiktoken")
datas += copy_metadata("tokenizers")
datas += copy_metadata("transformers")
datas += copy_metadata("sentence_transformers")

a = Analysis(
    ["server.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # 불필요한 큰 의존
        "tkinter",
        "matplotlib",
        "IPython",
        "jupyter",
        "notebook",
        "pytest",
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="paperchat-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
