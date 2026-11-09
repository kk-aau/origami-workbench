import { useEffect, useState } from 'react';
import type { Point } from '../core/types';
import { startVoronoi, type VoronoiResult } from './voronoiTask';
const empty: VoronoiResult = { status: 'ready', edges: [], error: '' };
export function useVoronoi(enabled: boolean, sites: Point[]) {
  const [result, setResult] = useState<{ sites: Point[]; value: VoronoiResult } | null>(null);
  useEffect(() => {
    if (!enabled || sites.length < 2) { setResult(null); return; }
    let live = true;
    const task = startVoronoi(sites);
    task.promise.then(value => { if (live) setResult({ sites, value }); });
    return () => { live = false; task.cancel(); };
  }, [enabled, sites]);
  const current = enabled && sites.length >= 2;
  // Never display stale geometry for even one render after the seed array changes.
  return { ...(current && result?.sites === sites ? result.value : empty), busy: current && result?.sites !== sites };
}
