import { initErrorMonitor } from '@kwoncheulJin/error-monitor';

export function isErrorMonitorOptedIn(): boolean {
  try {
    return localStorage.getItem('paperchat_error_monitor_opt_in') !== 'false';
  } catch {
    return true;
  }
}

export function setErrorMonitorOptIn(value: boolean): void {
  try {
    localStorage.setItem('paperchat_error_monitor_opt_in', String(value));
  } catch {
    // ignore
  }
}

function getInstallationId(): string {
  const KEY = 'paperchat_install_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

if (isErrorMonitorOptedIn()) {
  initErrorMonitor({
    projectId: 'paperchat',
    firebaseConfig: {
      apiKey: 'AIzaSyD0hZcMshix0oJS40H1kb3vExVN3Uq7AJw',
      authDomain: 'error-snapshot-650f3.firebaseapp.com',
      projectId: 'error-snapshot-650f3',
      storageBucket: 'error-snapshot-650f3.firebasestorage.app',
      messagingSenderId: '37028497611',
      appId: '1:37028497611:web:33f371e4770a211a3ab34e',
    },
    breadcrumbs: {
      navigation: false,
      click: false,
      fetch: true,
      console: true,
    },
    transport: {
      enabled: import.meta.env.PROD,
    },
    defaultContext: {
      appVersion: '0.9.4',
      platform: 'tauri-desktop',
      installationId: getInstallationId(),
    },
  });
}
