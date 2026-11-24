export type GateRoute = 'root' | 'entrance' | 'locked' | 'usage';

const GATE_ROUTE_EVENT = 'ofu:gate-route-change';

function normalizeBasePath(): string {
  const raw = (import.meta.env.BASE_URL || '/').trim();
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export function parsePathnameToGateRoute(pathname: string): GateRoute {
  const base = normalizeBasePath();
  let relative = pathname;
  if (base !== '/' && pathname.startsWith(base)) {
    relative = pathname.slice(base.length);
  } else if (base !== '/' && `${pathname}/` === base) {
    relative = '';
  }
  const cleaned = relative.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (cleaned === 'entrance') return 'entrance';
  if (cleaned === 'locked') return 'locked';
  if (cleaned === 'usage') return 'usage';
  return 'root';
}

export function getCurrentGateRoute(): GateRoute {
  if (typeof window === 'undefined') return 'root';
  return parsePathnameToGateRoute(window.location.pathname);
}

export function buildGateHref(route: GateRoute): string {
  const base = normalizeBasePath();
  if (route === 'root') return base;
  return `${base}${route}`;
}

export function syncGateDocumentTitle(route: GateRoute, authenticated: boolean): void {
  if (typeof document === 'undefined') return;
  if (authenticated) {
    document.title = route === 'usage' ? "Ofu's Library · Usage" : "Ofu's Library";
    return;
  }
  // Giấu hoàn toàn tiêu đề trang /usage khi chưa đăng nhập Admin (D-035)
  document.title =
    route === 'entrance' ? "Ofu's Library Entrance" : "Ofu's Library Closed";
}

export function replaceGateRoute(route: GateRoute): void {
  if (typeof window === 'undefined') return;
  const targetPath = buildGateHref(route);
  const preservedSearch = route === 'usage' ? '' : window.location.search;
  const targetHref = `${targetPath}${preservedSearch}`;
  if (`${window.location.pathname}${window.location.search}` !== targetHref) {
    window.history.replaceState(null, '', targetHref);
  }
  window.dispatchEvent(new Event(GATE_ROUTE_EVENT));
}

export function navigateGateRoute(route: GateRoute): void {
  if (typeof window === 'undefined') return;
  const targetPath = buildGateHref(route);
  const preservedSearch = route === 'usage' ? '' : window.location.search;
  const targetHref = `${targetPath}${preservedSearch}`;
  if (`${window.location.pathname}${window.location.search}` !== targetHref) {
    window.history.pushState(null, '', targetHref);
  }
  window.dispatchEvent(new Event(GATE_ROUTE_EVENT));
}

export function subscribeGateRoute(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('popstate', listener);
  window.addEventListener(GATE_ROUTE_EVENT, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(GATE_ROUTE_EVENT, listener);
  };
}
