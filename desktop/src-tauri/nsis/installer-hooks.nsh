; paperchat 인스톨러 커스터마이징
; 이 파일은 installer.nsi 최상단에서 include됨 — MUI 페이지 선언 전

; ── Welcome / Finish 페이지 커스텀 텍스트 ────────────────────────────────────
!define MUI_WELCOMEPAGE_TITLE "$(pc_welcome_title)"
!define MUI_WELCOMEPAGE_TEXT  "$(pc_welcome_text)"
!define MUI_FINISHPAGE_TITLE  "$(pc_finish_title)"
!define MUI_FINISHPAGE_TEXT   "$(pc_finish_text)"

; ── 다국어 문자열 정의 ────────────────────────────────────────────────────────

; Welcome 페이지
LangString pc_welcome_title ${LANG_ENGLISH} "Welcome to paperchat"
LangString pc_welcome_title ${LANG_KOREAN}  "paperchat 설치"

LangString pc_welcome_text ${LANG_ENGLISH} \
  "paperchat runs entirely on your device — no cloud, no internet required.$\r$\n$\r$\n\
  · Documents stay on your computer$\r$\n\
  · AI analysis works fully offline$\r$\n\
  · Supports PDF with local language models$\r$\n$\r$\n\
  This installer will also configure Tesseract OCR for Korean text recognition.$\r$\n$\r$\n\
  Click Next to begin."

LangString pc_welcome_text ${LANG_KOREAN} \
  "paperchat는 완전히 로컬에서 실행되는 AI 문서 분석 도구입니다.$\r$\n$\r$\n\
  · 문서가 외부 서버로 전송되지 않음$\r$\n\
  · 인터넷 없이 AI 분석 동작$\r$\n\
  · 로컬 언어 모델로 PDF 분석$\r$\n$\r$\n\
  이 설치 프로그램은 한국어 OCR을 위해 Tesseract도 함께 설정합니다.$\r$\n$\r$\n\
  다음을 클릭해 설치를 시작하세요."

; Finish 페이지
LangString pc_finish_title ${LANG_ENGLISH} "paperchat is ready"
LangString pc_finish_title ${LANG_KOREAN}  "설치 완료"

LangString pc_finish_text ${LANG_ENGLISH} \
  "Installation complete.$\r$\n$\r$\n\
  Before first use, place an AI model file (.gguf) in the Models folder.$\r$\n\
  Recommended: Qwen2.5-7B, Gemma-2-9B, or similar (4–8 GB).$\r$\n$\r$\n\
  Click Finish to launch paperchat."

LangString pc_finish_text ${LANG_KOREAN} \
  "설치가 완료되었습니다.$\r$\n$\r$\n\
  첫 실행 전 AI 모델 파일(.gguf)을 Models 폴더에 복사하세요.$\r$\n\
  권장 모델: Qwen2.5-7B, Gemma-2-9B 등 (4–8 GB).$\r$\n$\r$\n\
  마침을 클릭하면 paperchat가 실행됩니다."

; Tesseract 진행 메시지
LangString pc_tesseract_check   ${LANG_ENGLISH} "Checking Tesseract OCR..."
LangString pc_tesseract_check   ${LANG_KOREAN}  "Tesseract OCR 확인 중..."

LangString pc_tesseract_install ${LANG_ENGLISH} "Installing Tesseract OCR (via winget)..."
LangString pc_tesseract_install ${LANG_KOREAN}  "Tesseract OCR 설치 중 (winget 사용)..."

LangString pc_tesseract_kor_lang ${LANG_ENGLISH} "Installing Korean language pack..."
LangString pc_tesseract_kor_lang ${LANG_KOREAN}  "한국어 언어팩 설치 중..."

LangString pc_tesseract_done   ${LANG_ENGLISH} "Tesseract OCR ready."
LangString pc_tesseract_done   ${LANG_KOREAN}  "Tesseract OCR 준비 완료."

LangString pc_tesseract_fail ${LANG_ENGLISH} \
  "Tesseract OCR could not be installed automatically.$\n$\n\
  To install manually:$\n\
  1. Visit: github.com/UB-Mannheim/tesseract/wiki$\n\
  2. Download and run the Windows installer$\n\
  3. Restart paperchat$\n$\n\
  PDF text recognition may be limited until Tesseract is installed."

LangString pc_tesseract_fail ${LANG_KOREAN} \
  "Tesseract OCR 자동 설치에 실패했습니다.$\n$\n\
  수동 설치 방법:$\n\
  1. github.com/UB-Mannheim/tesseract/wiki 방문$\n\
  2. Windows 설치 파일 다운로드 후 실행$\n\
  3. paperchat 재시작$\n$\n\
  Tesseract 설치 전까지 PDF 텍스트 인식이 제한될 수 있습니다."

; AI 모델 삭제 메시지
LangString pc_delete_model ${LANG_ENGLISH} \
  "Remove AI model files?$\n$\n\
  Model files are 4–32 GB. Keeping them avoids re-downloading on reinstall.$\n$\n\
  Remove model files?"

LangString pc_delete_model ${LANG_KOREAN} \
  "AI 모델 파일을 삭제하시겠습니까?$\n$\n\
  모델 파일은 4–32 GB입니다. 보관하면 재설치 시 다시 다운로드하지 않아도 됩니다.$\n$\n\
  모델 파일을 삭제하시겠습니까?"

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
