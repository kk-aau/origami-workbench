import {buildFold} from '../core/geometry';
import type {Doc,FoldGraph} from '../core/types';
import {simulationSourceSignature} from './simLayerOrder';

export interface SimulationGraphPreparation {graph:FoldGraph|null;warnings:string[];matchesPose:boolean}

/** Keep the original independent-pose semantics: an invalid current CP does
 * not prevent restoring a previously validated pose with its own source. */
export function prepareSimulationGraph(doc:Doc,hasPose=false,poseSource?:unknown):SimulationGraphPreparation {
 let built:ReturnType<typeof buildFold>;
 try{built=buildFold(doc);}catch(error){if(hasPose)return {graph:null,warnings:[],matchesPose:false};throw error;}
 const signature=hasPose?simulationSourceSignature(built.graph):'';
 return {graph:built.graph,warnings:built.warnings,matchesPose:!!signature&&signature===simulationSourceSignature(poseSource)};
}
