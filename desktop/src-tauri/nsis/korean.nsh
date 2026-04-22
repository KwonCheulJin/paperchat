; paperchat 한국어 번역
; Tauri customLanguageFiles로 MUI_LANGUAGE "Korean" 이후에 include됨.
; ⚠ customLanguageFiles는 Tauri 기본 번역을 **덮어쓰므로** Tauri 기본 LangString도 이 파일에 포함해야 함.

; ── Tauri 기본 번역 (createDesktop, installMode, maintenance 등) ──────────────
LangString addOrReinstall ${LANG_KOREAN} "컴포넌트 추가 및 재설치"
LangString alreadyInstalled ${LANG_KOREAN} "이미 설치되어 있습니다"
LangString alreadyInstalledLong ${LANG_KOREAN} "${PRODUCTNAME} ${VERSION}이(가) 이미 설치되어 있습니다. 수행하고자 하는 작업을 선택하고 '다음'을 클릭하여 계속합니다."
LangString appRunning ${LANG_KOREAN} "{{product_name}}이(가) 실행 중입니다! 먼저 닫은 후 다시 시도하세요."
LangString appRunningOkKill ${LANG_KOREAN} "{{product_name}}이(가) 실행 중입니다!$\n'OK'를 누르면 실행 중인 프로그램을 종료합니다."
LangString chooseMaintenanceOption ${LANG_KOREAN} "수행하려는 관리 옵션을 선택합니다."
LangString choowHowToInstall ${LANG_KOREAN} "${PRODUCTNAME}의 설치 방법을 선택하세요."
LangString createDesktop ${LANG_KOREAN} "바탕화면 바로가기 만들기"
LangString deleteAppData ${LANG_KOREAN} "애플리케이션 데이터 삭제하기"
LangString dontUninstall ${LANG_KOREAN} "제거하지 않기"
LangString dontUninstallDowngrade ${LANG_KOREAN} "제거하지 않기 (이 설치 프로그램에서는 제거하지 않고 다운그레이드할 수 없습니다.)"
LangString failedToKillApp ${LANG_KOREAN} "{{product_name}}을(를) 종료하지 못했습니다. 먼저 닫은 후 다시 시도하세요."
LangString installingWebview2 ${LANG_KOREAN} "WebView2를 설치하는 중입니다..."
LangString newerVersionInstalled ${LANG_KOREAN} "${PRODUCTNAME}의 최신 버전이 이미 설치되어 있습니다! 이전 버전을 설치하지 않는 것이 좋습니다. 이 이전 버전을 꼭 설치하려면 먼저 현재 버전을 제거하는 것이 좋습니다. 수행하려는 작업을 선택하고 '다음'을 클릭하여 계속합니다."
LangString older ${LANG_KOREAN} "구"
LangString olderOrUnknownVersionInstalled ${LANG_KOREAN} "시스템에 ${PRODUCTNAME}의 $R4 버전이 설치되어 있습니다. 설치하기 전에 현재 버전을 제거하는 것이 좋습니다. 수행하려는 작업을 선택하고 다음을 클릭하여 계속합니다."
LangString silentDowngrades ${LANG_KOREAN} "이 설치 프로그램에서는 다운그레이드가 비활성화되어 자동 설치 프로그램을 진행할 수 없습니다. 대신 그래픽 인터페이스 설치 프로그램을 사용하세요.$\n"
LangString unableToUninstall ${LANG_KOREAN} "제거할 수 없습니다!"
LangString uninstallApp ${LANG_KOREAN} "${PRODUCTNAME} 제거하기"
LangString uninstallBeforeInstalling ${LANG_KOREAN} "설치하기 전에 제거하기"
LangString unknown ${LANG_KOREAN} "알 수 없음"
LangString webview2AbortError ${LANG_KOREAN} "WebView2를 설치하지 못했습니다! WebView2가 없으면 앱을 실행할 수 없습니다. 인스톨러를 다시 시작해보세요."
LangString webview2DownloadError ${LANG_KOREAN} "오류: WebView2 다운로드를 실패하였습니다. - $0"
LangString webview2DownloadSuccess ${LANG_KOREAN} "WebView2 부트스트래퍼가 성공적으로 다운로드되었습니다."
LangString webview2Downloading ${LANG_KOREAN} "WebView2 부트스트래퍼 다운로드 중..."
LangString webview2InstallError ${LANG_KOREAN} "오류: 종료 코드 $1로 WebView2를 설치하지 못했습니다."
LangString webview2InstallSuccess ${LANG_KOREAN} "WebView2가 성공적으로 설치되었습니다."

; ── paperchat 커스텀 텍스트 ───────────────────────────────────────────────────
LangString pc_welcome_title ${LANG_KOREAN} "paperchat 설치"

LangString pc_welcome_text ${LANG_KOREAN} \
  "paperchat는 완전히 로컬에서 실행되는 AI 문서 분석 도구입니다.$\r$\n$\r$\n\
  · 문서가 외부 서버로 전송되지 않음$\r$\n\
  · 인터넷 없이 AI 분석 동작$\r$\n\
  · 로컬 언어 모델로 PDF 분석$\r$\n$\r$\n\
  이 설치 프로그램은 한국어 OCR을 위해 Tesseract도 함께 설정합니다.$\r$\n$\r$\n\
  다음을 클릭해 설치를 시작하세요."

LangString pc_finish_title ${LANG_KOREAN} "설치 완료"

LangString pc_finish_text ${LANG_KOREAN} \
  "설치가 완료되었습니다.$\r$\n$\r$\n\
  첫 실행 전 AI 모델 파일(.gguf)을 Models 폴더에 복사하세요.$\r$\n\
  권장 모델: Qwen2.5-7B, Gemma-2-9B 등 (4–8 GB).$\r$\n$\r$\n\
  마침을 클릭하면 paperchat가 실행됩니다."

LangString pc_tesseract_check    ${LANG_KOREAN} "Tesseract OCR 확인 중..."
LangString pc_tesseract_install  ${LANG_KOREAN} "Tesseract OCR 설치 중 (winget 사용)..."
LangString pc_tesseract_kor_lang ${LANG_KOREAN} "한국어 언어팩 설치 중..."
LangString pc_tesseract_done     ${LANG_KOREAN} "Tesseract OCR 준비 완료."

LangString pc_tesseract_fail ${LANG_KOREAN} \
  "Tesseract OCR 자동 설치에 실패했습니다.$\n$\n\
  수동 설치 방법:$\n\
  1. github.com/UB-Mannheim/tesseract/wiki 방문$\n\
  2. Windows 설치 파일 다운로드 후 실행$\n\
  3. paperchat 재시작$\n$\n\
  Tesseract 설치 전까지 PDF 텍스트 인식이 제한될 수 있습니다."

LangString pc_delete_model ${LANG_KOREAN} \
  "AI 모델 파일을 삭제하시겠습니까?$\n$\n\
  모델 파일은 4–32 GB입니다. 보관하면 재설치 시 다시 다운로드하지 않아도 됩니다.$\n$\n\
  모델 파일을 삭제하시겠습니까?"
