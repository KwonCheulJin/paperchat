; paperchat 인스톨러 커스터마이징
; 이 파일은 installer.nsi 최상단에서 include됨 — MUI 페이지 선언 전

; ── Welcome / Finish 페이지 커스텀 텍스트 ────────────────────────────────────
!define MUI_WELCOMEPAGE_TITLE "$(pc_welcome_title)"
!define MUI_WELCOMEPAGE_TEXT  "$(pc_welcome_text)"
!define MUI_FINISHPAGE_TITLE  "$(pc_finish_title)"
!define MUI_FINISHPAGE_TEXT   "$(pc_finish_text)"

; ── 다국어 문자열 정의 ────────────────────────────────────────────────────────

; Welcome 페이지
LangString pc_welcome_title ${LANG_ENGLISH} "Welcome to paperchat Setup"
LangString pc_welcome_title ${LANG_KOREAN}  "paperchat 설치 프로그램"

LangString pc_welcome_text ${LANG_ENGLISH} \
  "paperchat is a private AI document assistant that runs entirely on your device.$\r$\n$\r$\n\
  - No internet connection required$\r$\n\
  - Documents never leave your computer$\r$\n\
  - Supports PDF analysis with local AI$\r$\n$\r$\n\
  Click Next to continue."

LangString pc_welcome_text ${LANG_KOREAN} \
  "paperchat는 완전히 로컬에서 실행되는 AI 문서 분석 어시스턴트입니다.$\r$\n$\r$\n\
  - 인터넷 연결 없이 동작$\r$\n\
  - 문서가 외부로 전송되지 않음$\r$\n\
  - 로컬 AI로 PDF 분석 지원$\r$\n$\r$\n\
  계속하려면 다음(N)을 클릭하세요."

; Finish 페이지
LangString pc_finish_title ${LANG_ENGLISH} "Installation Complete"
LangString pc_finish_title ${LANG_KOREAN}  "설치가 완료되었습니다"

LangString pc_finish_text ${LANG_ENGLISH} \
  "paperchat has been successfully installed.$\r$\n$\r$\n\
  To get started, place your AI model file (.gguf) in the Models folder.$\r$\n$\r$\n\
  Click Finish to launch paperchat."

LangString pc_finish_text ${LANG_KOREAN} \
  "paperchat가 성공적으로 설치되었습니다.$\r$\n$\r$\n\
  시작하려면 AI 모델 파일(.gguf)을 Models 폴더에 배치하세요.$\r$\n$\r$\n\
  마침(F)을 클릭하면 paperchat가 실행됩니다."

; Tesseract 설치 메시지
LangString pc_tesseract_installing ${LANG_ENGLISH} "Installing Tesseract OCR... (via winget)"
LangString pc_tesseract_installing ${LANG_KOREAN}  "Tesseract OCR 설치 중... (winget 사용)"

LangString pc_tesseract_kor_lang ${LANG_ENGLISH} "Installing Tesseract Korean language pack..."
LangString pc_tesseract_kor_lang ${LANG_KOREAN}  "Tesseract 한국어 언어팩 설치 중..."

LangString pc_tesseract_fail ${LANG_ENGLISH} \
  "Tesseract OCR installation failed.$\n$\n\
  To install manually:$\n\
  1. Visit https://github.com/UB-Mannheim/tesseract/wiki$\n\
  2. Download the latest Windows installer$\n\
  3. Restart paperchat after installation."

LangString pc_tesseract_fail ${LANG_KOREAN} \
  "Tesseract OCR 자동 설치에 실패했습니다.$\n$\n\
  수동으로 설치하려면:$\n\
  1. https://github.com/UB-Mannheim/tesseract/wiki 방문$\n\
  2. 최신 Windows 설치 파일 다운로드 후 설치$\n\
  3. paperchat을 다시 실행하세요."

; AI 모델 삭제 메시지
LangString pc_delete_model ${LANG_ENGLISH} \
  "Delete AI model files?$\n$\n\
  Model files are 4–32 GB.$\n\
  Keeping them avoids re-downloading on reinstall.$\n$\n\
  Delete model files?"

LangString pc_delete_model ${LANG_KOREAN} \
  "AI 모델 파일을 삭제하시겠습니까?$\n$\n\
  AI 모델 파일은 4~32GB 용량을 차지합니다.$\n\
  삭제하지 않으면 재설치 시 다시 다운로드하지 않아도 됩니다.$\n$\n\
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

  IfFileExists "$PROGRAMFILES64\Tesseract-OCR\tesseract.exe" tesseract_ok tesseract_missing
  tesseract_missing:
    DetailPrint "$(pc_tesseract_installing)"
    nsExec::ExecToLog 'winget install tesseract-ocr.tesseract --silent --accept-package-agreements --accept-source-agreements'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONINFORMATION "$(pc_tesseract_fail)"
    ${EndIf}
    IfFileExists "$PROGRAMFILES64\Tesseract-OCR\tessdata\kor.traineddata" tesseract_ok kor_missing
    kor_missing:
      DetailPrint "$(pc_tesseract_kor_lang)"
      nsExec::ExecToLog 'powershell.exe -NoProfile -Command "Invoke-WebRequest ''https://github.com/tesseract-ocr/tessdata/raw/main/kor.traineddata'' -OutFile ''$PROGRAMFILES64\Tesseract-OCR\tessdata\kor.traineddata'' -UseBasicParsing"'
  tesseract_ok:
!macroend

; ── 언인스톨 훅 ───────────────────────────────────────────────────────────────
!macro customUnInstall
  !insertmacro KillPaperchatProcesses
  MessageBox MB_YESNO|MB_ICONQUESTION "$(pc_delete_model)" IDNO no_model_delete
    RMDir /r "$LOCALAPPDATA\com.paperchat.desktop"
  no_model_delete:
!macroend
