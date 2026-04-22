; paperchat English translations
; Included after MUI_LANGUAGE "English" via Tauri customLanguageFiles.
; customLanguageFiles overrides Tauri defaults — default LangStrings must be included here too.

; ── Tauri default LangStrings ─────────────────────────────────────────────────
LangString addOrReinstall ${LANG_ENGLISH} "Add components and reinstall"
LangString alreadyInstalled ${LANG_ENGLISH} "Already installed"
LangString alreadyInstalledLong ${LANG_ENGLISH} "${PRODUCTNAME} ${VERSION} is already installed. Select the operation you want to perform and click Next to continue."
LangString appRunning ${LANG_ENGLISH} "{{product_name}} is running! Please close it and try again."
LangString appRunningOkKill ${LANG_ENGLISH} "{{product_name}} is running!$\nClick OK to terminate the running program."
LangString chooseMaintenanceOption ${LANG_ENGLISH} "Select the maintenance option you want to perform."
LangString choowHowToInstall ${LANG_ENGLISH} "Choose how to install ${PRODUCTNAME}."
LangString createDesktop ${LANG_ENGLISH} "Create Desktop Shortcut"
LangString deleteAppData ${LANG_ENGLISH} "Delete application data"
LangString dontUninstall ${LANG_ENGLISH} "Do not uninstall"
LangString dontUninstallDowngrade ${LANG_ENGLISH} "Do not uninstall (This installer cannot downgrade without uninstalling first.)"
LangString failedToKillApp ${LANG_ENGLISH} "Failed to terminate {{product_name}}. Please close it and try again."
LangString installingWebview2 ${LANG_ENGLISH} "Installing WebView2..."
LangString newerVersionInstalled ${LANG_ENGLISH} "A newer version of ${PRODUCTNAME} is already installed! It is not recommended to install an older version. If you really want to install this older version, it is recommended to uninstall the current version first. Select the operation you want to perform and click Next to continue."
LangString older ${LANG_ENGLISH} "older"
LangString olderOrUnknownVersionInstalled ${LANG_ENGLISH} "Version $R4 of ${PRODUCTNAME} is installed on the system. It is recommended to uninstall the current version before installing. Select the operation you want to perform and click Next to continue."
LangString silentDowngrades ${LANG_ENGLISH} "Downgrades are disabled in this installer, the silent installer cannot continue. Please use the graphical installer instead.$\n"
LangString unableToUninstall ${LANG_ENGLISH} "Unable to uninstall!"
LangString uninstallApp ${LANG_ENGLISH} "Uninstall ${PRODUCTNAME}"
LangString uninstallBeforeInstalling ${LANG_ENGLISH} "Uninstall before installing"
LangString unknown ${LANG_ENGLISH} "unknown"
LangString webview2AbortError ${LANG_ENGLISH} "Failed to install WebView2! The app cannot run without WebView2. Try restarting the installer."
LangString webview2DownloadError ${LANG_ENGLISH} "Error: Failed to download WebView2. - $0"
LangString webview2DownloadSuccess ${LANG_ENGLISH} "WebView2 bootstrapper was successfully downloaded."
LangString webview2Downloading ${LANG_ENGLISH} "Downloading WebView2 bootstrapper..."
LangString webview2InstallError ${LANG_ENGLISH} "Error: Failed to install WebView2 with exit code $1."
LangString webview2InstallSuccess ${LANG_ENGLISH} "WebView2 was successfully installed."

; ── paperchat custom text ─────────────────────────────────────────────────────
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
