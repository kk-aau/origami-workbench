import {api} from './api';
import {readRadialPotParams,type RadialPotParams} from './radialPotParams';

type XY=[number,number];
export type RadialPotCWQuery=Omit<RadialPotParams,'border'|'arcDirection'>&{
  border:'circular';arcDirection:'CW';
};
type Arc={wedge:number;between:'ab'|'bc'|'cd'|'de'|'ef';sweepDeg:number;edgeIndices:number[]};
export type RadialPotCWReference={
  family:'radial-pot-cw-reference';query:RadialPotCWQuery;
  graph:{vertices:XY[];edges:[number,number][];edgeRoles:('outer'|'radial'|'axial'|'B')[];arcs:Arc[]};
  diagnostics:{majorArcCount:number;maximumArcSweepDeg:number;
    angularOverlapWitness:null|{wedge:number;between:Arc['between'];sweepDeg:number;sectorSpacingDeg:number}};
  certification:{sourceDerived:true;savedNumericalOut:false;paperGeometryChecked:false;
    metricPreserving:false;adoptableCreasePattern:false};
  source:{arcDefinitionRows:[17650,17808];wedgeArcifyRows:[262629,262703];
    savedProfileRows:[264342,264500];note:string};
};

const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const keys=(x:Record<string,unknown>,allowed:string[])=>Object.keys(x).every(key=>allowed.includes(key));
const pair=(x:unknown)=>Array.isArray(x)&&x.length===2&&x.every(finite);
const same=(a:unknown,b:unknown):boolean=>{
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));
  if(object(a)||object(b))return object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&
    Object.keys(a).every(key=>key in b&&same(a[key],b[key]));
  return a===b;
};
function invalid():never{throw Error('CW 长弧只读来源返回了无效的参数、线图或安全标记。');}

export function readRadialPotCWQuery(raw:unknown):RadialPotCWQuery|null{
  if(!object(raw)||raw.border!=='circular'||raw.arcDirection!=='CW')return null;
  const adoptable=readRadialPotParams({...raw,arcDirection:'CCW'});
  if(!adoptable||adoptable.border!=='circular')return null;
  return {...adoptable,border:'circular',arcDirection:'CW'};
}

export function radialPotCWQuery(params:RadialPotParams):RadialPotCWQuery{
  const {arcDirection:_,...base}=params;
  const query=readRadialPotCWQuery({...base,border:'circular',
    arcMaximumAngleDeg:params.arcMaximumAngleDeg??5,
    arcDivisions:params.arcDivisions??1,
    arcMethod:params.arcMethod??'inscribed',arcDirection:'CW'});
  if(!query)invalid();
  return query;
}

export function parseRadialPotCWReference(raw:unknown,requested:RadialPotCWQuery):RadialPotCWReference{
  if(!object(raw)||!keys(raw,['family','query','graph','diagnostics','certification','source'])||
    raw.family!=='radial-pot-cw-reference'||!object(raw.query)||!readRadialPotCWQuery(raw.query)||
    !same(raw.query,requested)||!object(raw.graph)||!object(raw.diagnostics)||
    !object(raw.certification)||!object(raw.source))invalid();
  const graph=raw.graph,diagnostics=raw.diagnostics,cert=raw.certification,source=raw.source;
  if(!keys(graph,['vertices','edges','edgeRoles','arcs'])||
    !Array.isArray(graph.vertices)||graph.vertices.length<6||graph.vertices.length>3000||
    !graph.vertices.every(pair)||!Array.isArray(graph.edges)||
    graph.edges.length<1||graph.edges.length>6000||
    !graph.edges.every(e=>pair(e)&&e.every((i:number)=>Number.isInteger(i)&&i>=0&&i<(graph.vertices as unknown[]).length)&&e[0]!==e[1])||
    !Array.isArray(graph.edgeRoles)||graph.edgeRoles.length!==graph.edges.length||
    !graph.edgeRoles.every(role=>['outer','radial','axial','B'].includes(role))||
    !Array.isArray(graph.arcs)||graph.arcs.length<1||graph.arcs.length>80)invalid();
  const arcNames=['ab','bc','cd','de','ef'];
  if(!graph.arcs.every(arc=>object(arc)&&keys(arc,['wedge','between','sweepDeg','edgeIndices'])&&
    Number.isInteger(arc.wedge)&&Number(arc.wedge)>=0&&Number(arc.wedge)<requested.sectors&&
    arcNames.includes(String(arc.between))&&finite(arc.sweepDeg)&&arc.sweepDeg<=0&&arc.sweepDeg>=-360&&
    Array.isArray(arc.edgeIndices)&&arc.edgeIndices.length>=1&&arc.edgeIndices.length<=360&&
    arc.edgeIndices.every((i:unknown)=>Number.isInteger(i)&&Number(i)>=0&&Number(i)<(graph.edges as unknown[]).length&&
      (graph.edgeRoles as string[])[Number(i)]==='B')))invalid();
  const arcs=graph.arcs as Arc[];
  const major=arcs.filter(arc=>Math.abs(arc.sweepDeg)>180).length;
  const maximum=Math.max(...arcs.map(arc=>Math.abs(arc.sweepDeg)));
  const witness=diagnostics.angularOverlapWitness;
  if(!keys(diagnostics,['majorArcCount','maximumArcSweepDeg','angularOverlapWitness'])||
    diagnostics.majorArcCount!==major||!finite(diagnostics.maximumArcSweepDeg)||
    Math.abs(diagnostics.maximumArcSweepDeg-maximum)>1e-7||
    (witness!==null&&(!object(witness)||!keys(witness,['wedge','between','sweepDeg','sectorSpacingDeg'])||
      !finite(witness.sweepDeg)||!finite(witness.sectorSpacingDeg)||
      Math.abs(witness.sectorSpacingDeg-360/requested.sectors)>1e-8||
      !arcs.some(arc=>arc.wedge===witness.wedge&&arc.between===witness.between&&
        Math.abs(arc.sweepDeg-Number(witness.sweepDeg))<1e-8&&Math.abs(arc.sweepDeg)>Number(witness.sectorSpacingDeg)))))invalid();
  if(!keys(cert,['sourceDerived','savedNumericalOut','paperGeometryChecked','metricPreserving','adoptableCreasePattern'])||
    cert.sourceDerived!==true||cert.savedNumericalOut!==false||cert.paperGeometryChecked!==false||
    cert.metricPreserving!==false||cert.adoptableCreasePattern!==false||
    !keys(source,['arcDefinitionRows','wedgeArcifyRows','savedProfileRows','note'])||
    !same(source.arcDefinitionRows,[17650,17808])||!same(source.wedgeArcifyRows,[262629,262703])||
    !same(source.savedProfileRows,[264342,264500])||typeof source.note!=='string')invalid();
  return raw as RadialPotCWReference;
}

export async function fetchRadialPotCWReference(query:RadialPotCWQuery,signal?:AbortSignal){
  return parseRadialPotCWReference(await api('tessellation/radial-pot-cw-reference',query,signal),query);
}
