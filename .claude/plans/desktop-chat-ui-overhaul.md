# Desktop Chat UI 오버홀 구현 계획

## 개요
- **목적**: AIChatV4 레퍼런스 컴포넌트 기반으로 desktop chat UI/UX를 전면 교체하고, FSD 원칙에 따라 파일을 기능 중심 단위로 분리
- **영향 범위**: `desktop/src/features/chat/`, `desktop/src/features/documents/`, `desktop/src/shared/` (신규)
- **변경 없음**: `store/chat.ts`, `store/documents.ts`, `lib/api.ts` (비즈니스 로직 보존)
- **예상 복잡도**: 높음

---

## 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `desktop/src/shared/ui/icons.tsx` | **신규** | 모든 SVG 아이콘 (I 오브젝트) |
| `desktop/src/shared/ui/toolbar-button.tsx` | **신규** | Tb 버튼 컴포넌트 |
| `desktop/src/shared/ui/code-block.tsx` | **신규** | CodeBlock + hlCode 구문 강조 |
| `desktop/src/shared/ui/markdown.tsx` | **신규** | parseMarkdown + pI + MdTable |
| `desktop/src/features/chat/floating-sidebar.tsx` | **신규** | FloatingSidebar 래퍼 |
| `desktop/src/features/chat/thinking-indicator.tsx` | **신규** | ThinkingIndicator 애니메이션 |
| `desktop/src/features/chat/chat-message.tsx` | **신규** | ChatMessage + ErrorMsg |
| `desktop/src/features/chat/chat-page.tsx` | **수정** | 레이아웃 오버홀 (FloatingSidebar + TopBar) |
| `desktop/src/features/chat/session-sidebar.tsx` | **수정** | LeftSidebarContent 디자인 |
| `desktop/src/features/chat/message-list.tsx` | **수정** | 빈 상태·스크롤 버튼·메시지 위임 |
| `desktop/src/features/chat/input-bar.tsx` | **수정** | 새 디자인 (모델 드롭다운·문자 카운터) |
| `desktop/src/features/chat/profile-selector.tsx` | **수정** | input-bar 내부 인라인 드롭다운으로 축소 |
| `desktop/src/features/documents/document-panel.tsx` | **수정** | RightSidebarContent 디자인 |

---

## FSD 레이어 설계

| 레이어 | 파일 경로 | 역할 |
|--------|-----------|------|
| Shared/UI | `shared/ui/icons.tsx` | SVG 아이콘 정의 — 전 피처에서 import |
| Shared/UI | `shared/ui/toolbar-button.tsx` | 호버 상태 포함 아이콘 버튼 프리미티브 |
| Shared/UI | `shared/ui/code-block.tsx` | 구문 강조·접기·복사 코드 블록 |
| Shared/UI | `shared/ui/markdown.tsx` | 커스텀 마크다운 파서 (react-markdown 대체) |
| Feature/Chat | `features/chat/floating-sidebar.tsx` | pinned/hover 레이아웃 래퍼 |
| Feature/Chat | `features/chat/thinking-indicator.tsx` | 스트리밍 대기 애니메이션 |
| Feature/Chat | `features/chat/chat-message.tsx` | 메시지 행 + hover 툴바 + ErrorMsg |
| Feature/Chat | `features/chat/chat-page.tsx` | 최상위 레이아웃 (leftPinned/rightPinned 상태) |
| Feature/Chat | `features/chat/session-sidebar.tsx` | 세션 목록 (Claude 좌측 사이드바 디자인) |
| Feature/Chat | `features/chat/message-list.tsx` | 메시지 스크롤 컨테이너 + 빈 상태 |
| Feature/Chat | `features/chat/input-bar.tsx` | 입력창 + 모델 선택 + 문자 카운터 |
| Feature/Chat | `features/chat/profile-selector.tsx` | 모델 드롭다운 버튼 (input-bar에 임베드) |
| Feature/Docs | `features/documents/document-panel.tsx` | 폴더 트리·드롭존·컨텍스트 패널 |

---

## 컴포넌트 API 설계

### FloatingSidebar
```tsx
interface FloatingSidebarProps {
  side: "left" | "right";
  pinned: boolean;
  onTogglePin: () => void;
  children: React.ReactNode;
  triggerWidth?: number; // default 8px
}
```

### ChatMessage
```tsx
interface ChatMessageProps {
  message: Message;           // from store/chat.ts
  isStreaming: boolean;
  isLast: boolean;
  onCopy: (content: string) => void;
  onRegenerate: () => void;
  onEdit: (content: string) => void;
}
```

### MessageList (chat-page → message-list 전달 props)
```tsx
interface MessageListProps {
  onRightPanelToggle: () => void; // folder 버튼 → rightPinned 토글
}
```

### InputBar
```tsx
interface InputBarProps {
  onFolderToggle: () => void; // 우측 패널 토글
}
```

---

## 색상 팔레트 (레퍼런스 그대로)

| 변수명 | 값 | 용도 |
|--------|-----|------|
| `bg` | `#09090b` | 전체 배경 |
| `sidebar-bg` | `#0c0d10` | 사이드바 배경 |
| `card` | `#18181b` | 카드·입력창 |
| `section` | `#1f1f23` | 섹션·코드 헤더 |
| `border` | `#27272a` | 테두리 |
| `muted-2` | `#3f3f46` | 약한 강조 |
| `muted` | `#52525b` | 비활성 텍스트 |
| `text-dim` | `#71717a` | 희미한 텍스트 |
| `text-secondary` | `#a1a1aa` | 보조 텍스트 |
| `text-primary` | `#d4d4d8` | 주 텍스트 |
| `text-bright` | `#e4e4e7` | 강조 텍스트 |
| `accent` | `#a78bfa` | 보라 포인트 |
| `success` | `#4ade80` | 성공·복사완료 |
| `error` | `#f87171` | 오류·중지 |

---

## 구현 단계

### 1단계: shared/ui 프리미티브
- `icons.tsx` — `I` 오브젝트 export (TypeScript, React SVG)
- `toolbar-button.tsx` — `Tb` 컴포넌트 export
- `code-block.tsx` — `CodeBlock`, `hlCode` export
- `markdown.tsx` — `parseMarkdown`, `MdTable` export

### 2단계: chat 피처 신규 컴포넌트
- `floating-sidebar.tsx` — pinned/hover 로직
- `thinking-indicator.tsx` — 점 3개 바운스 + 레이블 로테이션
- `chat-message.tsx` — `ChatMessage`, `ErrorMsg`

### 3단계: message-list 수정
- `ChatMessage` 컴포넌트 사용하도록 교체
- 빈 상태 (✦ 아이콘 + suggestion chips)
- 스크롤·scroll-to-bottom 버튼
- react-markdown → parseMarkdown 교체

### 4단계: input-bar 수정
- 새 레이아웃 (+ | 📁 | textarea | 모델드롭다운 | 전송/중지)
- ProfileSelector 드롭다운 버튼 임베드
- 문자 카운터 + ⌘K 힌트

### 5단계: session-sidebar 수정
- 탭바 (Chat/⚙️/</>) + 메뉴 아이템
- Pinned 섹션 (drag to pin 힌트)
- Recents 목록 (useChatStore sessions)
- 사용자 footer

### 6단계: chat-page 수정
- `leftPinned`/`rightPinned` 상태 추가
- `FloatingSidebar`로 좌·우 패널 감싸기
- breadcrumb TopBar (세션 타이틀·토글 버튼)
- ProfileSelector 상단에서 제거 (input-bar로 이동)
- 글로벌 keyframe CSS (`<style>` 태그 삽입)

### 7단계: document-panel 수정
- RightSidebarContent 디자인 적용
- 업로드 진행 카드 (uploadProgress 연결)
- 폴더 트리 (collapsible)
- 드롭존 재디자인
- 컨텍스트/커넥터 섹션

---

## 위험 요소 및 의존성

### Tailwind → Inline Styles
- **위험**: 기존 컴포넌트에 Tailwind 클래스 혼용 시 스타일 충돌 가능
- **해결**: 수정 파일에서 Tailwind className 완전 제거, inline styles만 사용

### Google Fonts (DM Sans, JetBrains Mono)
- **위험**: Tauri 앱이 오프라인 환경에서 폰트 로드 실패 가능
- **해결**: `@import url(...)` 대신 시스템 폰트 폴백 사용 또는 `font-face` 로컬 번들링. 우선 import 유지 (개발 환경 기준)

### react-markdown 제거
- **위험**: `message-list.tsx`에서 `ReactMarkdown`, `remarkGfm` import 삭제 시 빌드 경고 (미사용 패키지)
- **해결**: 구현 후 `package.json`에서 제거 여부는 별도 확인

### Source 배지 (SourceList)
- **현재 코드**: `message-list.tsx`에 `SourceBadge`/`SourceList` 존재
- **처리**: `chat-message.tsx`로 이전. `Message.sources` 필드 유지

### FSD import 방향
- `features/chat` → `shared/ui` (허용)
- `features/documents` → `shared/ui` (허용)
- `shared/ui` → `features/*` (금지)

---

## 검증 방법
- [ ] `pnpm --filter desktop typecheck` 성공 (타입 오류 없음)
- [ ] lint 경고/오류 없음
- [ ] 앱 실행 — 좌·우 사이드바 pin/unpin 동작 확인
- [ ] 메시지 전송 → ChatMessage 렌더링 확인
- [ ] 스트리밍 중 ThinkingIndicator → 토큰 수신 → 완료 확인
- [ ] 빈 상태 → suggestion 클릭 → 메시지 전송 확인
- [ ] PDF 드래그앤드롭 업로드 확인
