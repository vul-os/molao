import { useEffect, useState } from 'preact/hooks';
import { ApiError, api, type Api } from './api';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Run an API call, keyed. Late responses from a superseded key are dropped, so
 * a fast second search cannot be overwritten by a slow first one.
 */
export function useApi<T>(key: string, run: (client: Api) => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let live = true;
    setState((prev) => ({ data: prev.data, error: null, loading: true }));
    api()
      .then(run)
      .then((data) => {
        if (live) setState({ data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (!live) return;
        const message = err instanceof ApiError || err instanceof Error ? err.message : 'Unexpected error';
        setState({ data: null, error: message, loading: false });
      });
    return () => {
      live = false;
    };
    // `run` is deliberately not a dependency: callers pass a fresh closure on
    // every render, and `key` is what actually identifies the request.
  }, [key]);

  return state;
}
