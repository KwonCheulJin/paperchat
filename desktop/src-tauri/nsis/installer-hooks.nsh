; paperchat 설치/언인스톨 훅

; ── 설치 훅: Tesseract OCR 자동 설치 ──────────────────────────────────────
!macro customInstall
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

; ── 언인스톨 훅: 실행 중인 sidecar 프로세스 강제 종료 ─────────────────────
!macro customUnInstall
  ; 실행 중인 backend 및 llama-server 프로세스 강제 종료
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM "backend.exe" /T'
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM "llama-server.exe" /T'
  ; 프로세스 종료 완료 대기
  Sleep 1500
!macroend
