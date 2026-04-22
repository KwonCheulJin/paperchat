#!/usr/bin/env bash
# tauri.conf.json 스키마 검증 후 pnpm tauri build 실행
# 사용법: bash scripts/validate-tauri-build.sh
# 빌드 건너뛰기: SKIP_TAURI_BUILD=1 bash scripts/validate-tauri-build.sh

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
TAURI_CONF="$REPO_ROOT/desktop/src-tauri/tauri.conf.json"

# ── 1. tauri.conf.json 존재 확인 ──────────────────────────────
if [ ! -f "$TAURI_CONF" ]; then
  echo "[validate-tauri] tauri.conf.json 없음 — 건너뜀"
  exit 0
fi

# ── 2. resources 포맷 사전 검증 (빠른 실패) ───────────────────
node -e "
const cfg = JSON.parse(require('fs').readFileSync('$TAURI_CONF', 'utf8'));
const res = cfg?.bundle?.resources;
if (res == null) process.exit(0);
if (Array.isArray(res) && res.some(r => typeof r === 'object' && r !== null)) {
  console.error('[validate-tauri] ERROR: bundle.resources 배열에 객체({src, dest})가 포함되어 있습니다.');
  console.error('  올바른 형식 A) [\"binaries/foo.exe\"]');
  console.error('  올바른 형식 B) {\"binaries/foo.exe\": \".\"}');
  process.exit(1);
}
if (!Array.isArray(res) && typeof res !== 'object') {
  console.error('[validate-tauri] ERROR: bundle.resources 형식이 잘못되었습니다.');
  process.exit(1);
}
console.log('[validate-tauri] tauri.conf.json 형식 OK');
"

# ── 3. SKIP_TAURI_BUILD 확인 ─────────────────────────────────
if [ -n "${SKIP_TAURI_BUILD:-}" ]; then
  echo "[validate-tauri] SKIP_TAURI_BUILD=1 — tauri build 건너뜀"
  exit 0
fi

# ── 4. pnpm tauri build ──────────────────────────────────────
echo "[validate-tauri] pnpm tauri build 실행 중... (수 분 소요)"
cd "$REPO_ROOT/desktop"
pnpm tauri build
echo "[validate-tauri] tauri build 성공 ✓"
