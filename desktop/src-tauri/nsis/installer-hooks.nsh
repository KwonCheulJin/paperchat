; paperchat 설치/언인스톨 훅

; ── 공통 프로세스 종료 매크로 ─────────────────────────────────────────────
!macro KillPaperchatProcesses
  ; 현재 이름 + 구 이름(backend, llama-server) 모두 종료
  nsExec::ExecToLog 'powershell.exe -NoProfile -Command "Stop-Process -Name paperchat,paperchat-server,backend,llama-server -Force -ErrorAction SilentlyContinue"'
  ; paperchat-server / backend 종료 완료까지 최대 10초 폴링
  nsExec::ExecToLog 'powershell.exe -NoProfile -Command "$i=0; while(((Get-Process -Name paperchat-server -EA SilentlyContinue) -or (Get-Process -Name backend -EA SilentlyContinue)) -and ($i++ -lt 20)){Start-Sleep -Milliseconds 500}"'
!macroend

; ── 업그레이드 시 구 바이너리 정리 (backend.exe 제거 — llama-server.exe는 유지) ────
!macro CleanupOldBinaries
  ; backend.exe 는 paperchat-server.exe 로 이름 변경됨 → 구 파일 제거
  Delete "$INSTDIR\backend.exe"
  ; llama-server.exe 는 현재도 동일 이름 사용 → 제거하지 않음
!macroend

; ── 초기화 훅: 설치/재설치 시작 전 프로세스 종료 (.onInit에서 호출) ──────
!macro customInit
  !insertmacro KillPaperchatProcesses
!macroend

; ── 설치 훅: 업그레이드 구 파일 정리 + Tesseract OCR 자동 설치 ──────────────
!macro customInstall
  !insertmacro CleanupOldBinaries
  ; Tesseract 설치 여부 확인
  IfFileExists "$PROGRAMFILES64\Tesseract-OCR\tesseract.exe" tesseract_ok tesseract_missing
  tesseract_missing:
    DetailPrint "Tesseract OCR 설치 중... (winget 사용)"
    ; winget 으로 설치 — Microsoft 서명 도구라서 보안 정책 우회 불필요
    nsExec::ExecToLog 'winget install tesseract-ocr.tesseract --silent --accept-package-agreements --accept-source-agreements'
    Pop $0
    ${If} $0 != 0
      ; winget 실패 시 사용자에게 안내 (수동 설치 유도)
      MessageBox MB_OK|MB_ICONINFORMATION \
        "Tesseract OCR 자동 설치에 실패했습니다.$\n$\n수동으로 설치하려면:$\n1. https://github.com/UB-Mannheim/tesseract/wiki 방문$\n2. 최신 Windows 설치 파일 다운로드 후 설치$\n3. paperchat 을 다시 실행하세요."
    ${EndIf}
    ; 한국어 언어팩 확인 및 설치
    IfFileExists "$PROGRAMFILES64\Tesseract-OCR\tessdata\kor.traineddata" tesseract_ok kor_missing
    kor_missing:
      DetailPrint "Tesseract 한국어 언어팩 설치 중..."
      nsExec::ExecToLog 'powershell.exe -NoProfile -Command "Invoke-WebRequest ''https://github.com/tesseract-ocr/tessdata/raw/main/kor.traineddata'' -OutFile ''$PROGRAMFILES64\Tesseract-OCR\tessdata\kor.traineddata'' -UseBasicParsing"'
  tesseract_ok:
!macroend

; ── 언인스톨 훅: 프로세스 종료 + 모델 파일 삭제 선택 ─────────────────────
!macro customUnInstall
  !insertmacro KillPaperchatProcesses

  ; AI 모델 파일 삭제 여부 확인 (4~32GB 대용량)
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "AI 모델 파일을 삭제하시겠습니까?$\n$\nAI 모델 파일은 4~32GB 용량을 차지합니다.$\n삭제하지 않으면 재설치 시 다운로드를 건너뜁니다." \
    IDNO no_model_delete
    RMDir /r "$LOCALAPPDATA\com.paperchat.desktop"
  no_model_delete:
!macroend
