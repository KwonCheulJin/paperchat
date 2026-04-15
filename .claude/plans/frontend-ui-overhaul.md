# Frontend UI 개선 — Claude Desktop 스타일 채팅 시스템 구현 계획

## 개요

- **목적**: Claude Desktop과 동일한 UX·채팅 시스템을 로컬 LLM 채팅 UI에 적용
- **영향 범위**: `project/frontend/` 전체
- **예상 복잡도**: 높음
- **참고 모델**: Claude Desktop (claude.ai/chat)

---

## Claude Desktop UI 핵심 특성 분석

### 레이아웃

```
┌──────────────────────────────────────────────────────────────────┐
│  ● ● ●                    Claude                                │  ← 타이틀 바
├──────────┬───────────────────────────────────────────────────────┤
│          │                                                       │
│  [+ 새   │                                                       │
│   채팅]  │                                                       │
│          │          대화가 없는 상태:                              │
│  ──────  │          중앙에 "무엇을 도와드릴까요?" 표시              │
│  검색    │                                                       │
│  ──────  │          대화가 있는 상태:                              │
│          │          메시지 버블 (중앙 정렬, max-width 제한)        │
│  Today   │                                                       │
│  ▸ 대화1 │                                                       │
│  ▸ 대화2 │                                                       │
│          │                                                       │
│  Yester  │                                                       │
│  ▸ 대화3 │                                                       │
│          │                                                       │
│          ├───────────────────────────────────────────────────────┤
│          │  ┌─────────────────────────────────────────────────┐  │
│          │  │  메시지 입력...                          📎  ▲  │  │  ← 입력 바
│          │  └─────────────────────────────────────────────────┘  │
│          │  Claude can make mistakes. Check important info.      │
└──────────┴───────────────────────────────────────────────────────┘
```

### 채팅 시스템 핵심 동작

| 항목 | Claude Desktop 동작 |
|------|---------------------|
| 메시지 레이아웃 | User: 우측 정렬 / Assistant: 좌측 정렬 (아이콘 포함) |
| 스트리밍 | 토큰 단위 점진 표시, 타이핑 애니메이션 |
| 스트리밍 중지 | ■ 정지 버튼 → 즉시 중단 |
| 마크다운 | 코드 블록(구문 강조), 테이블, 리스트, 볼드/이탤릭 |
| 코드 블록 | 상단 언어 태그 + 복사 버튼 |
| 새 대화 | 중앙에 환영 메시지 + 제안 프롬프트 카드 |
| 세션 제목 | 첫 응답 후 LLM이 자동 생성 |
| 세션 검색 | Sidebar 상단 검색바 → 제목+내용 필터링 |
| 입력 바 | 라운드 박스, 자동 높이 조절 (최대 약 6줄) |
| 파일 첨부 | 입력 바 내 📎 아이콘 → 파일 선택/드래그앤드롭 |
| 입력 바 하단 | 면책 텍스트 표시 |
| 사이드바 | 접기/펼치기 토글, 부드러운 트랜지션 |
| 사이드바 세션 | hover 시 ⋯ 메뉴 (이름 변경, 삭제) |
| 스크롤 | 자동 하단 스크롤 + "↓ 새 메시지" 플로팅 버튼 |
| 반응형 | 좁은 화면에서 사이드바 오버레이로 전환 |
| 키보드 | Enter: 전송, Shift+Enter: 줄바꿈, Esc: 입력 포커스 해제 |

---

## 현재 구현 vs Claude Desktop 비교

| 항목 | 현재 | Claude Desktop | 격차 |
|------|------|---------------|------|
| **사이드바** | 고정 240px, 접기 불가 | 접기/펼치기 토글 + 반응형 오버레이 | 🔴 |
| **세션 검색** | 없음 | 검색바 → 제목+내용 필터 | 🔴 |
| **세션 메뉴** | hover 시 × 버튼만 | ⋯ 메뉴 (이름 변경, 삭제) | 🟠 |
| **새 대화 화면** | 즉시 빈 채팅 | 환영 메시지 + 제안 프롬프트 카드 | 🔴 |
| **메시지 레이아웃** | 좌/우 정렬 (간단) | 아이콘 포함 좌/우 정렬, 중앙 max-width 컨테이너 | 🟠 |
| **마크다운 렌더링** | 없음 (plain text) | 코드 블록, 테이블, 리스트, 구문 강조 | 🔴 |
| **코드 블록** | 없음 | 언어 태그 + 복사 버튼 + 구문 강조 | 🔴 |
| **스트리밍 중지** | 없음 (AbortController만 내부 보유) | ■ 정지 버튼 UI | 🔴 |
| **입력 바** | 고정 높이 textarea | 자동 높이 조절 라운드 박스 | 🟠 |
| **파일 첨부 UI** | Header 우측 별도 버튼 | 입력 바 내 📎 아이콘 | 🟠 |
| **자동 스크롤** | 있음 (bottomRef) | 있음 + "↓ 새 메시지" 플로팅 버튼 | 🟡 |
| **반응형** | 없음 | 모바일 사이드바 오버레이 | 🔴 |
| **다크 테마** | 고정 다크 (#0f0f0f) | 시스템 설정 연동 + 수동 토글 | 🟡 |
| **키보드 단축키** | Enter/Shift+Enter만 | + Esc, Ctrl+N 등 | 🟡 |
| **세션 제목 생성** | 첫 메시지 앞 30자 | LLM이 자동 요약 생성 | 🟠 |
| **스타일링** | 인라인 스타일 | 체계적 디자인 시스템 | 🔴 |
| **접근성** | 거의 없음 | ARIA, 포커스 관리 등 | 🔴 |

---

## 파일 변경 목록

### Phase A — shadcn/ui + Tailwind CSS v4 기반 전환

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `package.json` | **수정** | tailwindcss v4, @tailwindcss/postcss, react-markdown, remark-gfm, rehype-highlight, react-textarea-autosize 추가 |
| `src/app/globals.css` | **수정** | Tailwind v4 directives + CSS 변수 기반 색상 시스템 + 커스텀 스크롤바 |
| `src/app/layout.tsx` | **수정** | 인라인 스타일 → Tailwind 클래스 + dark class 토글 |
| `postcss.config.mjs` | **신규** | @tailwindcss/postcss 설정 |
| `src/components/ui/` | **신규** | shadcn/ui 컴포넌트 (button, input, dropdown-menu, dialog, sidebar, tooltip 등) |
| `src/lib/utils.ts` | **신규** | cn() 유틸리티 (clsx + tailwind-merge) |

### Phase B — 채팅 코어 + 파일/폴더 인제스트 개선

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/shared/ui/markdown-renderer.tsx` | **신규** | react-markdown + 코드 블록(구문 강조 + 복사) + 테이블 |
| `src/features/chat/ui/message-bubble.tsx` | **수정** | 마크다운 렌더링, 아이콘 레이아웃, 복사 버튼 |
| `src/features/chat/ui/chat-window.tsx` | **수정** | 중앙 max-width 컨테이너, "↓ 새 메시지" 플로팅 버튼 |
| `src/features/chat/ui/input-bar.tsx` | **수정** | 자동 높이 조절, 라운드 박스, 📎 파일 첨부 통합, ■ 중지 버튼 |
| `src/features/upload-pdf/ui/file-upload.tsx` | **수정** | 다중 파일 + 폴더 선택 + 드래그앤드롭(파일/폴더) + 인제스트 큐 + 진행률 |
| `src/features/upload-pdf/ui/ingest-panel.tsx` | **신규** | 인제스트 진행 상태 패널 (파일 목록 + 개별 진행률 + 전체 진행률) |
| `src/features/upload-pdf/model/ingest-queue.ts` | **신규** | 인제스트 큐 상태 관리 (대기/진행/완료/실패) |
| `src/features/chat/ui/welcome-screen.tsx` | **신규** | 빈 대화 시 환영 메시지 + 제안 프롬프트 카드 |
| `src/features/chat/ui/stop-button.tsx` | **신규** | 스트리밍 중지 ■ 버튼 |
| `project/backend/app/documents/router.py` | **수정** | 다중 파일 업로드 엔드포인트 추가 (`POST /documents/ingest/batch`) |
| `project/backend/app/documents/service.py` | **수정** | 배치 인제스트 + 개별 진행 상태 SSE 스트리밍 |

### Phase C — 사이드바 고도화

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/widgets/session-sidebar/ui/session-sidebar.tsx` | **수정** | 접기/펼치기, 검색바, ⋯ 컨텍스트 메뉴, 반응형 오버레이 |
| `src/widgets/session-sidebar/ui/session-menu.tsx` | **신규** | ⋯ 드롭다운 (이름 변경, 삭제) |
| `src/widgets/session-sidebar/ui/search-bar.tsx` | **신규** | 세션 검색 (제목 + 메시지 내용 필터링) |
| `src/entities/session/model/store.ts` | **수정** | 검색 API, 이름 변경 기능 추가 |

### Phase D — 세션 제목 자동 생성 + 키보드 + 접근성

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/shared/api/index.ts` | **수정** | 세션 제목 생성 API 호출 추가 |
| `src/pages/chat/ui/chat-page.tsx` | **수정** | LLM 제목 생성 호출, 키보드 단축키, ARIA 속성 |
| `src/shared/hooks/use-keyboard-shortcuts.ts` | **신규** | 글로벌 키보드 단축키 훅 |

---

## Phase A: shadcn/ui + Tailwind CSS v4 기반 전환

### 목표

인라인 스타일 → shadcn/ui 컴포넌트 + Tailwind CSS v4 CSS 변수 시스템으로 전환

### 기술 스택

- **Tailwind CSS v4**: `@import "tailwindcss"` 방식, `@theme inline` 블록으로 디자인 토큰 정의
- **shadcn/ui**: Button, Input, DropdownMenu, Dialog, Sidebar, Tooltip, ScrollArea 등 활용
- **CSS 변수 기반 테마**: oklch 색공간, `:root` (라이트) / `.dark` (다크) 전환 지원

### 색상 시스템 (globals.css — CSS 변수)

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(0.9818 0.0054 95.0986);
  --foreground: oklch(0.3438 0.0269 95.7226);
  --card: oklch(0.9818 0.0054 95.0986);
  --card-foreground: oklch(0.1908 0.0020 106.5859);
  --popover: oklch(1.0000 0 0);
  --popover-foreground: oklch(0.2671 0.0196 98.9390);
  --primary: oklch(0.6171 0.1375 39.0427);
  --primary-foreground: oklch(1.0000 0 0);
  --secondary: oklch(0.9245 0.0138 92.9892);
  --secondary-foreground: oklch(0.4334 0.0177 98.6048);
  --muted: oklch(0.9341 0.0153 90.2390);
  --muted-foreground: oklch(0.6059 0.0075 97.4233);
  --accent: oklch(0.9245 0.0138 92.9892);
  --accent-foreground: oklch(0.2671 0.0196 98.9390);
  --destructive: oklch(0.1908 0.0020 106.5859);
  --destructive-foreground: oklch(1.0000 0 0);
  --border: oklch(0.8847 0.0069 97.3627);
  --input: oklch(0.7621 0.0156 98.3528);
  --ring: oklch(0.6171 0.1375 39.0427);
  --sidebar: oklch(0.9663 0.0080 98.8792);
  --sidebar-foreground: oklch(0.3590 0.0051 106.6524);
  --sidebar-primary: oklch(0.6171 0.1375 39.0427);
  --sidebar-primary-foreground: oklch(0.9881 0 0);
  --sidebar-accent: oklch(0.9245 0.0138 92.9892);
  --sidebar-accent-foreground: oklch(0.3250 0 0);
  --sidebar-border: oklch(0.9401 0 0);
  --radius: 0.5rem;
  /* ... 폰트, 그림자 등 */
}

.dark {
  --background: oklch(0.2679 0.0036 106.6427);
  --foreground: oklch(0.8074 0.0142 93.0137);
  --card: oklch(0.2679 0.0036 106.6427);
  --card-foreground: oklch(0.9818 0.0054 95.0986);
  --primary: oklch(0.6724 0.1308 38.7559);
  --primary-foreground: oklch(1.0000 0 0);
  --muted: oklch(0.2213 0.0038 106.7070);
  --muted-foreground: oklch(0.7713 0.0169 99.0657);
  --accent: oklch(0.2130 0.0078 95.4245);
  --accent-foreground: oklch(0.9663 0.0080 98.8792);
  --border: oklch(0.3618 0.0101 106.8928);
  --input: oklch(0.4336 0.0113 100.2195);
  --sidebar: oklch(0.2357 0.0024 67.7077);
  --sidebar-foreground: oklch(0.8074 0.0142 93.0137);
  --sidebar-accent: oklch(0.1680 0.0020 106.6177);
  --sidebar-accent-foreground: oklch(0.8074 0.0142 93.0137);
  /* ... */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  /* 그림자, 폰트 등 */
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  /* 커스텀 스크롤바 */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: oklch(0.5 0 0 / 0.2);
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover { background: oklch(0.5 0 0 / 0.35); }
}
```

### shadcn/ui 컴포넌트 활용 계획

| shadcn/ui 컴포넌트 | 적용 위치 |
|-------------------|----------|
| `Sidebar` | 세션 사이드바 (접기/펼치기 내장) |
| `Button` | 전송, 중지, 새 채팅, 파일 첨부 등 모든 버튼 |
| `Input` | 세션 검색, 세션 이름 변경 인라인 입력 |
| `DropdownMenu` | 세션 ⋯ 컨텍스트 메뉴 |
| `Dialog` | 삭제 확인 다이얼로그 |
| `Tooltip` | 버튼 hover 시 설명 (접근성 향상) |
| `ScrollArea` | 채팅 메시지 영역 + 세션 목록 (커스텀 스크롤바) |
| `Card` | 환영 화면 제안 프롬프트 카드 |
| `Badge` | 파일 업로드 상태, 세션 날짜 그룹 라벨 |

### cn() 유틸리티

```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### Tailwind CSS v4 주요 차이점 (구현 시 주의)

| 항목 | v3 | v4 |
|------|-----|-----|
| 진입점 | `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| 설정 | `tailwind.config.ts` | `globals.css` 내 `@theme inline {}` 블록 |
| 다크 모드 | `darkMode: 'class'` (config) | `@custom-variant dark (&:is(.dark *))` (CSS) |
| 색상 참조 | `theme('colors.accent.DEFAULT')` | `var(--accent)` 직접 사용 |
| postcss | `tailwindcss` 플러그인 | `@tailwindcss/postcss` 플러그인 |

### postcss.config.mjs

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

### 다크 모드 전환 (라이트/다크 토글 지원)

```typescript
// shared/hooks/use-theme.ts
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark'
    return localStorage.getItem('theme') as 'light' | 'dark' || 'dark'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  return { theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }
}
```

**기본값: 다크 모드** (기존 설계 유지). 라이트 모드는 CSS 변수만으로 자동 전환됨.

---

## Phase B: 채팅 코어 개선

### B-1. 마크다운 렌더링

**신규 의존성**: `react-markdown`, `remark-gfm`, `rehype-highlight`

```typescript
// shared/ui/markdown-renderer.tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface Props {
  content: string
}

export function MarkdownRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // 코드 블록: 언어 태그 + 복사 버튼
        code({ className, children, ...props }) {
          const lang = className?.replace('language-', '')
          const isBlock = !!lang
          if (isBlock) {
            return (
              <div className="relative group rounded-lg overflow-hidden my-3">
                <div className="flex justify-between items-center px-4 py-2 bg-code-header text-text-secondary text-xs">
                  <span>{lang}</span>
                  <CopyButton text={String(children)} />
                </div>
                <pre className="bg-code-bg p-4 overflow-x-auto">
                  <code className={className} {...props}>{children}</code>
                </pre>
              </div>
            )
          }
          // 인라인 코드
          return (
            <code className="bg-code-bg px-1.5 py-0.5 rounded text-sm" {...props}>
              {children}
            </code>
          )
        },
        // 테이블: 가로 스크롤 + 스타일
        table({ children }) {
          return (
            <div className="overflow-x-auto my-3">
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          )
        },
        th({ children }) {
          return <th className="border border-border px-3 py-2 bg-bg-tertiary text-left">{children}</th>
        },
        td({ children }) {
          return <td className="border border-border px-3 py-2">{children}</td>
        },
      }}
    />
  )
}
```

### B-2. 메시지 버블 (Claude 스타일)

```
Assistant 메시지:
┌─────────────────────────────────────────────┐
│  🤖  안녕하세요. 분석 결과를 알려드리겠습니다.  │
│                                              │
│  ## 주요 발견사항                              │
│  1. 매출이 전년 대비 15% 증가...              │
│                                              │
│  ```python                        [📋 복사]  │
│  df.groupby('category').sum()                │
│  ```                                         │
└─────────────────────────────────────────────┘

User 메시지:
                    ┌──────────────────────────┐
                    │  매출 데이터를 분석해줘    │
                    └──────────────────────────┘
```

**변경 사항 — `message-bubble.tsx`**:
- Assistant: 좌측 아이콘(🤖) + 마크다운 렌더링 + 하단 복사 버튼
- User: 우측 정렬 + bg-message-user 배경 + 라운드 박스
- 전체 메시지 영역: `max-w-chat mx-auto` (중앙 정렬, 최대 48rem)

### B-3. 파일/폴더 인제스트 (다중 PDF + 폴더 지원)

**현재 문제**: 웹 UI에서 단일 PDF 1개만 업로드 가능. 폴더 선택 불가. 진행률 표시 없음.

**목표**: Claude Desktop처럼 📎 클릭 시 파일/폴더 모두 선택 가능 + 다중 파일 드래그앤드롭 + 인제스트 진행 상태 실시간 표시

#### 파일 첨부 UI 흐름

```
📎 클릭:
┌──────────────────┐
│ 📄 PDF 파일 선택  │  ← input[type=file][multiple][accept=.pdf]
│ 📁 폴더 선택      │  ← input[type=file][webkitdirectory]
└──────────────────┘

드래그앤드롭:
┌───────────────────────────────────────────────────┐
│                                                    │
│    ┌────────────────────────────────────────┐      │
│    │  📁 파일 또는 폴더를 여기에 놓으세요     │      │
│    │     PDF 파일만 처리됩니다                │      │
│    └────────────────────────────────────────┘      │
│                                                    │
└───────────────────────────────────────────────────┘
```

#### 인제스트 진행 패널 (입력 바 상단에 표시)

```
┌───────────────────────────────────────────────────────────────┐
│  📄 문서 인제스트                              3/12  [✕ 닫기] │
│  ──────────────────────────────────────────────────────────── │
│  ████████████████████████████░░░░░░░░░  25%                  │
│                                                               │
│  ✅ report-2024.pdf              완료  (128 청크)             │
│  ✅ contract-summary.pdf         완료  (64 청크)              │
│  🔄 financial-data.pdf           처리 중...                   │
│  ⏳ meeting-notes.pdf            대기                         │
│  ⏳ policy-v3.pdf                대기                         │
│  ...                                                          │
│                                              [인제스트 중지]   │
└───────────────────────────────────────────────────────────────┘
```

#### 인제스트 큐 상태 관리

```typescript
// features/upload-pdf/model/ingest-queue.ts
export type IngestStatus = 'pending' | 'uploading' | 'processing' | 'done' | 'error'

export interface IngestItem {
  id: string
  file: File
  filename: string
  status: IngestStatus
  chunks?: number       // 완료 시 청크 수
  error?: string        // 실패 시 에러 메시지
  progress?: number     // 0~100 (업로드 진행률)
}

export interface IngestQueue {
  items: IngestItem[]
  isRunning: boolean
  currentIndex: number
}

export function createIngestQueue(): IngestQueue {
  return { items: [], isRunning: false, currentIndex: 0 }
}

export function addFiles(queue: IngestQueue, files: File[]): IngestQueue {
  const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'))
  const newItems: IngestItem[] = pdfFiles.map(file => ({
    id: crypto.randomUUID(),
    file,
    filename: file.name,
    status: 'pending',
  }))
  return { ...queue, items: [...queue.items, ...newItems] }
}
```

#### 파일 첨부 컴포넌트 (file-upload.tsx 수정)

```typescript
// features/upload-pdf/ui/file-upload.tsx
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Paperclip, File, FolderOpen } from 'lucide-react'

export function FileAttachButton({ onFilesSelected }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    onFilesSelected(files)
    e.target.value = ''  // 동일 파일 재선택 허용
  }

  function handleFolderChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    // 폴더 내 PDF만 필터링
    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'))
    onFilesSelected(pdfFiles)
    e.target.value = ''
  }

  return (
    <>
      {/* 숨겨진 input 2개 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        multiple                           // ← 다중 파일 선택
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        className="hidden"
        onChange={handleFolderChange}
      />

      {/* 📎 버튼 → 드롭다운 (파일/폴더 선택) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="m-1">
            <Paperclip className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <File className="h-4 w-4 mr-2" /> PDF 파일 선택
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
            <FolderOpen className="h-4 w-4 mr-2" /> 폴더 선택
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
```

#### 드래그앤드롭 (파일 + 폴더 지원)

```typescript
// chat-page.tsx에서 전체 채팅 영역에 드래그앤드롭 적용
const [dragOver, setDragOver] = useState(false)

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  setDragOver(false)

  const items = Array.from(e.dataTransfer.items)
  const files: File[] = []

  for (const item of items) {
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry?.()
      if (entry?.isDirectory) {
        // 폴더: 재귀적으로 PDF 파일 수집
        const folderFiles = await readDirectoryRecursive(entry as FileSystemDirectoryEntry)
        files.push(...folderFiles.filter(f => f.name.toLowerCase().endsWith('.pdf')))
      } else {
        const file = item.getAsFile()
        if (file?.name.toLowerCase().endsWith('.pdf')) {
          files.push(file)
        }
      }
    }
  }

  if (files.length > 0) {
    addToIngestQueue(files)
  }
}

// 폴더 재귀 읽기 유틸
async function readDirectoryRecursive(dirEntry: FileSystemDirectoryEntry): Promise<File[]> {
  const reader = dirEntry.createReader()
  const files: File[] = []

  const entries = await new Promise<FileSystemEntry[]>((resolve) => {
    reader.readEntries(resolve)
  })

  for (const entry of entries) {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve) => {
        (entry as FileSystemFileEntry).file(resolve)
      })
      files.push(file)
    } else if (entry.isDirectory) {
      const subFiles = await readDirectoryRecursive(entry as FileSystemDirectoryEntry)
      files.push(...subFiles)
    }
  }

  return files
}
```

#### 인제스트 진행 패널

```typescript
// features/upload-pdf/ui/ingest-panel.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { X, CheckCircle, Loader2, Clock, AlertCircle } from 'lucide-react'

export function IngestPanel({ queue, onStop, onDismiss }: Props) {
  const completed = queue.items.filter(i => i.status === 'done').length
  const total = queue.items.length
  const overallProgress = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <Card className="mx-auto max-w-3xl mb-3 animate-in slide-in-from-bottom-2">
      <CardHeader className="py-3 flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          문서 인제스트
          <Badge variant="secondary">{completed}/{total}</Badge>
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* 전체 진행률 */}
        <Progress value={overallProgress} className="h-2" />

        {/* 파일 목록 */}
        <ScrollArea className="max-h-40">
          {queue.items.map(item => (
            <div key={item.id} className="flex items-center justify-between py-1.5 text-sm">
              <div className="flex items-center gap-2 truncate">
                <StatusIcon status={item.status} />
                <span className="truncate">{item.filename}</span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                {item.status === 'done' && `${item.chunks} 청크`}
                {item.status === 'error' && item.error}
                {item.status === 'uploading' && '업로드 중...'}
                {item.status === 'processing' && '처리 중...'}
                {item.status === 'pending' && '대기'}
              </span>
            </div>
          ))}
        </ScrollArea>

        {/* 중지 버튼 */}
        {queue.isRunning && (
          <Button variant="outline" size="sm" className="w-full" onClick={onStop}>
            인제스트 중지
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function StatusIcon({ status }: { status: IngestStatus }) {
  switch (status) {
    case 'done':       return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'uploading':
    case 'processing': return <Loader2 className="h-4 w-4 text-primary animate-spin" />
    case 'error':      return <AlertCircle className="h-4 w-4 text-destructive" />
    default:           return <Clock className="h-4 w-4 text-muted-foreground" />
  }
}
```

#### 백엔드 배치 인제스트 API

```python
# backend/app/documents/router.py — 추가
@router.post("/ingest/batch")
async def ingest_batch(files: list[UploadFile] = File(...)):
    """다중 PDF 일괄 인제스트 — SSE로 개별 진행 상태 반환"""
    async def stream():
        for i, file in enumerate(files):
            if not file.filename or not file.filename.endswith(".pdf"):
                yield f"data: {json.dumps({'index': i, 'filename': file.filename, 'status': 'error', 'error': 'PDF가 아닙니다'})}\n\n"
                continue

            yield f"data: {json.dumps({'index': i, 'filename': file.filename, 'status': 'processing'})}\n\n"

            try:
                pdf_bytes = await file.read()
                result = await ingest_pdf(pdf_bytes, file.filename)
                yield f"data: {json.dumps({'index': i, 'filename': file.filename, 'status': 'done', 'doc_id': result['doc_id'], 'chunks': result['chunks']})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'index': i, 'filename': file.filename, 'status': 'error', 'error': str(e)})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
```

#### 프론트엔드 API 확장

```typescript
// shared/api/index.ts — 추가
export async function uploadPdfBatch(
  files: File[],
  onProgress: (event: IngestEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const formData = new FormData()
  files.forEach(file => formData.append('files', file))

  const resp = await fetch(`${API_URL}/documents/ingest/batch`, {
    method: 'POST',
    body: formData,
    signal,
  })

  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        const event = JSON.parse(line.slice(6))
        onProgress(event)
      }
    }
  }
}
```

### B-4. 입력 바 (Claude 스타일)

```
┌─────────────────────────────────────────────────────┐
│  📎  메시지를 입력하세요...                    ▲    │
│                                              ■(중지)│
└─────────────────────────────────────────────────────┘
  이 AI는 실수할 수 있습니다. 중요한 정보는 확인하세요.
```

**변경 사항 — `input-bar.tsx`**:

```typescript
import TextareaAutosize from 'react-textarea-autosize'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// 입력 바 구조
<div className="border-t border-border bg-background px-4 py-3">
  <div className="mx-auto max-w-3xl">
    <div className={cn(
      "relative flex items-end rounded-2xl border border-input bg-card",
      "focus-within:ring-2 focus-within:ring-ring transition-all"
    )}>
      {/* 📎 파일 첨부 버튼 (좌측) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="m-1" onClick={handleFileSelect}>
            <Paperclip className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>PDF 파일 첨부</TooltipContent>
      </Tooltip>

      {/* 자동 높이 조절 textarea */}
      <TextareaAutosize
        minRows={1}
        maxRows={6}
        placeholder="메시지를 입력하세요..."
        className="flex-1 resize-none bg-transparent py-3 px-2
                   text-foreground placeholder:text-muted-foreground
                   focus:outline-none"
        onKeyDown={handleKeyDown}
      />

      {/* 전송 / 중지 버튼 (우측) */}
      {streaming
        ? <StopButton onClick={handleStop} />
        : <Button size="icon" className="m-1 rounded-full" onClick={handleSend}
                  disabled={!input.trim()}>
            <ArrowUp className="h-4 w-4" />
          </Button>
      }
    </div>

    {/* 면책 텍스트 */}
    <p className="text-center text-muted-foreground text-xs mt-2">
      이 AI는 실수할 수 있습니다. 중요한 정보는 확인하세요.
    </p>
  </div>
</div>
```

### B-4. 환영 화면 (새 대화)

대화가 없을 때 채팅 영역 중앙에 표시

```typescript
// features/chat/ui/welcome-screen.tsx
import { Card, CardContent } from '@/components/ui/card'

interface Props {
  onSuggestionClick: (prompt: string) => void
}

export function WelcomeScreen({ onSuggestionClick }: Props) {
  const suggestions = [
    { icon: '📄', title: 'PDF 문서 분석', prompt: '업로드한 PDF 문서의 핵심 내용을 요약해줘' },
    { icon: '🔍', title: '문서 검색', prompt: '특정 키워드가 포함된 문서 내용을 찾아줘' },
    { icon: '📊', title: '데이터 추출', prompt: '문서에서 표나 수치 데이터를 추출해줘' },
    { icon: '💡', title: '질문하기', prompt: '문서 내용에 대해 자유롭게 질문해보세요' },
  ]

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-medium text-foreground mb-2">
        무엇을 도와드릴까요?
      </h1>
      <p className="text-muted-foreground mb-8">
        PDF 문서를 업로드하고 질문해보세요
      </p>
      <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
        {suggestions.map(s => (
          <Card
            key={s.title}
            className="cursor-pointer hover:border-ring transition-colors"
            onClick={() => onSuggestionClick(s.prompt)}
          >
            <CardContent className="flex items-start gap-3 p-4">
              <span className="text-xl">{s.icon}</span>
              <div>
                <div className="text-sm font-medium text-card-foreground">{s.title}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.prompt}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

### B-5. 스트리밍 중지 버튼

```typescript
// features/chat/ui/stop-button.tsx
import { Button } from '@/components/ui/button'
import { Square } from 'lucide-react'

export function StopButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="default"
      size="icon"
      className="m-1 rounded-full"
      onClick={onClick}
      aria-label="응답 중지"
    >
      <Square className="h-3 w-3 fill-current" />
    </Button>
  )
}
```

### B-6. "↓ 새 메시지" 플로팅 버튼

```typescript
// features/chat/ui/scroll-to-bottom.tsx
import { Button } from '@/components/ui/button'
import { ArrowDown } from 'lucide-react'

export function ScrollToBottom({ onClick, visible }: Props) {
  if (!visible) return null
  return (
    <Button
      variant="secondary"
      size="sm"
      className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full
                 shadow-lg animate-in fade-in slide-in-from-bottom-2"
      onClick={onClick}
    >
      <ArrowDown className="h-3 w-3 mr-1" />
      새 메시지
    </Button>
  )
}
```

---

## Phase C: 사이드바 고도화

### C-1. shadcn/ui Sidebar 기반 구현

shadcn/ui `Sidebar` 컴포넌트를 사용하면 접기/펼치기, 반응형(모바일 Sheet 오버레이), 키보드 단축키(Ctrl+B)가 내장되어 있어 직접 구현할 코드가 크게 줄어듦.

```
펼친 상태 (280px):                     접은 상태 (아이콘만):
┌──────────────┐                       ┌──┐
│ [≡]  새 채팅 │                       │≡ │
│ ┌──────────┐ │                       │+ │
│ │ 🔍 검색  │ │                       └──┘
│ └──────────┘ │
│              │
│ Today        │
│ ▸ PDF 분석.. │ ← hover 시 ⋯ 메뉴
│ ▸ 계약서 검  │
│              │
│ Yesterday    │
│ ▸ 보고서 질  │
└──────────────┘
```

```typescript
// session-sidebar.tsx — shadcn/ui Sidebar 활용
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupLabel, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarTrigger,
} from '@/components/ui/sidebar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function SessionSidebar({ sessions, activeId, onSelect, onCreate, onDelete, onRename }) {
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = sessions.filter(s =>
    s.title.includes(searchQuery) ||
    s.messages.some(m => m.content.includes(searchQuery))
  )
  const grouped = groupByDate(filtered)

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader>
        <Button variant="outline" className="w-full justify-start" onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" /> 새 채팅
        </Button>
        <Input
          placeholder="검색..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="mt-2"
        />
      </SidebarHeader>
      <SidebarContent>
        <ScrollArea className="flex-1">
          {Object.entries(grouped).map(([label, items]) => (
            <SidebarGroup key={label}>
              <SidebarGroupLabel>{label}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map(session => (
                  <SidebarMenuItem key={session.id}>
                    <SidebarMenuButton
                      isActive={session.id === activeId}
                      onClick={() => onSelect(session.id)}
                    >
                      {session.title}
                    </SidebarMenuButton>
                    {/* hover 시 ⋯ 메뉴 */}
                    <SessionMenu session={session} onRename={onRename} onDelete={onDelete} />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  )
}

// 레이아웃에서 SidebarProvider로 감싸기
// pages/chat/ui/chat-page.tsx
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'

export default function ChatPage() {
  return (
    <SidebarProvider>
      <SessionSidebar ... />
      <SidebarInset>
        {/* 채팅 영역 */}
      </SidebarInset>
    </SidebarProvider>
  )
}
```

### C-2. 세션 컨텍스트 메뉴 (⋯) — shadcn/ui DropdownMenu

```typescript
// session-menu.tsx
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

export function SessionMenu({ session, onRename, onDelete }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onRename(session.id, session.title)}>
          <Pencil className="h-4 w-4 mr-2" /> 이름 변경
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => onDelete(session.id)}
        >
          <Trash2 className="h-4 w-4 mr-2" /> 삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### C-3. SessionStore 확장

```typescript
// entities/session/model/store.ts 추가 메서드
export const SessionStore = {
  // 기존 메서드 유지
  ...existing,

  // 신규
  rename(id: string, title: string): void     // 세션 이름 변경
  search(query: string): Session[]             // 제목+메시지 내용 검색
}
```

---

## Phase D: 세션 제목 자동 생성 + 키보드 + 접근성

### D-1. LLM 기반 세션 제목 생성

**현재**: 첫 메시지 앞 30자 자르기
**변경**: 첫 응답 완료 후 LLM에 제목 요약 요청

```typescript
// 제목 생성 요청 (백엔드 신규 엔드포인트 필요)
// POST /api/chat/title
// Body: { messages: [{ role, content }] }  ← 첫 Q&A 1쌍만 전달
// 응답: { title: "PDF 매출 데이터 분석 요청" }

async function generateTitle(messages: Message[]): Promise<string> {
  try {
    const resp = await fetch(`${API_URL}/chat/title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.slice(0, 2) }),
    })
    const data = await resp.json()
    return data.title || messages[0].content.slice(0, 30)
  } catch {
    // 폴백: 기존 방식
    return messages[0].content.slice(0, 30)
  }
}
```

**백엔드 추가 필요**:

```python
# backend/app/chat/router.py 추가
@router.post("/title")
async def generate_title(req: TitleRequest):
    """대화 내용 기반 세션 제목 생성 (비스트리밍)"""
    messages = [
        {"role": "system", "content": "아래 대화를 요약하는 짧은 제목(15자 이내)을 한글로 생성하세요. 제목만 출력하세요."},
        *[m.model_dump() for m in req.messages],
    ]
    resp = await client.post(
        f"{settings.ollama_base_url}/api/chat",
        json={"model": settings.ollama_model, "messages": messages, "stream": False},
        timeout=30,
    )
    content = resp.json()["message"]["content"].strip().strip('"')
    return {"title": content[:20]}
```

### D-2. 키보드 단축키

```typescript
// shared/hooks/use-keyboard-shortcuts.ts
export function useKeyboardShortcuts(handlers: {
  onNewChat: () => void
  onToggleSidebar: () => void
  onStopStreaming: () => void
  onFocusInput: () => void
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl/Cmd + N: 새 채팅
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        handlers.onNewChat()
      }
      // Ctrl/Cmd + B: 사이드바 토글
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        handlers.onToggleSidebar()
      }
      // Escape: 스트리밍 중지 / 포커스 해제
      if (e.key === 'Escape') {
        handlers.onStopStreaming()
      }
      // /: 입력 바 포커스 (채팅 영역에서)
      if (e.key === '/' && !isInputFocused()) {
        e.preventDefault()
        handlers.onFocusInput()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlers])
}
```

### D-3. 접근성 (ARIA)

주요 적용 위치:

```typescript
// 사이드바
<nav role="navigation" aria-label="대화 목록">
  <button aria-label="새 채팅 시작">...</button>
  <input role="searchbox" aria-label="대화 검색" />
  <ul role="list">
    <li role="listitem" aria-current={isActive ? 'true' : undefined}>...</li>
  </ul>
</nav>

// 채팅 영역
<main role="main" aria-label="채팅">
  <div role="log" aria-live="polite" aria-label="메시지 목록">
    {messages.map(m => (
      <div role="article" aria-label={`${m.role} 메시지`}>...</div>
    ))}
  </div>
</main>

// 입력 바
<textarea
  aria-label="메시지 입력"
  aria-describedby="input-hint"
/>
<p id="input-hint" className="sr-only">Enter로 전송, Shift+Enter로 줄바꿈</p>
```

---

## Phase E: 시스템 프롬프트 편집 설정

### 목표

사용자가 UI에서 RAG 응답에 사용되는 시스템 프롬프트를 직접 편집할 수 있도록 설정 페이지를 구성한다. Claude Desktop의 "프로젝트 지시사항(Custom Instructions)" 방식과 유사하게 구현.

### UI 레이아웃

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚙️ 설정                                                  [닫기] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  시스템 프롬프트                                                   │
│  ──────────────────                                              │
│  AI의 응답 방식과 규칙을 정의합니다.                                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 당신은 사내 문서 기반 질의응답 어시스턴트입니다.              │  │
│  │                                                            │  │
│  │ ## 규칙                                                    │  │
│  │ 1. 반드시 제공된 문서 내용만을 근거로 답변하세요.            │  │
│  │ 2. 답변의 각 주장마다 [출처: 파일명] 형태로 근거를 표기...   │  │
│  │ 3. 문서에 없는 내용은 "제공된 문서에서 해당 정보를...        │  │
│  │                                                            │  │
│  │                                              (높이 자동 조절) │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────┐                                    │
│  │ 📋 프리셋               ▾│                                    │
│  ├──────────────────────────┤                                    │
│  │ ▸ 기본 (출처 표기)        │                                    │
│  │ ▸ 간결한 답변             │                                    │
│  │ ▸ 상세 분석               │                                    │
│  │ ▸ 영어 응답               │                                    │
│  └──────────────────────────┘                                    │
│                                                                  │
│  미리보기                                                         │
│  ──────────                                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ system: "당신은 사내 문서 기반 질의응답 어시스턴트입니다..."  │  │
│  │                                                            │  │
│  │ {context}  ← 검색 결과가 여기에 삽입됩니다                   │  │
│  │ {entities} ← 엔티티 정보가 여기에 삽입됩니다                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│              [기본값 복원]                      [저장]            │
└──────────────────────────────────────────────────────────────────┘
```

### 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/pages/settings/ui/settings-page.tsx` | **신규** | 설정 페이지 (시스템 프롬프트 편집) |
| `src/pages/settings/ui/prompt-editor.tsx` | **신규** | 프롬프트 편집 textarea + 미리보기 + 프리셋 |
| `src/entities/settings/model/types.ts` | **신규** | AppSettings 타입 정의 |
| `src/entities/settings/model/store.ts` | **신규** | localStorage 기반 설정 CRUD |
| `src/shared/api/index.ts` | **수정** | 설정 조회/저장 API 추가 |
| `project/backend/app/settings/router.py` | **신규** | GET/PUT /settings 엔드포인트 |
| `project/backend/app/settings/service.py` | **신규** | 설정 파일 읽기/쓰기 |
| `project/backend/app/chat/service.py` | **수정** | 하드코딩된 프롬프트 → 설정에서 로드 |

### 데이터 구조

```typescript
// entities/settings/model/types.ts
export interface AppSettings {
  systemPrompt: string         // 사용자 편집 가능한 시스템 프롬프트
  activePreset: string | null  // 현재 적용된 프리셋 이름 (커스텀이면 null)
}

export interface PromptPreset {
  id: string
  name: string
  description: string
  prompt: string
}
```

### 프리셋 목록

```typescript
// 내장 프리셋 (하드코딩)
const PRESETS: PromptPreset[] = [
  {
    id: 'default',
    name: '기본 (출처 표기)',
    description: '문서 근거 기반 답변 + [출처] 태그',
    prompt: `당신은 사내 문서 기반 질의응답 어시스턴트입니다.

## 규칙
1. 반드시 제공된 문서 내용만을 근거로 답변하세요.
2. 답변의 각 주장마다 [출처: 파일명] 형태로 근거를 표기하세요.
3. 문서에 없는 내용은 "제공된 문서에서 해당 정보를 찾을 수 없습니다"라고 답하세요.
4. 먼저 관련 내용을 정리한 뒤 최종 답변을 작성하세요.

## 참고 문서
{context}

## 관련 엔티티 및 관계
{entities}`,
  },
  {
    id: 'concise',
    name: '간결한 답변',
    description: '핵심만 짧게 답변',
    prompt: `당신은 사내 문서 기반 어시스턴트입니다. 핵심만 간결하게 답변하세요.
- 3문장 이내로 답변
- 불필요한 서론 없이 바로 본론
- 출처: [파일명]

{context}`,
  },
  {
    id: 'detailed',
    name: '상세 분석',
    description: '깊이 있는 분석 + 근거 + 추가 질문 제안',
    prompt: `당신은 사내 문서 전문 분석가입니다.

## 답변 형식
1. **요약**: 핵심 내용 1~2문장
2. **상세 분석**: 관련 문서 내용을 구조화하여 설명
3. **근거**: 각 주장의 출처 목록
4. **추가 질문 제안**: 사용자가 더 탐색할 수 있는 관련 질문 2~3개

{context}
{entities}`,
  },
  {
    id: 'english',
    name: '영어 응답',
    description: '영어로 답변 (한국어 문서 기반)',
    prompt: `You are a document-based Q&A assistant. Answer in English based on the Korean documents provided.
- Cite sources as [Source: filename]
- If information is not found, say so clearly.

{context}
{entities}`,
  },
]
```

### 프론트엔드 컴포넌트

```typescript
// pages/settings/ui/prompt-editor.tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import TextareaAutosize from 'react-textarea-autosize'

export function PromptEditor() {
  const [prompt, setPrompt] = useState(settings.systemPrompt)
  const [activePreset, setActivePreset] = useState(settings.activePreset)
  const [dirty, setDirty] = useState(false)

  function applyPreset(preset: PromptPreset) {
    setPrompt(preset.prompt)
    setActivePreset(preset.id)
    setDirty(true)
  }

  async function handleSave() {
    await saveSettings({ systemPrompt: prompt, activePreset })
    setDirty(false)
  }

  function handleReset() {
    const defaultPreset = PRESETS.find(p => p.id === 'default')!
    applyPreset(defaultPreset)
  }

  // 사용자가 프리셋 적용 후 직접 수정하면 → activePreset = null (커스텀)
  function handleChange(value: string) {
    setPrompt(value)
    setActivePreset(null)
    setDirty(true)
  }

  return (
    <div className="space-y-6">
      {/* 프롬프트 편집 영역 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">시스템 프롬프트</CardTitle>
          <p className="text-sm text-muted-foreground">
            AI의 응답 방식과 규칙을 정의합니다.
            <code className="text-xs bg-muted px-1 py-0.5 rounded ml-1">{'{context}'}</code>와
            <code className="text-xs bg-muted px-1 py-0.5 rounded ml-1">{'{entities}'}</code>
            자리에 검색 결과가 자동 삽입됩니다.
          </p>
        </CardHeader>
        <CardContent>
          <TextareaAutosize
            value={prompt}
            onChange={e => handleChange(e.target.value)}
            minRows={8}
            maxRows={20}
            className="w-full resize-none rounded-md border border-input bg-background
                       px-3 py-2 text-sm font-mono text-foreground
                       focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </CardContent>
      </Card>

      {/* 프리셋 선택 */}
      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              프리셋 {activePreset ? `(${PRESETS.find(p=>p.id===activePreset)?.name})` : '(커스텀)'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {PRESETS.map(preset => (
              <DropdownMenuItem key={preset.id} onClick={() => applyPreset(preset)}>
                <div>
                  <div className="font-medium">{preset.name}</div>
                  <div className="text-xs text-muted-foreground">{preset.description}</div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 미리보기 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">미리보기</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-40">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
              {prompt
                .replace('{context}', '← 검색된 문서 청크가 여기에 삽입됩니다')
                .replace('{entities}', '← 관련 엔티티 정보가 여기에 삽입됩니다')}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* 하단 버튼 */}
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={handleReset}>
          기본값 복원
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!dirty}>
          저장
        </Button>
      </div>
    </div>
  )
}
```

### 설정 저장소

```typescript
// entities/settings/model/store.ts
const SETTINGS_KEY = 'llm_settings'

const DEFAULT_SETTINGS: AppSettings = {
  systemPrompt: PRESETS[0].prompt,   // '기본 (출처 표기)' 프리셋
  activePreset: 'default',
}

export const SettingsStore = {
  get(): AppSettings {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : DEFAULT_SETTINGS
  },

  save(settings: AppSettings): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  },

  reset(): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS))
  },
}
```

### 백엔드 설정 API

```python
# backend/app/settings/router.py
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/settings", tags=["settings"])

class SettingsPayload(BaseModel):
    system_prompt: str

# 설정 파일 경로 (Docker 볼륨 마운트)
SETTINGS_FILE = "/data/settings.json"

@router.get("")
async def get_settings():
    """현재 설정 반환"""
    return load_settings()

@router.put("")
async def update_settings(payload: SettingsPayload):
    """설정 저장"""
    save_settings(payload.model_dump())
    return {"status": "ok"}
```

### chat/service.py 변경 — 동적 프롬프트 로드

```python
# 변경 전 (하드코딩)
SYSTEM_PROMPT = "당신은 사내 문서 기반..."

# 변경 후 (설정에서 로드)
async def _build_system_prompt(context: dict) -> str:
    settings = load_settings()
    prompt = settings.get("system_prompt", DEFAULT_SYSTEM_PROMPT)

    # {context}, {entities} 플레이스홀더 치환
    context_text = "\n\n".join(c["text"] for c in context["chunks"])
    entities_text = ", ".join(context.get("entities", []))

    return prompt.replace("{context}", context_text).replace("{entities}", entities_text)
```

### 설정 페이지 진입 방법

사이드바 하단에 ⚙️ 설정 아이콘 추가:

```typescript
// session-sidebar.tsx — SidebarFooter에 설정 버튼 추가
<SidebarFooter>
  <SidebarMenu>
    <SidebarMenuItem>
      <SidebarMenuButton onClick={() => setShowSettings(true)}>
        <Settings className="h-4 w-4 mr-2" /> 설정
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</SidebarFooter>
```

설정은 **shadcn/ui Dialog (전체 화면)** 또는 **별도 페이지**로 표시:

```typescript
// chat-page.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

{showSettings && (
  <Dialog open={showSettings} onOpenChange={setShowSettings}>
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>설정</DialogTitle>
      </DialogHeader>
      <PromptEditor />
    </DialogContent>
  </Dialog>
)}
```

---

## 구현 순서

### Phase A (shadcn/ui + Tailwind v4 기반 — 가장 먼저)
1. `package.json` — tailwindcss v4, @tailwindcss/postcss, shadcn/ui, clsx, tailwind-merge, lucide-react 추가
2. `postcss.config.mjs` — @tailwindcss/postcss 설정
3. `globals.css` — CSS 변수 기반 색상 시스템 (`@import "tailwindcss"` + `@theme inline` + `:root` / `.dark`)
4. `src/lib/utils.ts` — cn() 유틸리티
5. `src/components/ui/` — shadcn/ui 컴포넌트 설치 (button, input, sidebar, dropdown-menu, dialog, card, tooltip, scroll-area, badge)
6. `layout.tsx` — 인라인 스타일 → Tailwind 클래스 + dark class 적용

### Phase B (채팅 코어 + 파일/폴더 인제스트 — Phase A 완료 후)
5. `shared/ui/markdown-renderer.tsx` — 마크다운 + 코드 블록 컴포넌트
6. `message-bubble.tsx` — Claude 스타일 메시지 레이아웃
7. `upload-pdf/model/ingest-queue.ts` — 인제스트 큐 상태 관리
8. `upload-pdf/ui/file-upload.tsx` — 📎 드롭다운 (파일 다중 선택 + 폴더 선택)
9. `upload-pdf/ui/ingest-panel.tsx` — 인제스트 진행 패널 (개별 상태 + 전체 진행률)
10. 백엔드 `documents/router.py` — `POST /documents/ingest/batch` 배치 API
11. `shared/api/index.ts` — `uploadPdfBatch()` SSE 스트리밍 클라이언트
12. `input-bar.tsx` — 자동 높이 + 📎(파일/폴더) + 전송/중지 통합
13. `chat-page.tsx` — 드래그앤드롭 (파일 + 폴더 재귀 탐색) + 인제스트 큐 연동
14. `welcome-screen.tsx` — 빈 대화 환영 화면 + 제안 카드
15. `stop-button.tsx` + `scroll-to-bottom.tsx` — 보조 UI 컴포넌트
16. `chat-window.tsx` — 중앙 정렬 + 플로팅 버튼 통합

### Phase C (사이드바 — Phase B 완료 후)
17. `session-sidebar.tsx` — shadcn/ui Sidebar + SidebarProvider 기반 전환 (접기/펼치기/반응형 내장)
18. `session-menu.tsx` — shadcn/ui DropdownMenu 기반 ⋯ 컨텍스트 메뉴
19. `search-bar.tsx` — shadcn/ui Input 기반 세션 검색
20. `store.ts` — rename, search 메서드 추가

### Phase D (부가 기능 — Phase C 완료 후)
21. `shared/api/index.ts` + 백엔드 `chat/router.py` — 세션 제목 생성 API
22. `chat-page.tsx` — LLM 제목 생성 통합
23. `use-keyboard-shortcuts.ts` — 글로벌 단축키
24. 전체 컴포넌트 — ARIA 속성 추가

### Phase E (시스템 프롬프트 편집 — Phase D 완료 후)
25. `entities/settings/model/types.ts` + `store.ts` — 설정 타입 및 localStorage CRUD
26. `pages/settings/ui/prompt-editor.tsx` — 프롬프트 편집기 (프리셋 + 미리보기)
27. `pages/settings/ui/settings-page.tsx` — 설정 Dialog 래퍼
28. 백엔드 `settings/router.py` + `settings/service.py` — GET/PUT /settings API
29. 백엔드 `chat/service.py` — 하드코딩 프롬프트 → 설정에서 동적 로드
30. `session-sidebar.tsx` SidebarFooter — ⚙️ 설정 버튼 추가

---

## 위험 요소

| 위험 | 완화 방법 |
|------|---------|
| Tailwind v4 + shadcn/ui 호환성 | shadcn/ui는 Tailwind v4 공식 지원. `@theme inline` 블록과 CSS 변수 방식 검증 필요 |
| 인라인 스타일 → Tailwind 전환 누락 | Phase A 완료 시 `grep 'style='`로 잔존 인라인 스타일 전수 검사 |
| react-markdown 번들 크기 증가 | `next/dynamic` lazy import + 코드 스플리팅 적용 |
| shadcn/ui 컴포넌트 커스터마이징 | 기본 스타일 유지 후 CSS 변수로 미세 조정, 과도한 오버라이드 지양 |
| 자동 높이 textarea 성능 | react-textarea-autosize의 maxRows=6 제한 |
| webkitdirectory 브라우저 호환 | Chromium 기반(Tauri WebView) 전용이므로 호환 문제 없음 |
| 대량 폴더(100+ PDF) 인제스트 시 메모리 | 파일을 큐에 넣고 순차 업로드, FormData에 동시 적재하지 않음 |
| 폴더 드래그앤드롭 시 readEntries 제한 | Chrome의 100개 제한 → 재귀 호출로 전체 읽기 보장 |
| 세션 제목 생성 API 지연 | 비동기 처리 — 즉시 임시 제목(첫 30자) 후 LLM 응답 시 업데이트 |
| 반응형 사이드바: Tauri WebView 호환 | shadcn/ui Sidebar의 모바일 Sheet는 마우스 이벤트 기반이므로 호환 |
| 마크다운 XSS | rehype-sanitize 플러그인으로 위험 태그 필터링 |
| oklch 색공간 브라우저 호환 | Tauri WebView(Chromium)는 oklch 지원. 구형 브라우저 불필요 (Tauri 전용 앱) |
| 시스템 프롬프트 편집 시 {context}/{entities} 삭제 | 미리보기에서 플레이스홀더 누락 경고 표시 + 저장 시 검증 |
| 설정 저장 동기화 (localStorage vs 백엔드) | 백엔드 API를 primary로, localStorage는 오프라인 캐시로 사용 |
| 프롬프트 인젝션 위험 | 사용자가 직접 편집하는 로컬 전용 앱이므로 위험도 낮음 |

---

## 검증 방법

### Phase A
- [ ] `@tailwindcss/postcss` 기반 Tailwind v4 빌드 정상 동작
- [ ] shadcn/ui 컴포넌트 정상 렌더링 (Button, Sidebar 등)
- [ ] 인라인 스타일 완전 제거 확인 (`grep 'style='`로 검색)
- [ ] `:root` (라이트) / `.dark` (다크) 테마 전환 정상 동작
- [ ] oklch 색상이 Tauri WebView에서 정상 표시

### Phase B
- [ ] 마크다운 렌더링: 코드 블록, 테이블, 리스트, 볼드/이탤릭 정상 표시
- [ ] 코드 블록 복사 버튼 동작
- [ ] 입력 바 자동 높이 조절 (1줄 → 6줄 확장)
- [ ] 📎 클릭 → 드롭다운 (파일 선택 / 폴더 선택)
- [ ] 📎 → "PDF 파일 선택" → 다중 PDF 선택 → 인제스트 패널 표시 → 순차 처리
- [ ] 📎 → "폴더 선택" → 폴더 내 PDF 자동 수집 → 인제스트 패널 표시 → 순차 처리
- [ ] 드래그앤드롭: PDF 파일 다중 드롭 → 인제스트 큐에 추가
- [ ] 드래그앤드롭: 폴더 드롭 → 재귀 탐색 → PDF만 필터링 → 인제스트 큐에 추가
- [ ] 인제스트 패널: 개별 파일 상태(대기/처리중/완료/실패) + 전체 진행률 바
- [ ] 인제스트 중지 버튼 → 현재 파일 완료 후 나머지 취소
- [ ] 백엔드 `POST /documents/ingest/batch` → SSE 개별 진행 이벤트 반환 확인
- [ ] ■ 중지 버튼 → 스트리밍 즉시 중단
- [ ] 빈 대화 → 환영 화면 표시 → 제안 클릭 → 메시지 전송
- [ ] "↓ 새 메시지" 버튼 표시/클릭 동작

### Phase C
- [ ] 사이드바 접기/펼치기 토글 + 부드러운 트랜지션
- [ ] 세션 검색: 제목·내용 필터링 정상 동작
- [ ] ⋯ 메뉴: 이름 변경 → 인라인 input → 저장
- [ ] ⋯ 메뉴: 삭제 → 세션 제거
- [ ] 브라우저 800px 이하: 사이드바 오버레이로 전환

### Phase D
- [ ] 첫 응답 완료 후 세션 제목 LLM 자동 생성
- [ ] Ctrl+N: 새 채팅 / Ctrl+B: 사이드바 토글 / Esc: 중지
- [ ] 스크린 리더로 메시지 목록 탐색 가능 확인

### Phase E
- [ ] 사이드바 ⚙️ 버튼 → 설정 Dialog 표시
- [ ] 프리셋 선택 → 프롬프트 텍스트 자동 변경
- [ ] 프리셋 적용 후 직접 수정 → "(커스텀)" 표시로 전환
- [ ] 미리보기: {context}, {entities} 플레이스홀더 위치 시각적 표시
- [ ] 저장 → 다음 질문부터 새 프롬프트 적용 확인
- [ ] 기본값 복원 → '기본 (출처 표기)' 프리셋으로 초기화
- [ ] 백엔드 `GET /api/settings` → 저장된 프롬프트 반환 확인
- [ ] {context} 또는 {entities} 누락 시 경고 표시
