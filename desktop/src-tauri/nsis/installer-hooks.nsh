; paperchat 설치/언인스톨 훅

; ── 공통 프로세스 종료 매크로 ─────────────────────────────────────────────
!macro KillPaperchatProcesses
  ; 1차: 모든 관련 프로세스 강제 종료
  nsExec::ExecToLog 'powershell.exe -NoProfile -Command "Stop-Process -Name paperchat,backend,llama-server -Force -ErrorAction SilentlyContinue"'
  ; 2차: backend 종료 완료까지 최대 10초 폴링 (파일 핸들 해제 보장)
  nsExec::ExecToLog 'powershell.exe -NoProfile -Command "$i=0; while((Get-Process -Name backend -ErrorAction SilentlyContinue) -and ($i++ -lt 20)){Start-Sleep -Milliseconds 500}"'
!macroend

; ── 초기화 훅: 설치/재설치 시작 전 프로세스 종료 (.onInit에서 호출) ──────
!macro customInit
  !insertmacro KillPaperchatProcesses
!macroend

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
