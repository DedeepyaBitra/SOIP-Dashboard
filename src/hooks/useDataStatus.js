import { useAsync } from './useAsync.js';
import { getDataStatus } from '../services/refreshService.js';

/** Data availability, latest refresh and data-quality summary for the status panel. */
export function useDataStatus() {
  return useAsync(getDataStatus, []);
}
