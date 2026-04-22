; paperchat 한국어 커스텀 LangString
; Tauri의 customLanguageFiles로 MUI_LANGUAGE "Korean" 이후에 include됨

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
