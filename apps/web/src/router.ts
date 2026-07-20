/**
 * Hash routing.
 *
 * The UI is embedded in the node binary and served from whatever path the node
 * happens to be mounted at, so it cannot own the URL path. The hash is the one
 * part of the URL that is unambiguously ours — and it keeps `?demo=1` in the
 * query string intact across navigation, which path routing would not.
 */

import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'search'; q: string; court: string; region: string; yearFrom: string; yearTo: string }
  | {
      name: 'case';
      id: string;
      tab: 'judgment' | 'citations' | 'graph';
      /** Paragraph index to scroll to and highlight, from a pinpoint link. */
      para: number | null;
    }
  | { name: 'status' }
  | { name: 'notfound'; path: string };

export function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?', 2);
  const params = new URLSearchParams(query);
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) {
    return {
      name: 'search',
      q: params.get('q') ?? '',
      court: params.get('court') ?? '',
      region: params.get('region') ?? '',
      yearFrom: params.get('year_from') ?? '',
      yearTo: params.get('year_to') ?? '',
    };
  }
  if (segments[0] === 'status' && segments.length === 1) return { name: 'status' };
  if (segments[0] === 'case' && segments[1]) {
    const tab = segments[2];
    const para = Number(params.get('para'));
    return {
      name: 'case',
      id: segments[1],
      tab: tab === 'citations' || tab === 'graph' ? tab : 'judgment',
      para: Number.isInteger(para) && params.has('para') ? para : null,
    };
  }
  return { name: 'notfound', path };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const update = (): void => setRoute(parse(location.hash));
    addEventListener('hashchange', update);
    return () => removeEventListener('hashchange', update);
  }, []);
  return route;
}

/** Build an in-app href. Always hash-relative, never absolute. */
export function href(path: string, params: Record<string, string> = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const q = sp.toString();
  return `#/${path.replace(/^\//, '')}${q ? `?${q}` : ''}`;
}

export function navigate(to: string): void {
  location.hash = to.startsWith('#') ? to.slice(1) : to;
}

/** Scroll to the top on every route change — a new judgment starts at its top. */
export function useScrollReset(key: string): void {
  useEffect(() => {
    scrollTo({ top: 0 });
  }, [key]);
}
