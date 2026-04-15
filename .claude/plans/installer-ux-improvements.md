# 인스톨러 UX 개선 계획

## 개요
- 목적: 3가지 UX 문제 수정 — 모델 다운로드 진행률, 폴더 선택 버그, 설치 후 자동 앱 활성화
- 영향 범위: `installer/src-tauri/src/lib.rs`, `installer/ui/index.html`, `installer/src-tauri/capabilities/default.json`
- 예상 복잡도: 낮음

---

## 배경 설명 (사용자 질문 2·3번 답변)

### PDF 인제스트 폴더 선택이란?
인스톨러 Launcher 패널의 PDF 인제스트 기능은 **RAG(검색 증강 생성)** 를 위한 사전 작업입니다.

- LLM은 기본적으로 모델이 학습한 내용만 답할 수 있음
- PDF 문서를 인제스트하면 → 텍스트 청크 → 벡터 임베딩 → Qdrant(벡터 DB) + Neo4j(온톨로지 그래프) 저장
- 이후 채팅에서 질문하면 → PDF 내용 기반으로 답변 (예: 사내 매뉴얼, 연구 논문, 계약서 등)
- **폴더 선택 버그 원인**: `capabilities/default.json`에 `dialog:allow-open` 권한이 누락됨

### 서비스 실행/종료가 왜 필요한가?
| 상황 | 이유 |
|------|------|
| **PC 재부팅 후** | Docker 컨테이너가 중지되어 있어 앱을 사용하려면 다시 시작 필요 |
| **사용 중 메모리 회수** | Ollama 컨테이너가 프로필에 따라 3~20GB RAM 점유 — 사용 안 할 때 중지 가능 |
| **현재 구현** | docker compose에 `restart: always` 정책 없음 → 재부팅 시 컨테이너 중지 |

개선 방향: 재부팅 후에도 인스톨러를 열어 "서비스 시작" 클릭 → 앱이 자동으로 열리는 흐름으로 단순화.

---

## 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `installer/src-tauri/capabilities/default.json` | 수정 | `dialog:allow-open`, `core:window:allow-create` 권한 추가 |
| `installer/src-tauri/src/lib.rs` | 수정 | `pull_one_model` — JSON 파싱으로 실제 다운로드 퍼센트 계산 |
| `installer/ui/index.html` | 수정 | ① 설치 완료 후 자동 앱 열기, ② Launcher 서비스 시작 완료 시 앱 자동 열기 |

---

## 구현 단계

### 1단계: capabilities 권한 추가 (폴더 선택 버그 수정)

`default.json`에 추가:
```json
"dialog:default",
"core:window:default"
```

- `dialog:default` → `dialog:allow-open` 포함 (폴더/파일 선택 다이얼로그)
- `core:window:default` → `window:allow-create` 포함 (`open_app_window`의 `WebviewWindowBuilder::new`)

### 2단계: 모델 다운로드 실제 진행률 (`lib.rs`)

`pull_one_model` 현재 구현:
- `docker compose exec ollama pull <model>` stdout을 줄 단위로 읽어 줄 수로 퍼센트 보간
- 문제: 실제 다운로드 크기와 무관 → 진행률이 실제 상황을 반영하지 못함

Ollama pull stdout 형식 (JSONL):
```json
{"status":"pulling manifest"}
{"status":"pulling gguf","digest":"sha256:...","total":4891832832,"completed":524288000}
{"status":"verifying sha256 digest"}
{"status":"success"}
```

수정 내용:
- 각 줄을 `serde_json::Value`로 파싱
- `total > 0`이면 `completed/total * range + pct_start`로 실제 퍼센트 계산
- 파싱 실패 시(manifest 확인, verify 단계 등) 기존 줄 수 방식 유지
- `message`를 사람이 읽기 쉬운 형식으로 변환:
  - `"pulling gguf"` → `"다운로드 중: 2.1 GB / 4.6 GB (45%)"` 
  - `"success"` → `"다운로드 완료"`
  - 기타 status → 그대로 표시

### 3단계: 설치 후 자동 앱 열기 (`index.html`)

현재 흐름:
```
설치 완료 → showLauncher() → 사용자가 "앱 열기" 클릭 → openApp()
```

변경 후 흐름:
```
설치 완료 → showLauncher() + openApp() 자동 호출 (1초 delay)
```

Launcher에서 서비스 시작 후 흐름도 개선:
```
현재: start_done 이벤트 → 상태 갱신 (앱 안 열림)
변경: start_done 이벤트 → 상태 갱신 + openApp() 자동 호출
```

Launcher 패널 UI 개선:
- "↗ 앱 열기" 버튼을 가장 눈에 띄게 배치 (primary, full-width)
- 서비스 시작/중지는 보조 버튼으로 유지 (PC 재부팅 후 사용)

---

## 검증 방법
- [ ] `pnpm run build` 성공 (capabilities 오류 없음)
- [ ] 폴더 선택 다이얼로그 열림 확인
- [ ] 모델 다운로드 중 진행 바가 실시간으로 증가 확인
- [ ] 설치 완료 후 앱 창이 자동으로 열림 확인
- [ ] Launcher → 서비스 시작 → 앱 자동 열림 확인
