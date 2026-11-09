import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';

export type SimulationDisplayMode='paper'|'wireframe'|'xray'|'strain'|'normals';
export type SimulationCameraPreset='front'|'back'|'left'|'right'|'top'|'bottom'|'isometric';
export type SimulationCreaseStyle='assignment'|'crease'|'diagram';

export interface SimulationDisplayOptions {
  showFaces:boolean;
  showEdges:boolean;
  mountains:boolean;
  valleys:boolean;
  boundaries:boolean;
  facets:boolean;
  unassigned:boolean;
  /** Percentage, not a fraction: 5 means 5% axial strain. */
  strainClip:number;
  background:string;
}

export const DEFAULT_SIMULATION_DISPLAY_OPTIONS:Readonly<SimulationDisplayOptions>=Object.freeze({
  showFaces:true,showEdges:true,mountains:true,valleys:true,boundaries:true,
  facets:false,unassigned:true,strainClip:5,background:'#f0f3ef',
});

/** Validate a complete patch before applying any field; malformed messages never partially apply. */
export function mergeSimulationDisplayOptions(current:SimulationDisplayOptions,patch:unknown):SimulationDisplayOptions|null {
  if(!patch||typeof patch!=='object'||Array.isArray(patch))return null;
  const prototype=Object.getPrototypeOf(patch);
  if(prototype!==Object.prototype&&prototype!==null)return null;
  const next={...current};
  for(const [key,value] of Object.entries(patch)){
    switch(key){
      case 'showFaces':case 'showEdges':case 'mountains':case 'valleys':case 'boundaries':case 'facets':case 'unassigned':
        if(typeof value!=='boolean')return null;
        next[key]=value;break;
      case 'strainClip':
        if(typeof value!=='number'||!Number.isFinite(value)||value<.1||value>30)return null;
        next.strainClip=value;break;
      case 'background':
        if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))return null;
        next.background=value.toLowerCase();break;
      default:return null;
    }
  }
  return next;
}

/** Missing fields inherit defaults so older saved settings remain readable. */
export function normalizeSimulationDisplayOptions(value:unknown):SimulationDisplayOptions|null {
  return mergeSimulationDisplayOptions({...DEFAULT_SIMULATION_DISPLAY_OPTIONS},value);
}

/** Flatten the visual style once so screen, CPU fallback and image exports agree. */
export function displaySettings(base:RenderSettings,mode:SimulationDisplayMode,creaseStyle:SimulationCreaseStyle='assignment',options?:SimulationDisplayOptions):RenderSettings{
  const creaseInk:[number,number,number]=[.19,.23,.21];
  const diagnostic=mode==='strain'||mode==='normals';
  return {...base,showFaces:mode!=='wireframe'&&(options?.showFaces??true),showEdges:options?.showEdges??true,
    faceAlpha:mode==='xray'?.36:1,colorMode:diagnostic?mode:'paper',
    lighting:!diagnostic,strainClip:options?.strainClip??5,diagramStyle:creaseStyle==='diagram',
    ...(options?{
      showMountains:options.mountains,showValleys:options.valleys,showBoundaries:options.boundaries,
      showFacets:options.facets,showUnassigned:options.unassigned,
      background:[1,3,5].map(start=>parseInt(options.background.slice(start,start+2),16)/255) as [number,number,number],
    }:{}),
    ...(creaseStyle==='crease'?{
      mountainColor:[...creaseInk] as [number,number,number],
      valleyColor:[...creaseInk] as [number,number,number],
      creaseWidthPx:base.creaseWidthPx*.625,
      creaseDash:{border:base.creaseDash?.border??null,mountain:null,valley:null},
    }:{}),
    ...(creaseStyle==='diagram'?{
      // Only source F lines survive the diagram renderer's material-edge mask;
      // subdivision edges remain invisible even when they bend with the paper.
      showFacets:true,creaseWidthPx:base.creaseWidthPx*.625,
      creaseDash:{border:null,mountain:null,valley:null},
    }:{})};
}

/** Match the vendored GPU/SVG strain ramp, expressed as a CSS colour. */
export function strainInk(fraction:number,clip=5):string{
  const hue=Math.max(0,Math.min(.7,(1-Math.min(Math.max(fraction,0)*100,clip)/clip)*.7));
  const unit=(value:number)=>Math.max(0,Math.min(1,value));
  const channel=(offset:number)=>unit(2-Math.abs(hue*6-offset));
  const rgb=[unit(Math.abs(hue*6-3)-1),channel(2),channel(4)].map(v=>Math.round(v*255));
  return `rgb(${rgb.join(',')})`;
}

/** Snapshot the solver's current vertices in standard FOLD x/y/z axes. */
export function simulationFoldSnapshot(prepared:PreparedOrigamiModel,positions:Float32Array,progress:number,steps:number){
  if(positions.length!==prepared.vertexCount*3||!Array.from(positions).every(Number.isFinite))throw new Error('三维顶点尚未准备好，无法导出。');
  const vertices=Array.from({length:prepared.vertexCount},(_,i)=>[
    Number(positions[3*i].toFixed(7)),Number((-positions[3*i+2]).toFixed(7)),Number(positions[3*i+1].toFixed(7))]);
  const fold=structuredClone(prepared.fold);
  fold.vertices_coords=vertices;
  // These are requested target angles, not the measured angles of this transient mesh.
  delete fold.edges_foldAngle;
  delete fold.faceOrders;
  fold.file_spec=1.2;
  fold.file_creator='折纸工坊三维模拟';
  fold.frame_classes=['foldedForm'];
  fold.frame_attributes=['3D'];
  fold.frame_title=`数值模拟 ${Math.round(progress*100)}% · ${steps} 步`;
  return fold;
}
