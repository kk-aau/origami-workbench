import type {Point} from '../core/types';
const bytes=new ArrayBuffer(8),view=new DataView(bytes);
const adjacent=(x:number,up:boolean)=>{if(x===0)return up?Number.MIN_VALUE:-Number.MIN_VALUE;
 view.setFloat64(0,x);let bits=view.getBigUint64(0);bits+=(x>0)===up?1n:-1n;view.setBigUint64(0,bits);return view.getFloat64(0);};
type Interval=[number,number];
const subtract=(a:Interval,b:Interval):Interval=>[adjacent(a[0]-b[1],false),adjacent(a[1]-b[0],true)];
const plus=(a:Interval,b:Interval):Interval=>[adjacent(a[0]+b[0],false),adjacent(a[1]+b[1],true)];
const multiply=(a:Interval,b:Interval):Interval=>{const q=a.flatMap(x=>b.map(y=>x*y));return [adjacent(Math.min(...q),false),adjacent(Math.max(...q),true)];};
/** Independent raw-coordinate enclosure; uncertain zero/noise is never positive. */
export function wovenAreaBounds(points:Point[],face:number[]):Interval{
 const error=32*Number.EPSILON*Math.max(1,...points.flat().map(Math.abs)),
  origin=points[face[0]].map(x=>[adjacent(x-error,false),adjacent(x+error,true)] as Interval),
  local=face.map(v=>points[v].map((x,k)=>subtract([adjacent(x-error,false),adjacent(x+error,true)],origin[k])));
 let sum:Interval=[0,0];for(let i=0;i<local.length;i++){const a=local[i],b=local[(i+1)%local.length];sum=plus(sum,subtract(multiply(a[0],b[1]),multiply(a[1],b[0])));}
 return sum;
}
type CellHoleContext={holes:number[][];cornerSource:Map<number,number>;componentCount:number;edges:[number,number][]};
export function verifyWovenAreaRecovery(source:Record<string,any>,initial:Point[],faces:number[][],context?:CellHoleContext):boolean{
 const raw=source.topologyAreaRecovery;if(raw===undefined)return source.topologyAreaRecheckAttempts===undefined;
 const hole=raw?.cellHoles,keys=['method','areaBounds','unresolvedCycles','coordinateUncertainty','sourceCoordinatesChanged','newNegativeProbesAdded','originalObjectiveChanged','finalGeometryToleranceChanged','allOriginalConstraintsRetained',...(hole===undefined?[]:['cellHoles'])];
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join('|')!==keys.sort().join('|')||
  raw.method!=='translated-outward-area/32epsilon-corner-allowance'||raw.sourceCoordinatesChanged!==false||raw.newNegativeProbesAdded!==false||
  raw.originalObjectiveChanged!==false||raw.finalGeometryToleranceChanged!==false||raw.allOriginalConstraintsRetained!==true||
  source.optimization!=='origamica-merit'||source.topologyProbeBudget!==170||source.topologyProbeAttempts!==170||
  !Number.isInteger(source.topologyAreaRecheckAttempts)||source.topologyAreaRecheckAttempts<1||source.topologyAreaRecheckAttempts>174||
  !Number.isInteger(raw.unresolvedCycles)||raw.unresolvedCycles<0||raw.unresolvedCycles>faces.length+1||
  !Array.isArray(raw.areaBounds)||raw.areaBounds.length!==faces.length||
  raw.coordinateUncertainty!==32*Number.EPSILON*Math.max(1,...initial.flat().map(Math.abs)))return false;
 const verified=(face:number[],reported:unknown)=>{const actual=wovenAreaBounds(initial,face.slice().reverse());
  if(!actual.every(Number.isFinite)||actual[0]<=0||!Array.isArray(reported)||reported.length!==2||!reported.every((x:unknown)=>typeof x==='number'&&Number.isFinite(x))||reported[0]<=0||reported[0]>reported[1])return false;
  const width=actual[1]-actual[0],tolerance=Math.max(width*1e-4,64*Number.EPSILON*Math.max(Math.abs(actual[0]),Math.abs(actual[1])));
  return Math.abs(actual[0]-reported[0])<=tolerance&&Math.abs(actual[1]-reported[1])<=tolerance;
 };
 if(!faces.every((face,i)=>verified(face,raw.areaBounds[i])))return false;
 if(hole===undefined)return !context?.holes.length;
 if(!context||!context.holes.length||!hole||typeof hole!=='object'||Array.isArray(hole)||Object.keys(hole).sort().join('|')!==['schema','originalCycles','excludedCycles','excludedBounds','materialEuler'].sort().join('|')||hole.schema!=='zhezhi-woven-cell-hole-area-v1'||JSON.stringify(hole.originalCycles)!==JSON.stringify(context.holes)||hole.materialEuler!==context.componentCount-context.holes.length||initial.length-context.edges.length+faces.length!==hole.materialEuler||!Array.isArray(hole.excludedCycles)||hole.excludedCycles.length!==context.holes.length||!Array.isArray(hole.excludedBounds)||hole.excludedBounds.length!==hole.excludedCycles.length)return false;
 const canonical=(cycle:number[])=>[cycle,cycle.slice().reverse()].flatMap(q=>q.map((_,i)=>q.slice(i).concat(q.slice(0,i)).join(','))).sort()[0],wanted=context.holes.map(canonical).sort(),actual:string[]=[],edgeKey=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(','),edgeSet=new Set(context.edges.map(([a,b])=>edgeKey(a,b)));
 for(let i=0;i<hole.excludedCycles.length;i++){
  const cycle=hole.excludedCycles[i];if(!Array.isArray(cycle)||cycle.length<3||new Set(cycle).size!==cycle.length||cycle.some(v=>!Number.isInteger(v)||v<0||v>=initial.length)||!verified(cycle,hole.excludedBounds[i])||cycle.some((v,k)=>!edgeSet.has(edgeKey(v,cycle[(k+1)%cycle.length]))))return false;
  const collapsed:number[]=[];for(const v of cycle){const original=context.cornerSource.get(v);if(original===undefined)return false;if(collapsed.at(-1)!==original)collapsed.push(original);}if(collapsed[0]===collapsed.at(-1))collapsed.pop();actual.push(canonical(collapsed));
 }
 return actual.sort().join('|')===wanted.join('|');
}
