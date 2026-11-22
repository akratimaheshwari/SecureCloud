import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiError } from '../utils/errors';

// useFetch(() => api.call(), [deps]) -> { data, loading, error, reload }
// `data` is whatever the fetcher resolves with. reload(true) refreshes without showing the loading state (used for polling).
export default function useFetch(fetcher, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  const silentRef = useRef(false);
  fetcherRef.current = fetcher;

  const reload = useCallback((silent = false) => {
    silentRef.current = silent === true;
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    if (!silentRef.current) setState((s) => ({ ...s, loading: true, error: null }));
    silentRef.current = false;
    fetcherRef.current()
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((err) => { if (!cancelled) setState((s) => ({ data: s.data, loading: false, error: getApiError(err) })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  return { ...state, reload };
}
