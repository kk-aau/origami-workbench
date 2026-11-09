import type {FlatLayerPreference} from '../core/types';
import {useMemo,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import type {DiagramPose} from '../app/diagramProject';
import {diagramPresentation} from '../app/diagramDrawing';
import {diagramIllustrationMesh} from '../app/diagramIllustrationMesh';
import {diagramLayerStackOrder} from './diagramLayerStackOrder';
import {filterDiagramLayerStackFaces} from './diagramLayerStackSearch';
import DiagramLayerSolutions,{type DiagramLayerAdjustmentDirection} from './DiagramLayerSolutions';
export {diagramLayerStackOrder} from './diagramLayerStackOrder';
import './DiagramLayerStack.css';

export interface DiagramLayerStackProps {
  pose:DiagramPose|null;
  hoveredFaces?:number[];
  selectedFaces?:number[];
  fixedFaces?:number[];
  onHoverFace?:(face:number|null)=>void;
  onSelectFace?:(face:number)=>void;
  onToggleVisible?:(face:number)=>void;
  onShowAll?:()=>void;
  onHideAll?:()=>void;
  onAnalyse?:()=>void;
  analysing?:boolean;
  analysisError?:string;
  analysisUnavailableReason?:string;
  onRelativeConstraints?:(required:FlatLayerPreference[])=>void;
  onAdjustLayer?:(face:number,direction:DiagramLayerAdjustmentDirection)=>void;
  adjustmentMode?:boolean;
  onAdjustmentModeChange?:(enabled:boolean)=>void;
  adjustmentFace?:number;
  adjustingLayer?:boolean;
  layerAdjustmentError?:string;
  layerAdjustmentFeedback?:string;
  /** A selected cutaway edits its local visibility instead of the whole pose. */
  visibilityContext?:{label:string;hiddenFaces:number[]};
  controls?:ReactNode;
  faceActions?:(face:number)=>ReactNode;
  selectionHint?:string;
  disabled?:boolean;
}

export default function DiagramLayerStack({pose,hoveredFaces=[],selectedFaces=[],fixedFaces=[],onHoverFace,onSelectFace,onToggleVisible,onShowAll,onHideAll,onAnalyse,analysing=false,analysisError,analysisUnavailableReason,onAdjustLayer,onRelativeConstraints,adjustmentMode=false,onAdjustmentModeChange,adjustmentFace,adjustingLayer=false,layerAdjustmentError,layerAdjustmentFeedback,visibilityContext,controls,faceActions,selectionHint,disabled=false}:DiagramLayerStackProps) {
  const [search,setSearch]=useState('');
  const searchInput=useRef<HTMLInputElement>(null);
  const ordered=useMemo(()=>pose?diagramLayerStackOrder(pose,selectedFaces):null,[pose,selectedFaces]);
  const drawing=useMemo(()=>{
    if(!pose)return null;
    const display=diagramPresentation(pose),xs=display.vertices.map(point=>point[0]),ys=display.vertices.map(point=>point[1]);
    const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(1,Math.max(...xs)-x),h=Math.max(1,Math.max(...ys)-y),pad=Math.max(w,h)*.06;
    return {display,viewBox:`${x-pad} ${y-pad} ${w+pad*2} ${h+pad*2}`};
  },[pose]);
  if(!pose||!ordered||!drawing||!ordered.faces.length)return null;
  const known=ordered.scope!=='unknown',solved=pose.result.layers.status==='solved';
  const label=analysing?'正在分析层序…':ordered.scope==='global'?'上层 → 下层':ordered.scope==='local'?'选中纸层 · 局部顺序':solved?'已分析 · 局部层序':'层序未确认';
  const analysisMessage=analysing?'正在自动分析当前纸层，无需切换。':analysisUnavailableReason??analysisError??(!solved?pose.result.layers.message:ordered.scope==='unknown'?'已求得局部层序；各区域分别确定上下关系，没有统一的全局层位。选择纸面可查看对应的局部顺序。':null);
  const faces=ordered.scope==='local'?[...ordered.faces,...pose.result.geometry.faces.map((_,face)=>face).filter(face=>!ordered.faces.includes(face))]:ordered.faces;
  const filteredFaces=filterDiagramLayerStackFaces(faces,search);
  const localHidden=new Set(visibilityContext?.hiddenFaces??pose.hiddenFaces??[]);
  const blocked=new Set(visibilityContext?pose.hiddenFaces??[]:[]);
  const hidden=new Set([...localHidden,...blocked]),visibleCount=faces.filter(face=>!hidden.has(face)).length;
  const scope=visibilityContext?'圆内':'';
  const layerKnown=(face:number)=>known&&ordered.faces.includes(face);
  const maxCards=6,available=new Set(faces);
  const visualSelectedFaces=adjustmentMode?(adjustmentFace===undefined?[]:[adjustmentFace]):selectedFaces;
  // Keep the face currently pointed at in the compact stack preview; the
  // full-height list always retains every source paper face, including hidden.
  const important=[...new Set([...hoveredFaces,...visualSelectedFaces,...fixedFaces])].filter(face=>available.has(face));
  const previewFaces=important.slice(0,maxCards);
  for(const face of faces)if(previewFaces.length<maxCards&&!previewFaces.includes(face))previewFaces.push(face);
  previewFaces.sort((a,b)=>faces.indexOf(a)-faces.indexOf(b));
  const state=(face:number)=>hoveredFaces.includes(face)?'hovered':visualSelectedFaces.includes(face)?'selected':fixedFaces.includes(face)?'fixed':'normal';
  const path=(face:number)=>diagramIllustrationMesh(pose).rings[face].map(ring=>ring.map((vertex,index)=>`${index?'L':'M'}${drawing.display.vertices[vertex].join(' ')}`).join(' ')+'Z').join(' ');
  const faceLabel=(face:number)=>`纸面 F${face+1}${layerKnown(face)?`，${ordered.scope==='local'?'选中组':'当前视角'}第 ${ordered.faces.indexOf(face)+1} 层`:'，层位未确认'}${fixedFaces.includes(face)?'，已固定':''}${blocked.has(face)?'，整图已隐藏':hidden.has(face)?`，${scope}已隐藏`:''}`;
  return <aside className={`diagram-layer-stack${known?'':' is-unknown'}${controls?' has-layer-controls':''}`} aria-label="纸层顺序提示" aria-busy={analysing||adjustingLayer} data-layer-analysis={analysing?'running':analysisError?'error':pose.result.layers.status} data-diagram-layer-stack={ordered.scope} data-layer-visibility-scope={visibilityContext?'window':'whole'}>
    <header className="diagram-layer-stack-header"><strong>{visibilityContext?.label??'纸层顺序'}</strong><span>{label}</span></header>
    <div className="diagram-layer-stack-preview" role="group" aria-label={known?`${label}，按当前正背观察方向显示`:'纸面示意，不表示真实上下顺序'}>
      {previewFaces.map((face,index)=><button type="button" key={face} className="diagram-layer-stack-card" data-diagram-stack-face={face} data-layer-state={state(face)} data-layer-visible={!hidden.has(face)} aria-label={faceLabel(face)} aria-pressed={visualSelectedFaces.includes(face)} disabled={disabled} onPointerEnter={()=>onHoverFace?.(face)} onPointerLeave={()=>onHoverFace?.(null)} onFocus={()=>onHoverFace?.(face)} onBlur={()=>onHoverFace?.(null)} onClick={()=>onSelectFace?.(face)} style={{'--stack-index':index,'--stack-depth':previewFaces.length-index,'--stack-angle':`${(index-(previewFaces.length-1)/2)*5}deg`} as CSSProperties}>
        <svg viewBox={drawing.viewBox} aria-hidden="true"><path d={path(face)} fill={drawing.display.frontMaterial[face]?'#fff5df':'#b5cbb9'} fillRule="evenodd" stroke="currentColor" vectorEffect="non-scaling-stroke"/></svg>
        <span className="diagram-layer-stack-face-label">F{face+1}</span>
        <span className="diagram-layer-stack-position" title={layerKnown(face)?'从当前观察方向的最上层开始编号':'层位未确认'}>{layerKnown(face)?ordered.faces.indexOf(face)+1:'?'}</span>
        {fixedFaces.includes(face)&&<span className="diagram-layer-stack-pin" aria-hidden="true">◆</span>}
      </button>)}
    </div>
    <div className="diagram-layer-stack-visibility"><span aria-live="polite">{scope}显示 {visibleCount} / {faces.length}</span><div><button type="button" disabled={disabled||localHidden.size===0||!onShowAll} onClick={onShowAll}>{scope}全部显示</button><button type="button" disabled={disabled||visibleCount===0||!onHideAll} onClick={onHideAll}>{scope}全部隐藏</button></div></div>
    {analysisMessage&&<p className="diagram-layer-stack-note" role="status">{analysisMessage}</p>}
    {onAnalyse&&<div className="diagram-layer-stack-analysis"><button type="button" disabled={disabled||analysing||adjustingLayer||!!analysisUnavailableReason} title={analysisUnavailableReason} onClick={onAnalyse}>{analysing?'正在分析…':solved?'重新分析层序':'重试层序分析'}</button></div>}
    <DiagramLayerSolutions result={pose.result} side={pose.view?.side??'front'} onRelativeConstraints={onRelativeConstraints} adjustmentMode={adjustmentMode} adjustmentFace={adjustmentFace} position={ordered.scope==='global'&&adjustmentFace!==undefined&&ordered.faces.includes(adjustmentFace)?ordered.faces.indexOf(adjustmentFace)+1:undefined} onAdjustmentModeChange={onAdjustmentModeChange} disabled={disabled||analysing||!!analysisUnavailableReason} busy={adjustingLayer} error={layerAdjustmentError} feedback={layerAdjustmentFeedback} onAdjust={onAdjustLayer}/>
    {ordered.scope==='local'&&<p className="diagram-layer-stack-note">仅表示选中组的顺序，其他纸层尚未确认。</p>}
    {selectionHint&&!adjustmentMode&&<p className="diagram-layer-stack-selection-hint" role="status">{selectionHint}</p>}
    <div className="diagram-layer-stack-search" role="search" aria-label="搜索纸面">
      <div className="diagram-layer-stack-search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input ref={searchInput} type="search" value={search} aria-label="搜索纸面编号" placeholder="搜索纸面，如 F12 / 12" disabled={disabled} autoComplete="off" spellCheck={false} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setSearch('');}}}/>{search&&<button type="button" aria-label="清空纸面搜索" title="清空搜索（Esc）" disabled={disabled} onClick={()=>{setSearch('');searchInput.current?.focus();}}>清空</button>}</div>
      {search.trim()&&<span className="diagram-layer-stack-search-count" role="status">找到 {filteredFaces.length} / {faces.length} 张纸面</span>}
    </div>
    <ol className="diagram-layer-stack-list" aria-label={known?'从上到下的纸面列表':'按纸面编号查看'}>
      {filteredFaces.map(face=><li key={face} data-layer-visible={!hidden.has(face)}><button type="button" className="diagram-layer-stack-select" data-diagram-stack-row={face} data-layer-state={state(face)} aria-label={faceLabel(face)} aria-pressed={visualSelectedFaces.includes(face)} disabled={disabled||blocked.has(face)} onPointerEnter={()=>onHoverFace?.(face)} onPointerLeave={()=>onHoverFace?.(null)} onFocus={()=>onHoverFace?.(face)} onBlur={()=>onHoverFace?.(null)} onClick={()=>onSelectFace?.(face)}><span className="diagram-layer-stack-row-position">{layerKnown(face)?`${ordered.faces.indexOf(face)+1} 层`:'?'}</span><strong>F{face+1}</strong><span className="diagram-layer-stack-row-status">{blocked.has(face)?'整图已隐藏':hidden.has(face)?`${scope}已隐藏`:fixedFaces.includes(face)?'已固定':visualSelectedFaces.includes(face)?'已选中':''}</span></button>{!adjustmentMode&&faceActions?.(face)}<button type="button" className="diagram-layer-stack-eye" data-diagram-layer-visibility={face} aria-label={`${scope}${hidden.has(face)?'显示':'隐藏'}纸面 F${face+1}`} aria-pressed={!hidden.has(face)} disabled={disabled||blocked.has(face)||!onToggleVisible} onClick={()=>onToggleVisible?.(face)} title={blocked.has(face)?'整图已隐藏；取消符号选择后可恢复整图显示':`${scope}${hidden.has(face)?'显示':'隐藏'}这张纸层`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{hidden.has(face)&&<path className="diagram-layer-eye-off" d="m4 3 16 18"/>}</svg></button></li>)}
      {!filteredFaces.length&&<li className="diagram-layer-stack-search-empty">未找到纸面，请检查编号或清空搜索。</li>}
    </ol>
    {controls&&!adjustmentMode&&<div className="diagram-layer-stack-controls">{controls}</div>}
  </aside>;
}
