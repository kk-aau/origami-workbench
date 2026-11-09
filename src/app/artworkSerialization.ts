import {exportModelSnapshot} from '../core/modelSnapshot';
import type {Doc,FlatFoldResult} from '../core/types';
import {exportArtworkProject,type ArtworkProject} from './artworkProject';
import {exportDiagramProject,type DiagramProject} from './diagramProject';

/** Export does not persist undo history or old layer certificates. Avoid copying
 * those potentially million-pair arrays into the recovery worker at all. The
 * source and the complete current indexed geometry still reach its validator. */
export function artworkSerializationInput(project:ArtworkProject):ArtworkProject {
 return {...project,models:{...project.models,entries:project.models.entries.map(entry=>({
  ...entry,history:{...entry.history,past:[],future:[],present:entry.history.present?{
   geometry:entry.history.present.geometry,
   layers:{status:entry.history.present.layers.status,message:'',...(Object.hasOwn(entry.history.present.layers,'constraints')?{constraints:entry.history.present.layers.constraints}:{})},
   warnings:[],
  }:null},
 }))}};
}

/** Worker-owned snapshots have no callers that can mutate them. Compare actual
 * structured data instead of JSON hashes: undefined/null, NaN and changed array
 * lengths must never reuse a previously validated export. */
function sameSnapshot(a:unknown,b:unknown):boolean {
 const pending:[unknown,unknown][]=[[a,b]];
 while(pending.length){
  const [left,right]=pending.pop()!;if(Object.is(left,right))continue;
  if(!left||!right||typeof left!=='object'||typeof right!=='object'||Object.getPrototypeOf(left)!==Object.getPrototypeOf(right))return false;
  if(left instanceof Date&&right instanceof Date){if(left.getTime()!==right.getTime())return false;continue;}
  if(left instanceof Map&&right instanceof Map){if(left.size!==right.size)return false;pending.push([[...left],[...right]]);continue;}
  if(left instanceof Set&&right instanceof Set){if(left.size!==right.size)return false;pending.push([[...left],[...right]]);continue;}
  if(left instanceof ArrayBuffer&&right instanceof ArrayBuffer){if(left.byteLength!==right.byteLength)return false;const x=new Uint8Array(left),y=new Uint8Array(right);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;continue;}
  if(Array.isArray(left)&&Array.isArray(right)&&left.length!==right.length)return false;
  const keys=Object.keys(left);if(keys.length!==Object.keys(right).length)return false;
  for(const key of keys){if(!Object.hasOwn(right,key))return false;pending.push([(left as Record<string,unknown>)[key],(right as Record<string,unknown>)[key]]);}
 }
 return true;
}

/** One bounded cache per persistent serialization worker. Reuse only exports
 * that already passed the full source/topology validator and whose complete
 * validation inputs are unchanged; never trust a saved source graph as proof. */
export function createArtworkSerializer(snapshotExport:typeof exportModelSnapshot=exportModelSnapshot){
 const snapshots:{source:Doc;geometry:FlatFoldResult['geometry'];constraints:unknown;text:string}[]=[];
 let diagram:{input:DiagramProject;text:string}|undefined;
 return (project:ArtworkProject):string=>{
  let position=0;
  const snapshot:typeof exportModelSnapshot=(source,result)=>{
   const slot=position++,prior=snapshots[slot],constraints=result.layers.constraints;
   if(prior&&sameSnapshot(prior.source,source)&&sameSnapshot(prior.geometry,result.geometry)&&sameSnapshot(prior.constraints,constraints))return prior.text;
   const text=snapshotExport(source,result);
   snapshots[slot]={...structuredClone({source,geometry:result.geometry,constraints}),text};return text;
  };
  const serializeDiagram=(input:DiagramProject)=>{
   if(diagram&&sameSnapshot(diagram.input,input))return diagram.text;
   const text=exportDiagramProject(input);diagram={input:structuredClone(input),text};return text;
  };
  const text=exportArtworkProject(project,{snapshot,diagram:serializeDiagram});
  snapshots.length=position;if(project.diagram===null)diagram=undefined;
  return text;
 };
}
