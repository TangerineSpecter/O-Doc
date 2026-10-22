import DiagnosticBoundary from './components/common/DiagnosticBoundary';
import StartupError from './components/common/StartupError';
import { installRuntimeDiagnostics, reportDiagnostic } from './utils/diagnostics';
// frontend_react/src/main.tsx
import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { applyAppFont, getStoredAppFont } from './config/fonts.ts';
import { setupPreventZoom } from './utils/preventZoom.ts';
import { installModalScrollLock } from './utils/modalScrollLock.ts';
import {localMode, mocksEnabled} from './config/development';
import {getAuthToken, saveAuthToken} from './utils/authStorage';
import {clearMockWorkers} from './utils/mockStartup';

applyAppFont(getStoredAppFont());
setupPreventZoom();
const disposeModalScrollLock = installModalScrollLock();
if (import.meta.hot) import.meta.hot.dispose(disposeModalScrollLock);
const disposeDiagnostics = installRuntimeDiagnostics();
if (import.meta.hot) import.meta.hot.dispose(disposeDiagnostics);

function reportStartupError(error: unknown, operation: string) {
  // Mock may not be running yet, so local startup must not send diagnostics to an API.
  if (localMode) return;
  try {
    reportDiagnostic({errorType: 'runtime', module: 'startup', operation,
      stack: error instanceof Error ? error.stack : undefined}, error);
  } catch {
    // Diagnostics must not prevent rendering startup feedback.
  }
}

async function enableMocking() {
  // Mock 数据只在显式开启时启用，避免开发联调时拦截真实后端接口。
  if (!mocksEnabled) {
    try {
      await clearMockWorkers('serviceWorker' in navigator ? navigator.serviceWorker : undefined);
    } catch (error) {
      reportStartupError(error, '清理模拟接口');
    }
    return;
  }

  const { worker } = await import('./mocks/browser.ts');

  // 启动 worker，onUnhandledRequest: 'bypass' 表示未 Mock 的请求直接放行
  await worker.start({
    onUnhandledRequest: 'bypass', 
  });
  if (localMode) {
    if (!getAuthToken()) saveAuthToken('local-demo-token', false);
    document.title = '[LOCAL] O-Doc';
  }
}

async function startApplication() {
  const root = createRoot(document.getElementById('root')!);
  try {
    await enableMocking();
    const LocalModeBar: ComponentType | null = localMode ? (await import('./mocks/LocalModeBar')).default : null;
    root.render(
      <StrictMode>
        <DiagnosticBoundary>{LocalModeBar && <LocalModeBar/>}<App /></DiagnosticBoundary>
      </StrictMode>,
    );
  } catch (error) {
    // An explicitly enabled mock must be ready before any business page mounts.
    root.render(<StartupError localMode={localMode} mocksEnabled={mocksEnabled}/>);
    reportStartupError(error, '初始化应用');
  }
}

void startApplication();
