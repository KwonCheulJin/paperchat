# Tailwind CSS 마이그레이션 & Input UI 수정 계획

## 완료된 작업

### 인프라 설정
- [x] `components.json` 생성 (shadcn/ui, Tailwind v4 호환)
- [x] `src/lib/utils.ts` — `cn()` 유틸 함수
- [x] 패키지 설치: `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`
- [x] `vite.config.ts` — `@/*` path alias 추가
- [x] tweakcn Claude 테마 적용 (`globals.css` CSS 변수 교체)
- [x] `--text-dim`, `--text-muted`, `--text-secondary`, `--surface-2` hue 조정 (295→100)

### 변환 완료 파일 (inline style → Tailwind className)
- [x] `src/shared/ui/toolbar-button.tsx`
- [x] `src/shared/ui/alert-dialog.tsx`
- [x] `src/shared/ui/code-block.tsx`
- [x] `src/shared/ui/markdown.tsx`
- [x] `src/features/chat/thinking-indicator.tsx`
- [x] `src/features/chat/floating-sidebar.tsx`
- [x] `src/features/chat/profile-selector.tsx`
- [x] `src/features/chat/session-sidebar.tsx`
- [x] `src/features/chat/chat-page.tsx`
- [x] `src/features/chat/input-bar.tsx`
- [x] `src/features/chat/message-list.tsx`

---

## 남은 작업

### 1. Input UI 레이아웃 수정 (우선순위: 높음)

**파일**: `src/features/chat/input-bar.tsx`

**현재 구조** (한 줄 row):
```
[attach] [sidebarR] [textarea─────────] [ProfileSelector] [send]
```

**목표 구조** (Claude 앱 스타일, 이미지 #9 참조):
```
[textarea──────────────────────────────]
[+ attach] [sidebarR]    [ProfileSelector ∨] [send ●]
```

**변경 사항**:
- 입력 카드 `border-radius` 증가: `rounded-[4px]` → `rounded-[20px]`
- 내부 레이아웃 `flex-col`로 변경 (textarea 상단, 버튼 row 하단)
- 전송 버튼: `rounded-[2px] w-8 h-8` → `rounded-full w-9 h-9`
- 하단 row: `justify-between`으로 좌우 분리
  - 좌: `[attach popup] [sidebarR]`
  - 우: `[ProfileSelector] [send/stop]`

---

### 2. Tailwind 마이그레이션 미완료 파일 (우선순위: 중간)

#### `src/features/chat/chat-message.tsx` (49개 inline style)
주요 변환 포인트:
- `SourceBadge` — `hovered` useState 제거, Tailwind `hover:` 사용
- `SourceList` — onMouseEnter/Leave → Tailwind hover
- `ErrorMsg` — `bg-destructive/[8%] border-destructive/20`
- `ContinueButton` — hover 직접 조작 제거
- 사용자 메시지 버블 — `color-mix` 값은 arbitrary value `[...]` 사용
- 어시스턴트 메시지 액션 바 — opacity transition 유지

#### `src/features/documents/document-panel.tsx` (62개 inline style)
- 가장 복잡한 파일
- 문서 목록, 진행 표시줄, 폴더 트리 등 복잡한 레이아웃
- `color-mix`, 동적 progress width 등 arbitrary value 필요

#### `src/features/setup/setup-screen.tsx` (32개 inline style)
- 설치/설정 화면
- 하드웨어 감지 UI, progress bar 등

---

### 3. CLAUDE.md 업데이트 (우선순위: 낮음)

프로젝트 루트 또는 desktop 디렉토리 CLAUDE.md에 추가:

```markdown
## CSS 방법론

- **Tailwind CSS v4** 유틸리티 클래스를 기본으로 사용한다.
- **shadcn/ui** 컴포넌트를 활용한다 (`src/components/ui/`).
- `cn()` 함수 (`@/lib/utils`)로 조건부 클래스를 조합한다.
- `style={{}}` 인라인 스타일은 다음 경우에만 허용:
  1. JS 런타임 계산값 (동적 px, %, 타임스탬프 기반 값)
  2. CSS arbitrary value가 너무 복잡한 `color-mix()` 등
  3. keyframe animation 참조
- `onMouseEnter/Leave`로 직접 style 조작 금지 → Tailwind `hover:` 클래스 사용
```

---

### 4. 선택적 개선

- `src/shared/ui/global-styles.tsx` — keyframes를 `globals.css @layer base`로 이전
- shadcn/ui 공식 컴포넌트 추가 설치 (`pnpm dlx shadcn@latest add button textarea`)
  - 현재 커스텀 구현된 버튼/textarea를 shadcn 버전으로 교체

---

## 참고: Tailwind 변환 패턴

| 패턴 | 변환 |
|------|------|
| `color: "var(--text-dim)"` | `text-[var(--text-dim)]` |
| `background: "var(--card)"` | `bg-card` |
| `border: "1px solid var(--border)"` | `border border-border` |
| `color: "var(--primary)"` | `text-primary` |
| `display: "flex", alignItems: "center"` | `flex items-center` |
| `onMouseEnter` style 조작 | Tailwind `hover:` 클래스 |
| `color-mix(in oklch, ...)` | `bg-[color-mix(in_oklch,...)]` (공백→`_`) |
| 조건부 클래스 | `cn("base", condition && "conditional")` |
