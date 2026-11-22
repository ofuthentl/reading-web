import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { reloadOnceForStaleChunk } from '@/lib/chunkReload';
import App from './App.tsx';
import './index.css';

window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForStaleChunk()) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if (
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches
) {
  window.setTimeout(() => {
    void import('@/lib/mikuCursorAnimator')
      .then((mod) => mod.startMikuCursorAnimation())
      .catch(() => undefined);
  }, 300);
}
