; paperchat 설치/언인스톨 훅

; ── 공통 프로세스 종료 매크로 ─────────────────────────────────────────────
!macro KillPaperchatProcesses
  ; 현재 이름 + 구 이름(backend, llama-server) 모두 종료
  nsExec::ExecToLog 'powershell.exe -NoProfile -Command "Stop-Process -Name paperchat,paperchat-server,backend,llama-server -Force -ErrorAction SilentlyContinue"'
  ; paperchat-server / backend 종료 완료까지 최대 10초 폴링
  nsExec::ExecToLog 'powershell.exe -NoProfile -Command "$i=0; while(((Get-Process -Name paperchat-server -EA SilentlyContinue) -or (Get-Process -Name backend -EA SilentlyContinue)) -and ($i++ -lt 20)){Start-Sleep -Milliseconds 500}"'
!macroend

; ── 업그레이드 시 구 바이너리 정리 (backend.exe, llama-server.exe 제거) ────
!macro CleanupOldBinaries
  Delete "$INSTDIR\backend.exe"
  Delete "$INSTDIR\llama-server.exe"
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
    DetailPrint "Tesseract OCR 설치 중..."
    ; PowerShell로 자동 다운로드 + 자동 설치 (silent)
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$url=''https://digi.bib.uni-mannheim.de/tesseract/tesseract-ocr-w64-setup-5.4.0.20240606.exe''; $out=''$env:TEMP\tesseract-setup.exe''; Invoke-WebRequest $url -OutFile $out; Start-Process $out ''/S'' -Wait; Remove-Item $out"'
    ; 한국어 언어팩 다운로드
    DetailPrint "Tesseract 한국어 언어팩 설치 중..."
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest ''https://github.com/tesseract-ocr/tessdata/raw/main/kor.traineddata'' -OutFile ''$PROGRAMFILES64\Tesseract-OCR\tessdata\kor.traineddata''"'
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
