/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export function useAsyncResource<T>(
  loader: () => Promise<T>,
  deps: DependencyList,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loaderRef.current();
      setData(next);
      return next;
    } catch (resourceError) {
      setError(resourceError instanceof Error ? resourceError.message : 'Error desconocido');
      return null;
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void refresh();
  }, deps);

  return { data, loading, error, refresh, setData };
}
