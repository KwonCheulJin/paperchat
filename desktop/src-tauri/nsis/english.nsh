; paperchat English custom LangStrings
; Included after MUI_LANGUAGE "English" via Tauri's customLanguageFiles

LangString pc_welcome_title ${LANG_ENGLISH} "Welcome to paperchat"

LangString pc_welcome_text ${LANG_ENGLISH} \
  "paperchat runs entirely on your device — no cloud, no internet required.$\r$\n$\r$\n\
  · Documents stay on your computer$\r$\n\
  · AI analysis works fully offline$\r$\n\
  · Supports PDF with local language models$\r$\n$\r$\n\
  This installer will also configure Tesseract OCR for Korean text recognition.$\r$\n$\r$\n\
  Click Next to begin."

LangString pc_finish_title ${LANG_ENGLISH} "paperchat is ready"

LangString pc_finish_text ${LANG_ENGLISH} \
  "Installation complete.$\r$\n$\r$\n\
  Before first use, place an AI model file (.gguf) in the Models folder.$\r$\n\
  Recommended: Qwen2.5-7B, Gemma-2-9B, or similar (4–8 GB).$\r$\n$\r$\n\
  Click Finish to launch paperchat."

LangString pc_tesseract_check    ${LANG_ENGLISH} "Checking Tesseract OCR..."
LangString pc_tesseract_install  ${LANG_ENGLISH} "Installing Tesseract OCR (via winget)..."
LangString pc_tesseract_kor_lang ${LANG_ENGLISH} "Installing Korean language pack..."
LangString pc_tesseract_done     ${LANG_ENGLISH} "Tesseract OCR ready."

LangString pc_tesseract_fail ${LANG_ENGLISH} \
  "Tesseract OCR could not be installed automatically.$\n$\n\
  To install manually:$\n\
  1. Visit: github.com/UB-Mannheim/tesseract/wiki$\n\
  2. Download and run the Windows installer$\n\
  3. Restart paperchat$\n$\n\
  PDF text recognition may be limited until Tesseract is installed."

LangString pc_delete_model ${LANG_ENGLISH} \
  "Remove AI model files?$\n$\n\
  Model files are 4–32 GB. Keeping them avoids re-downloading on reinstall.$\n$\n\
  Remove model files?"
