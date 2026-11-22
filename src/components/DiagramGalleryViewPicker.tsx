import {useEffect,useMemo,useRef,useState} from 'react';
import {materialFaceInside} from '../core/materialRings';
import {buildDiagramPoseFold} from '../app/diagramFoldGeometry';
import {captureCustomGalleryView,captureGalleryView,type DiagramGalleryView} from '../app/diagramPDFGallery';
import type {DiagramPose,DiagramStep} from '../app/diagramProject';
import type {DiagramSpatialPose} from '../app/diagramSpatialPose';
import type {DiagramSimulationSurface} from '../app/diagramSimulationSurface';
import {diagramSimulationSurfaceOrbitCamera,diagramSimulationSurfaceViewFromCamera} from '../app/diagramSimulationSurfaceCamera';
import {renderDiagramSimulationSurface} from '../app/diagramSimulationSurfaceRender';
import {drawingSVG} from '../app/diagramDrawing';
import {defaultModelView} from '../app/modelViewState';
import DiagramFixedViewPicker,{DiagramViewSphereDialog} from './DiagramFixedViewPicker';

type Props={step:DiagramStep;initialView?:DiagramGalleryView;onClose:()=>void;onApply:(view:DiagramGalleryView)=>void};
type Camera=DiagramSpatialPose['camera'];
const worldFrame=[1,0,0,0,1,0,0,0,1];

function referenceFace(step:DiagramStep,pose:DiagramPose){
  const anchor=step.foldLink?.enabled&&step.foldLink.fixed;
  if(anchor){
    const {graph}=buildDiagramPoseFold(pose);
    const face=graph?.faces_vertices?.findIndex((_,id)=>materialFaceInside(graph,id,anchor.point))??-1;
    if(face>=0&&pose.spatial?.faceTransforms[face])return {face,fixedMatrix:anchor.matrix};
  }
  return {face:pose.result.geometry.startingFace??0};
}

export default function DiagramGalleryViewPicker({step,initialView,onClose,onApply}:Props){
  const source=useMemo(()=>initialView??captureGalleryView(step,'saved'),[initialView,step]);
  const fixed=useMemo(()=>step.pose?.spatial&&!step.pose.paperDeformation?.nodes.length&&!step.simulationSurface?referenceFace(step,step.pose):null,[step]);
  const surface=step.simulationSurface;
  const simulationCamera=useMemo(()=>surface?diagramSimulationSurfaceOrbitCamera(source.simulationView??surface.pose.view):undefined,[surface,source]);
  const applyCamera=async(camera:Camera)=>{onApply(captureCustomGalleryView(step,camera,source));return true;};
  if(surface&&simulationCamera){
    const rotation=source.drawingRotation+(surface.displayRotation??0);
    return <DiagramViewSphereDialog title="成品视角" referenceLabel="模拟曲面" initialCamera={simulationCamera} camera={simulationCamera} reference={worldFrame} back={false} drawingRotation={rotation}
      onClose={onClose} onApply={applyCamera} renderModel={(_,camera)=><SimulationSphereModel surface={surface} source={source} camera={camera}/>}/>;
  }
  if(step.pose?.spatial&&!step.pose.paperDeformation?.nodes.length&&fixed){
    return <DiagramFixedViewPicker title="成品视角" pose={step.pose} {...fixed} initialCamera={source.camera??step.pose.spatial.camera}
      viewSide={source.side} drawingRotation={source.rotation+source.drawingRotation} onClose={onClose} onApply={applyCamera}/>;
  }
  return <FlatViewPicker step={step} initialView={source} onClose={onClose} onApply={onApply}/>;
}

function SimulationSphereModel({surface,source,camera}:{surface:DiagramSimulationSurface;source:DiagramGalleryView;camera:Camera}){
  const artwork=useMemo(()=>{
    const view=diagramSimulationSurfaceViewFromCamera(source.simulationView??surface.pose.view,camera);
    return renderDiagramSimulationSurface({...surface,pose:{...surface.pose,view},displayRotation:((surface.displayRotation??0)+source.drawingRotation)%360},{resolution:256});
  },[surface,source,camera]);
  const {x,y,width,height}=artwork.bounds;
  return <svg className="fixed-view-surface" aria-label="球心的折纸作品" viewBox={`${x} ${y} ${width} ${height}`} dangerouslySetInnerHTML={{__html:artwork.markup}}/>;
}

function FlatViewPicker({step,initialView,onClose,onApply}:Props){
  const dialog=useRef<HTMLDialogElement>(null);
  const [side,setSide]=useState(initialView?.side??step.pose?.view?.side??'front');
  const current=useMemo(()=>{
    const saved=captureGalleryView(step,'saved');
    const view=side===saved.side?saved:captureGalleryView(step,'opposite');
    return initialView?{...view,rotation:initialView.rotation,drawingRotation:initialView.drawingRotation}:view;
  },[step,side,initialView]);
  const preview=useMemo(()=>{
    if(!step.pose)return '';
    const pose={...step.pose,view:{...(step.pose.view??defaultModelView()),side,rotation:current.rotation,cameras:{}}};
    const svg=drawingSVG(pose,[],'','',undefined,[],true,undefined,[],undefined,{fitArtwork:'tight'},undefined,current.drawingRotation);
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  },[step,side,current]);
  useEffect(()=>{const el=dialog.current!;el.showModal();return()=>el.close();},[]);
  return <dialog ref={dialog} className="diagram-fixed-view" aria-label="成品视角" onKeyDown={event=>event.stopPropagation()} onCancel={event=>{event.preventDefault();onClose();}}>
    <header><h2>成品视角</h2><span>平面折图</span><button type="button" aria-label="关闭成品视角" onClick={onClose}>×</button></header>
    <div className="fixed-view-flat-preview">{preview&&<img alt="所选纸面预览" src={preview}/>}</div>
    <footer><div className="fixed-view-flat-sides" role="group" aria-label="纸面朝向">{(['front','back'] as const).map(value=><button type="button" aria-pressed={side===value} key={value} onClick={()=>setSide(value)}>{value==='front'?'正面':'背面'}</button>)}</div>
      <button type="button" className="diagram-primary" onClick={()=>{onApply(current);onClose();}}>应用视角</button></footer>
  </dialog>;
}
