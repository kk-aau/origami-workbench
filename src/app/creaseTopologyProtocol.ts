import type {Doc,Point,Segment} from '../core/types';
import type {SnapPoint} from './snapPoints';

/** Scheduling threshold only: the worker computes the same complete geometry. */
export const CREASE_TOPOLOGY_WORKER_THRESHOLD=20000;
export const CREASE_TOPOLOGY_CHUNK=4096;
export interface CreaseTopology {points:SnapPoint[];vertices:Point[]}
export type CreaseTopologyResult={status:'ready';value:CreaseTopology}|{status:'cancelled'|'error';message:string};
export type CreaseTopologyRequest=
 |{type:'begin';paper:Doc['paper'];count:number;readOnly:boolean;includeVertices:boolean}
 |{type:'segments';offset:number;segments:Segment[]}
 |{type:'compute'}|{type:'next'};
export type CreaseTopologyReply=
 |{type:'result-begin';points:number;vertices:number}
 |{type:'points';offset:number;points:SnapPoint[]}
 |{type:'vertices';offset:number;vertices:Point[]}
 |{type:'complete'}|{type:'error';message:string};
