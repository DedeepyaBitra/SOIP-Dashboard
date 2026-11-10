import { useAsync } from './useAsync.js';

/**
 * Generic hook for any service call, e.g.
 *   const { data, loading, error, reload } = useServiceData(() => getLeads({ source }), [source]);
 * `empty` is true when the call succeeded but returned no rows.
 */
export function useServiceData(serviceCall, deps = []) {
  const result = useAsync(serviceCall, deps);
  const empty = !result.loading && !result.error && Array.isArray(result.data) && result.data.length === 0;
  return { ...result, empty };
}
