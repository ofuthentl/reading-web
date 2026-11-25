import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { AuthSessionInfo } from '@/types';
import {
  DEFAULT_GUEST_SESSION,
  DEFAULT_OWNER_SESSION,
  getActiveAuthSession,
  isAuthError,
  isCloudMode,
  setAuthToken,
} from '@/lib/authSession';
import {
  type GateRoute,
  getCurrentGateRoute,
  navigateGateRoute,
  replaceGateRoute,
  subscribeGateRoute,
  syncGateDocumentTitle,
} from '@/lib/gateRoutes';
import { subscribePwaUpdate } from '@/lib/pwaRegister';
import { ToastContainer } from '@/components/ToastContainer';
import { useTheme } from '@/hooks/useTheme';
import { type ToastType, useToast } from '@/hooks/useToast';

const LazyAuthGate = lazy(() =>
  import('@/components/AuthGate').then((m) => ({ default: m.AuthGate })),
);
const LazyAdminUsageView = lazy(() =>
  import('@/components/AdminUsageView').then((m) => ({ default: m.AdminUsageView })),
);
const LazyAuthenticatedLibraryShell = lazy(() =>
  import('@/components/AuthenticatedLibraryShell').then((m) => ({
    default: m.AuthenticatedLibraryShell,
  })),
);

export default function App() {
  const { theme, cycleTheme } = useTheme();
  const { toasts, addToast, dismissToast } = useToast();

  const [authenticated, setAuthenticated] = useState(false);
  const [gateRoute, setGateRoute] = useState<GateRoute>(getCurrentGateRoute);
  const [session, setSession] = useState<AuthSessionInfo>(getActiveAuthSession);
  const [authReason, setAuthReason] = useState<string | null>(null);

  const authResetCleanupRef = useRef<(() => void) | null>(null);
  const pwaToastShownRef = useRef(false);

  useEffect(() => subscribeGateRoute(() => setGateRoute(getCurrentGateRoute())), []);

  useEffect(() => {
    return subscribePwaUpdate((applyUpdate) => {
      if (pwaToastShownRef.current) return;
      pwaToastShownRef.current = true;
      addToast("Có phiên bản mới của Ofu's Library.", 'info', 0, {
        label: 'Cập nhật ngay',
        onClick: applyUpdate,
      });
    });
  }, [addToast]);

  const registerShellCleanup = useCallback((fn: (() => void) | null) => {
    authResetCleanupRef.current = fn;
  }, []);

  const resetToLocked = useCallback(
    (reason: string | null, toastMessage: string, toastType: ToastType) => {
      setAuthToken(null);
      if (authResetCleanupRef.current) {
        authResetCleanupRef.current();
      } else if (isCloudMode) {
        void import('@/lib/shelfPrefs')
          .then((m) => m.clearLocalShelfPrefs())
          .catch(() => undefined);
      }
      void import('@/lib/guestCrypto')
        .then((m) => m.clearGuestIllustrationsCache())
        .catch(() => undefined);
      replaceGateRoute('locked');
      setAuthenticated(false);
      setSession(isCloudMode ? DEFAULT_GUEST_SESSION : DEFAULT_OWNER_SESSION);
      setAuthReason(reason);
      addToast(toastMessage, toastType);
    },
    [addToast],
  );

  const handleApiError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      const message = err instanceof Error ? err.message : fallbackMessage;
      if (isAuthError(err)) {
        resetToLocked(message, message, 'warning');
        return;
      }
      addToast(message, 'error');
    },
    [addToast, resetToLocked],
  );

  useEffect(() => {
    if (!authenticated) return;
    const current = getCurrentGateRoute();
    if (session.role === 'owner' && current === 'usage') {
      syncGateDocumentTitle('usage', true);
    } else if (current === 'locked' || current === 'entrance' || current === 'usage') {
      replaceGateRoute('root');
      syncGateDocumentTitle('root', true);
    } else {
      syncGateDocumentTitle('root', true);
    }
  }, [authenticated, session.role]);

  useEffect(() => {
    if (!authenticated) return;
    if (
      gateRoute === 'locked' ||
      gateRoute === 'entrance' ||
      (gateRoute === 'usage' && session.role !== 'owner')
    ) {
      replaceGateRoute('root');
      syncGateDocumentTitle('root', true);
      return;
    }
    syncGateDocumentTitle(gateRoute, true);
  }, [authenticated, gateRoute, session.role]);

  useEffect(() => {
    if (!authenticated || session.expiresAt === null) return;
    const expiresAt = session.expiresAt;
    const expireMessage =
      session.role === 'guest'
        ? 'Phiên truy cập 24 giờ đã hết hạn.'
        : 'Phiên đăng nhập đã hết hạn.';

    const MAX_TIMEOUT_MS = 2_147_483_647;
    let timerId: number | null = null;
    const scheduleExpiry = () => {
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        resetToLocked(expireMessage, expireMessage, 'warning');
        return;
      }
      // Chia chặng hẹn giờ để phiên owner 30 ngày không vượt ngưỡng 24.85 ngày của setTimeout (vá L-06)
      timerId = window.setTimeout(scheduleExpiry, Math.min(remainingMs, MAX_TIMEOUT_MS));
    };
    scheduleExpiry();
    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [authenticated, resetToLocked, session.expiresAt, session.role]);

  const handleAuthenticated = useCallback((nextSession: AuthSessionInfo) => {
    void import('@/lib/guestCrypto')
      .then((m) => m.clearGuestIllustrationsCache())
      .catch(() => undefined);
    setSession(nextSession);
    setAuthReason(null);
    setAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    resetToLocked(null, 'Đã đóng cửa thư viện.', 'info');
  }, [resetToLocked]);

  if (!authenticated) {
    return (
      <>
        <Suspense fallback={<div className="theme-canvas min-h-screen" />}>
          <LazyAuthGate
            onAuthenticated={handleAuthenticated}
            authReason={authReason}
            theme={theme}
            onCycleTheme={cycleTheme}
          />
        </Suspense>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const isOwner = session.role === 'owner';

  if (isOwner && gateRoute === 'usage') {
    return (
      <>
        <Suspense fallback={<div className="theme-canvas min-h-screen" />}>
          <LazyAdminUsageView
            theme={theme}
            onCycleTheme={cycleTheme}
            onBackToLibrary={() => navigateGateRoute('root')}
            onLogout={handleLogout}
            onApiError={handleApiError}
          />
        </Suspense>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<div className="theme-canvas min-h-screen" />}>
        <LazyAuthenticatedLibraryShell
          session={session}
          setSession={setSession}
          theme={theme}
          onCycleTheme={cycleTheme}
          onOpenUsage={isOwner ? () => navigateGateRoute('usage') : undefined}
          onLogout={handleLogout}
          onApiError={handleApiError}
          addToast={addToast}
          onRegisterCleanup={registerShellCleanup}
        />
      </Suspense>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
