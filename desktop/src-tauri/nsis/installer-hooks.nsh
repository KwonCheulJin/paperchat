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
!macroend

; ── 초기화 훅 (.onInit) ───────────────────────────────────────────────────────
!macro customInit
  !insertmacro KillPaperchatProcesses
!macroend

; ── 설치 훅 ───────────────────────────────────────────────────────────────────
!macro customInstall
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

; ── 언인스톨 훅 ───────────────────────────────────────────────────────────────
!macro customUnInstall
  !insertmacro KillPaperchatProcesses
  MessageBox MB_YESNO|MB_ICONQUESTION "$(pc_delete_model)" IDNO skip_model_delete
    RMDir /r "$LOCALAPPDATA\com.paperchat.desktop"
  skip_model_delete:
!macroend
