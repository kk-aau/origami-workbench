import {checkCoverageTournaments,type RegionCoverage,type RegionPair,type RegionProgress,type RegionTournamentCheck} from './regionTournament';
export type RegionCoverageChecker=(coverage:RegionCoverage,pairs:readonly RegionPair[],values:ArrayLike<number>,onProgress?:RegionProgress,batchSize?:number)=>RegionTournamentCheck;
// Installed only in a dedicated calculation worker. Browser/UI and existing
// synchronous/core callers keep the complete sequential implementation.
let workerChecker:RegionCoverageChecker|undefined;
export function installWorkerRegionCoverageChecker(checker:RegionCoverageChecker){workerChecker=checker;}
export const checkRegionCoverage:RegionCoverageChecker=(...args)=>(workerChecker??checkCoverageTournaments)(...args);
