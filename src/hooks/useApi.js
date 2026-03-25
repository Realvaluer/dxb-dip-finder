import { useState, useEffect, useRef } from 'react';

// Stale-while-revalidate cache
const apiCache = new Map();

export function useFetch(url, deps = []) {
  const cached = apiCache.get(url);
  const [data, setData] = useState(cached || null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Show cached data immediately, but still refetch
    const cachedData = apiCache.get(url);
    if (cachedData) {
      setData(cachedData);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    fetch(url, { signal: ctrl.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        apiCache.set(url, d);
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => ctrl.abort();
  }, deps);

  return { data, loading, error };
}

export function useDebouncedFetch(url, deps = [], delay = 300) {
  const cached = apiCache.get(url);
  const [data, setData] = useState(cached || null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Show cached data immediately
    const cachedData = apiCache.get(url);
    if (cachedData) {
      setData(cachedData);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    const timer = setTimeout(() => {
      if (!cachedData) setLoading(true);
      fetch(url)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(d => {
          apiCache.set(url, d);
          setData(d);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setLoading(false);
        });
    }, delay);
    return () => clearTimeout(timer);
  }, deps);

  return { data, loading, error };
}
