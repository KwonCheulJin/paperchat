import { initErrorMonitor } from '@kwoncheulJin/error-monitor';

function getInstallationId(): string {
  const KEY = 'paperchat_install_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

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
  defaultContext: {
    appVersion: '0.9.4',
    platform: 'tauri-desktop',
    installationId: getInstallationId(),
  },
});
