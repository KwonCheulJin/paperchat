# 이슈 대응 계획 (v5.2)

## 개요
- 목적: 사용자 보고 이슈 4건 분석 및 수정
- 영향 범위: lib.rs (설치/종료 로직), llm_client.py, chat/service.py, documents/service.py
- 예상 복잡도: 낮음~중간

---

## 이슈 1 — Gemma 4 E4B 응답 9분 이상 소요

### 원인 분석
RAM 11GB 환경에서 Gemma 4 E4B (5.4GB) 실행 시 사용 가능한 여유 메모리가 약 5.5GB.
현재 llama-server 설정의 병목 지점:

| 항목 | 현재 값 | 문제점 |
|------|---------|--------|
| `--ctx-size` | 8192 | KV 캐시가 약 2GB 점유 → 메모리 압박 |
| `--threads` | 미지정 (OS 기본) | Windows에서 과도한 컨텍스트 전환 |
| `--n-batch` | 미지정 | 기본값 512이나 명시적 설정 없음 |
| `max_tokens` | 2048 | 긴 응답 생성 시 오래 걸림 |
| Dense k | 30 + BM25 30 | RAG 검색 후처리 비용 |

### 최적화 방안

#### A. llama-server 파라미터 조정 (`lib.rs`)
```rust
// 변경 전
"--ctx-size", "8192",

// 변경 후
"--ctx-size", "4096",       // KV 캐시 절반 감소 (~1GB 절약)
"--threads", &cpu_threads,  // 물리 코어 수 (하이퍼스레딩 제외)
"--n-batch", "256",         // 처리 배치 (낮은 RAM 환경)
```

`cpu_threads` = `std::thread::available_parallelism()` / 2 (물리 코어만)

#### B. max_tokens 환경 기반 조정 (`llm_client.py`)
```python
# 현재: max_tokens=2048 고정
# 변경: 설정으로 분리
MAX_TOKENS = int(os.getenv("LLAMA_MAX_TOKENS", "1024"))
```

#### C. 설치 UI에서 성능 안내 추가 (`index.html`)
- minimal 프로필 선택 시 "CPU 전용 · 응답 약 1~3분 예상" 문구 표시
- 기대치 관리 (UI 변경)

#### D. RAG 파이프라인 경량화 (`hybrid_search.py`, `chat/service.py`)
```python
# hybrid_search: dense 20, BM25 20 (기존 30+30)
# reranker top-k: 3 (기존 5)
```

### 파일 변경 목록
| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `installer/src-tauri/src/lib.rs` | 수정 | llama-server `--ctx-size 4096`, `--threads`, `--n-batch 256` 추가 |
| `backend/app/services/llm_client.py` | 수정 | `LLAMA_MAX_TOKENS` env로 max_tokens 설정 가능하게 |
| `backend/app/services/hybrid_search.py` | 수정 | dense/BM25 각 30→20으로 축소 |
| `backend/app/chat/service.py` | 수정 | reranker top-k 5→3 |
| `installer/ui/index.html` | 수정 | minimal 프로필 선택 시 응답 시간 안내 문구 |

---

## 이슈 2 — PDF 최대 용량 및 처리 프로세스

### 현재 상태 확인
- **최대 용량 제한**: 50MB (`documents/router.py` 내 `_MAX_BYTES = 50 * 1024 * 1024`)
- **실제 파일 크기**: 이미지 기준 최대 ~24MB → 현재 제한으로 충분

### 처리 파이프라인
```
PDF 업로드 (최대 50MB)
  ↓
SHA-256 중복 체크 → 중복 시 즉시 반환
  ↓
PyMuPDF 텍스트 추출 (1차)
  ↓ 실패 시
pdfplumber 텍스트 추출 (폴백)
  ↓ 둘 다 실패 시
"PDF에서 텍스트를 추출할 수 없습니다" 에러 반환
  ↓ 성공 시
계층적 청킹 (섹션 200단어, 문단 150단어)
  ↓
multilingual-e5-large 임베딩 (배치 32)
  ↓
ChromaDB + SQLite FTS5 저장
  ↓
백그라운드 온톨로지 추출 (유휴 30초 후)
```

### 이슈 4 스크린샷 분석
"PDF에서 텍스트를 추출할 수 없습니다" 에러는 **스캔 PDF** (이미지로만 구성, 텍스트 레이어 없음)일 때 발생.
PyMuPDF + pdfplumber 모두 텍스트 레이어가 없으면 빈 문자열 반환.

### 대응 방안
- OCR 통합은 Tesseract 설치 필요 → **YAGNI 원칙상 미구현**
- 에러 메시지를 더 명확하게 개선:
  - 현재: "PDF에서 텍스트를 추출할 수 없습니다."
  - 개선: "이미지 스캔 PDF는 지원되지 않습니다. 텍스트가 포함된 PDF를 사용해주세요."

### 파일 변경 목록
| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `backend/app/documents/service.py` | 수정 | 텍스트 추출 실패 에러 메시지 구체화 |

---

## 이슈 3 — Backend 2개 프로세스가 실행 중인 이유

### 원인 분석
Windows 작업 관리자에서 `backend(2)` = **2개의 backend.exe 프로세스**.

**발생 시나리오:**
1. 앱 최초 실행 → backend.exe 시작 (PID A)
2. 앱 창 닫기 → `CloseRequested` 이벤트 → `child.kill()` (PID A 종료)
3. **앱 재시작 전 PID A가 완전히 종료되지 않은 시점**에 앱 재오픈
4. 또는 앱이 비정상 종료(강제 종료, 크래시)되면 `CloseRequested` 이벤트가 발화하지 않아 PID A orphan 상태로 남음
5. 다음 앱 시작 시 PID B 생성 → 2개 동시 실행

**확인 근거:**
- `stop_all_sidecars()`는 Tauri `CloseRequested` 이벤트에서만 호출
- 앱 강제 종료/크래시 시 orphan process 발생 가능

### 해결 방안
앱 시작 시(`start_backend`) 기존 backend.exe 프로세스를 먼저 종료 후 새로 실행.

```rust
// lib.rs - start_backend 함수 내 추가
fn kill_existing_backend() {
    // Windows: taskkill /F /IM backend-x86_64-pc-windows-msvc.exe /T
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "backend-x86_64-pc-windows-msvc.exe", "/T"])
        .output();
}
```

`start_backend()` 시작 시 `kill_existing_backend()` 먼저 호출.

### 파일 변경 목록
| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `installer/src-tauri/src/lib.rs` | 수정 | `start_backend()` 호출 전 `kill_existing_backend()` 추가 |

---

## 이슈 4 — 프로그램 삭제 시 실행 중인 Backend 미제거

### 현재 상태
- NSIS 언인스톨러 실행 시 Tauri 앱 프로세스는 종료되지만 `CloseRequested` 이벤트가 발화하지 않음
- backend.exe + llama-server.exe가 orphan으로 남아 계속 실행 중

### 해결 방안
**tauri.conf.json NSIS 설정에 언인스톨 훅 추가:**

```json
{
  "bundle": {
    "windows": {
      "nsis": {
        "preuninstallHook": "scripts/pre-uninstall.nsh"
      }
    }
  }
}
```

**`installer/scripts/pre-uninstall.nsh` (신규)**:
```nsh
!macro preun
  ; backend 및 llama-server 프로세스 강제 종료
  nsExec::ExecToLog 'taskkill /F /IM "backend-x86_64-pc-windows-msvc.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "llama-server.exe" /T'
  Sleep 1000
!macroend
```

> **주의**: Tauri 2의 NSIS 훅 지원 방식 확인 필요.
> Tauri 2는 `beforeUninstallCommands` 또는 NSIS 커스텀 스크립트를 지원함.

**대안 (Tauri 2 공식 방식):**
tauri.conf.json `bundle.windows.nsis.customNsis` 경로 지정 또는
`bundle.windows.nsis.installHooks` 사용.

실제 Tauri 2 NSIS 훅 API를 확인하여 구현.

### 파일 변경 목록
| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `installer/src-tauri/tauri.conf.json` | 수정 | NSIS 언인스톨 훅 경로 지정 |
| `installer/scripts/pre-uninstall.nsh` | 신규 | backend/llama-server 프로세스 종료 NSIS 스크립트 |

---

## 구현 우선순위 및 단계

### 1단계 — 즉시 효과 (이슈 1, 3)
1. `lib.rs`: `kill_existing_backend()` 추가 → backend 중복 기동 방지
2. `lib.rs`: llama-server `--ctx-size 4096`, `--threads`, `--n-batch 256` 추가
3. `llm_client.py`: `LLAMA_MAX_TOKENS` env 지원 (기본 1024)
4. `hybrid_search.py` + `chat/service.py`: 검색 k 축소

### 2단계 — UX 개선 (이슈 2, 1-C)
5. `documents/service.py`: 스캔 PDF 에러 메시지 개선
6. `index.html`: minimal 프로필 응답 시간 안내

### 3단계 — 언인스톨 정리 (이슈 4)
7. Tauri 2 NSIS 훅 방식 확인 후 구현

---

## 검증 방법
- [ ] llama-server 재시작 후 간단한 질문 응답 시간 측정 (목표: 3분 이내)
- [ ] 앱 강제 종료 후 재시작 → backend 프로세스 1개만 실행 확인
- [ ] 스캔 PDF 업로드 시 개선된 에러 메시지 표시 확인
- [ ] 언인스톨 후 backend.exe 프로세스 없음 확인 (작업 관리자)
