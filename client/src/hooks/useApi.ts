import { useState, useCallback, useRef, useEffect } from 'react';

export function useApi<T, Args extends unknown[] = unknown[]>(
  apiFunc: (...args: Args) => Promise<T>
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const apiFuncRef = useRef(apiFunc);
  
  useEffect(() => {
    apiFuncRef.current = apiFunc;
  }, [apiFunc]);

  const request = useCallback(
    async (...args: Args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFuncRef.current(...args);
        setData(result);
        return result;
      } catch (err: unknown) {
        const resData = typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string; error?: string } } }).response?.data
          : undefined;
        const backendMsg = resData?.message || resData?.error;
        const errorObj = backendMsg
          ? new Error(backendMsg)
          : err instanceof Error
            ? err
            : new Error('API request failed');
        setError(errorObj);
        throw errorObj;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { data, loading, error, request, setData };
}

export default useApi;
