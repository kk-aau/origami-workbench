import {api} from './api';
import {readTwistedPotParams,type TwistedPotParams} from './twistedPotParams';

type XY=[number,number];
type XYZ=[number,number,number];
export type SmoothPotReference={
  family:'twisted-pot-smooth-reference';
  query:TwistedPotParams&{flatFlanges:'smooth'};
  paper:{vertices:XY[];edges:[number,number][];faces:number[][]};
  reference3D:{vertices:XYZ[];displayVertices:XYZ[]};
  diagnostics:{paperGeometryPassed:true;maximumFaceDistanceError:number;
    maximumFacePlaneError:number;maximumGoreEquationResidual:number};
  certification:{metricPreserving:false;adoptableCreasePattern:false;
    continuousFoldChecked:false;savedNumericalOut:false};
  source:{notebookRows:[268886,271306];note:string};
};

const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const number=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const point=(x:unknown,n:number)=>Array.isArray(x)&&x.length===n&&x.every(number);
const index=(x:unknown,length:number)=>number(x)&&Number.isInteger(x)&&x>=0&&x<length;
function invalid():never{throw Error('Smooth 法兰只读参考返回了无效的几何或安全标记。');}

export function parseSmoothPotReference(raw:unknown,requested:TwistedPotParams):SmoothPotReference{
  if(!object(raw)||raw.family!=='twisted-pot-smooth-reference'||!object(raw.query)||
    !object(raw.paper)||!object(raw.reference3D)||!object(raw.diagnostics)||
    !object(raw.certification)||!object(raw.source))invalid();
  if(raw.query.flatFlanges!=='smooth')invalid();
  const restored=readTwistedPotParams({...raw.query,flatFlanges:'faceted'});
  if(!restored||JSON.stringify(restored)!==JSON.stringify(requested))invalid();
  const paper=raw.paper,spatial=raw.reference3D,diagnostics=raw.diagnostics,
    cert=raw.certification,source=raw.source;
  if(!Array.isArray(paper.vertices))invalid();
  const vertices=paper.vertices;
  if(vertices.length<4||vertices.length>500||
    !vertices.every(v=>point(v,2))||!Array.isArray(paper.edges)||
    paper.edges.length<4||paper.edges.length>1500||!paper.edges.every(e=>
      Array.isArray(e)&&e.length===2&&e.every(v=>index(v,vertices.length))&&e[0]!==e[1])||
    !Array.isArray(paper.faces)||paper.faces.length<1||paper.faces.length>600||
    !paper.faces.every(face=>Array.isArray(face)&&face.length>=3&&face.length<=12&&
      face.every(v=>index(v,vertices.length)))||
    vertices.length-paper.edges.length+paper.faces.length!==1||
    !Array.isArray(spatial.vertices)||!Array.isArray(spatial.displayVertices)||
    spatial.vertices.length!==vertices.length||
    spatial.displayVertices.length!==vertices.length||
    !spatial.vertices.every(v=>point(v,3))||!spatial.displayVertices.every(v=>point(v,3)))invalid();
  if(diagnostics.paperGeometryPassed!==true||
    !['maximumFaceDistanceError','maximumFacePlaneError','maximumGoreEquationResidual']
      .every(key=>number(diagnostics[key])&&(diagnostics[key] as number)>=0)||
    cert.metricPreserving!==false||cert.adoptableCreasePattern!==false||
    cert.continuousFoldChecked!==false||cert.savedNumericalOut!==false||
    !Array.isArray(source.notebookRows)||source.notebookRows[0]!==268886||
    source.notebookRows[1]!==271306||typeof source.note!=='string')invalid();
  return raw as SmoothPotReference;
}

export async function fetchSmoothPotReference(params:TwistedPotParams,signal?:AbortSignal){
  return parseSmoothPotReference(await api('tessellation/twisted-pot-smooth-reference',
    {...params,flatFlanges:'smooth'},signal),params);
}
