import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import process from 'process'
import './index.css'
import App from './App.jsx'
import { APP_TITLE_CRASH, APP_TITLE_DEFAULT } from './config/appMeta'

function renderFatal(error) {
  try {
    if (typeof document !== 'undefined') {
      document.title = APP_TITLE_CRASH;
      const root = document.getElementById('root');
      if (root) {
        const msg = error && error.message ? String(error.message) : String(error);
        const stack = error && error.stack ? String(error.stack) : '';
        root.innerHTML = `
          <div style="min-height:60vh;display:flex;align-items:center;justify-content:center;padding:24px;">
            <div style="max-width:960px;width:100%;background:#0b1220;border:1px solid rgba(244,63,94,0.35);border-radius:16px;padding:18px;color:#e5e7eb;">
              <div style="font-weight:700;color:#fda4af;font-size:16px;">页面发生错误（已阻止白屏）</div>
              <div style="margin-top:8px;color:#cbd5e1;font-size:12px;">请复制下面错误信息发我，我会按堆栈定位根因。</div>
              <pre style="margin-top:12px;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;color:#fecaca;font-size:12px;line-height:1.4;">${msg}${stack ? `\n\n${stack}` : ''}</pre>
              <div style="margin-top:12px;display:flex;gap:10px;">
                <button onclick="window.location.reload()" style="padding:8px 12px;border-radius:12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#e5e7eb;cursor:pointer;">刷新页面</button>
              </div>
            </div>
          </div>
        `;
      }
    }
  } catch (e) {
    void e;
  }
  try {
    console.error('[fatal]', error);
  } catch (e) {
    void e;
  }
}

// Polyfill Node.js globals for browser environment (required by ag-psd)
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.process = process;
  try {
    document.title = document.title && String(document.title).trim() ? document.title : APP_TITLE_DEFAULT;
  } catch (e) {
    void e;
  }
  window.addEventListener('error', (evt) => {
    const err = evt && evt.error ? evt.error : new Error(evt && evt.message ? String(evt.message) : 'Unknown error');
    renderFatal(err);
  });
  window.addEventListener('unhandledrejection', (evt) => {
    const reason = evt && evt.reason != null ? evt.reason : new Error('Unhandled promise rejection');
    renderFatal(reason instanceof Error ? reason : new Error(String(reason)));
  });
}

try {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (e) {
  renderFatal(e instanceof Error ? e : new Error(String(e)));
}
