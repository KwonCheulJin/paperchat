; paperchat 인스톨러 커스터마이징
; 이 파일은 installer.nsi 최상단(line 28)에서 include됨 — MUI_LANGUAGE 매크로가 로드되기 전.
;
; ⚠ LangString은 이 파일에 둘 수 없음 — MUI_LANGUAGE 이후에만 선언 가능.
;    실제 번역은 nsis/korean.nsh, nsis/english.nsh 에 있고 customLanguageFiles로 주입.
;    여기선 !define(MUI_*PAGE_*) 과 매크로만 둔다.

; ── 매 설치·제거 시 언어 선택 dialog 강제 표시 ────────────────────────────────
; NSIS 기본은 한 번 선택한 언어를 HKCU에 저장해 재실행 시 생략함.
!define MUI_LANGDLL_ALWAYSSHOW

; ── Welcome / Finish 페이지 커스텀 텍스트 (LangString은 .nsh 파일에서 정의) ──
!define MUI_WELCOMEPAGE_TITLE "$(pc_welcome_title)"
!define MUI_WELCOMEPAGE_TEXT  "$(pc_welcome_text)"
!define MUI_FINISHPAGE_TITLE  "$(pc_finish_title)"
!define MUI_FINISHPAGE_TEXT   "$(pc_finish_text)"

; ── 공통 프로세스 종료 매크로 ─────────────────────────────────────────────────
!macro KillPaperchatProcesses
  nsExec::ExecToLog 'powershell.exe -NoProfile -Command "Stop-Process -Name paperchat,paperchat-server,backend,llama-server -Force -ErrorAction SilentlyContinue"'
  nsExec::ExecToLog 'powershell.exe -NoProfile -Command "$i=0; while(((Get-Process -Name paperchat-server -EA SilentlyContinue) -or (Get-Process -Name backend -EA SilentlyContinue)) -and ($i++ -lt 20)){Start-Sleep -Milliseconds 500}"'
!macroend

; ── 업그레이드 시 구 바이너리 정리 ────────────────────────────────────────────
!macro CleanupOldBinaries
  Delete "$INSTDIR\backend.exe"
  ; v0.5.1~v0.7.0 에서 tessdata 를 단일 "파일"로 번들했음.
  ; v0.7.1 부터 "디렉토리" 로 바뀌면서 덮어쓰기 설치 시 충돌 발생.
  ; Delete 는 디렉토리는 건드리지 않으므로 파일일 때만 정리됨.
  Delete "$INSTDIR\tessdata"
  ; v0.4.0~ 런타임이 binaries/*.dll 을 $INSTDIR 로 복사함 (Windows DLL 로더가
  ; EXE 폴더를 최우선 탐색). 업그레이드 시 stale 루트 DLL 을 지우지 않으면
  ; 신규 llama-server.exe 와 ABI 충돌 → "프로시저 시작 지점 없음" 에러.
  Delete "$INSTDIR\ggml*.dll"
  Delete "$INSTDIR\llama*.dll"
  Delete "$INSTDIR\cublas*.dll"
  Delete "$INSTDIR\cublasLt*.dll"
  Delete "$INSTDIR\cudart*.dll"
  Delete "$INSTDIR\libomp*.dll"
  Delete "$INSTDIR\mtmd.dll"
!macroend

; ── Tauri 2 설치 훅 ──────────────────────────────────────────────────────────
; Tauri 2 NSIS 템플릿은 NSIS_HOOK_PREINSTALL / NSIS_HOOK_POSTINSTALL /
; NSIS_HOOK_PREUNINSTALL / NSIS_HOOK_POSTUNINSTALL 만 호출한다.
; Tauri 1 의 customInit / customInstall / customUnInstall 은 호출되지 않음.
; PREINSTALL 은 File 커맨드 실행 전이라 이전 설치물 청소에 적합.

!macro NSIS_HOOK_PREINSTALL
  !insertmacro KillPaperchatProcesses
  !insertmacro CleanupOldBinaries

  DetailPrint "$(pc_tesseract_check)"
  IfFileExists "$PROGRAMFILES64\Tesseract-OCR\tesseract.exe" tesseract_ok tesseract_missing

  tesseract_missing:
    DetailPrint "$(pc_tesseract_install)"
    nsExec::ExecToLog 'winget install tesseract-ocr.tesseract --silent --accept-package-agreements --accept-source-agreements'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONINFORMATION "$(pc_tesseract_fail)"
      Goto tesseract_done
    ${EndIf}

    IfFileExists "$PROGRAMFILES64\Tesseract-OCR\tessdata\kor.traineddata" tesseract_ok kor_missing
    kor_missing:
      DetailPrint "$(pc_tesseract_kor_lang)"
      nsExec::ExecToLog 'powershell.exe -NoProfile -Command "Invoke-WebRequest ''https://github.com/tesseract-ocr/tessdata/raw/main/kor.traineddata'' -OutFile ''$PROGRAMFILES64\Tesseract-OCR\tessdata\kor.traineddata'' -UseBasicParsing"'

  tesseract_ok:
    DetailPrint "$(pc_tesseract_done)"

  tesseract_done:
!macroend

; ── 설치 완료 후 Windows 아이콘 캐시 강제 갱신 ──────────────────────────────
; 문제 원인:
;   1. iconcache_*.db 는 Explorer 실행 중 잠금 → 삭제 전 Explorer 종료 필수
;   2. Exec '"$WINDIR\explorer.exe"' 는 인스톨러(관리자) 권한으로 Explorer 시작
;      → 사용자 컨텍스트 불일치로 캐시 갱신 실패
;   3. 작업표시줄 핀 아이콘은 별도 경로(%AppData%\...\TaskBar\)에 캐시
;      → iconcache 삭제만으로는 갱신 안 됨
; 해결책:
;   NSIS 인라인 이스케이프 문제를 피해 임시 PS1 파일에 로직 작성 후 실행.
;   Start-Process explorer.exe 는 PowerShell(사용자 컨텍스트)에서 호출
;   → 올바른 권한으로 Explorer 재시작.
!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "아이콘 캐시 초기화 중..."
  ; 임시 PS1 스크립트 파일 작성
  FileOpen $0 "$TEMP\pc_icon_refresh.ps1" w
  FileWrite $0 "# paperchat 아이콘 캐시 초기화$\r$\n"
  FileWrite $0 "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue$\r$\n"
  FileWrite $0 "Start-Sleep -Milliseconds 1500$\r$\n"
  FileWrite $0 "$$local = [Environment]::GetFolderPath('LocalApplicationData')$\r$\n"
  FileWrite $0 "$$roaming = [Environment]::GetFolderPath('ApplicationData')$\r$\n"
  FileWrite $0 "$$exp = Join-Path $$local 'Microsoft\Windows\Explorer'$\r$\n"
  FileWrite $0 "# iconcache 삭제 (Windows 10/11: iconcache_16.db, 32.db, 256.db ...)$\r$\n"
  FileWrite $0 "Get-ChildItem $$exp -Filter 'iconcache_*.db' -EA SilentlyContinue | Remove-Item -Force -EA SilentlyContinue$\r$\n"
  FileWrite $0 "# thumbcache 삭제$\r$\n"
  FileWrite $0 "Get-ChildItem $$exp -Filter 'thumbcache_*.db' -EA SilentlyContinue | Remove-Item -Force -EA SilentlyContinue$\r$\n"
  FileWrite $0 "# 구형 캐시 삭제 (Windows 7~10)$\r$\n"
  FileWrite $0 "Remove-Item (Join-Path $$local 'IconCache.db') -Force -EA SilentlyContinue$\r$\n"
  FileWrite $0 "# 작업표시줄 핀 아이콘 갱신 (LastWriteTime 갱신으로 재읽기 유도)$\r$\n"
  FileWrite $0 "$$tb = Join-Path $$roaming 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'$\r$\n"
  FileWrite $0 "Get-ChildItem $$tb -Filter 'paperchat*' -EA SilentlyContinue | ForEach-Object { $$_.LastWriteTime = Get-Date }$\r$\n"
  FileWrite $0 "Start-Sleep -Milliseconds 500$\r$\n"
  FileWrite $0 "# Shell 아이콘 갱신 신호$\r$\n"
  FileWrite $0 "ie4uinit.exe -show$\r$\n"
  FileWrite $0 "# 사용자 컨텍스트로 Explorer 재시작$\r$\n"
  FileWrite $0 "Start-Process explorer.exe$\r$\n"
  FileClose $0
  ; PS1 실행 (PowerShell이 사용자 세션에서 Explorer 재시작)
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\pc_icon_refresh.ps1"'
  Delete "$TEMP\pc_icon_refresh.ps1"
!macroend

; ── 언인스톨 훅 ───────────────────────────────────────────────────────────────
; PREUNINSTALL 은 파일 제거 전 — 프로세스 종료 타이밍.
; POSTUNINSTALL 은 파일 제거 후 — 사용자 데이터 삭제 여부 확인.
!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro KillPaperchatProcesses
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  MessageBox MB_YESNO|MB_ICONQUESTION "$(pc_delete_model)" IDNO skip_model_delete
    RMDir /r "$LOCALAPPDATA\com.paperchat.desktop"
  skip_model_delete:
!macroend
