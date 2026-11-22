import {useEffect,useMemo,useRef,useState} from 'react';
import {
  defaultDiagramCanvas,updateDiagramAnnotations,updateDiagramCanvas,updateDiagramImages,updateDiagramPoseView,
  updateDiagramPoseViewport,updateDiagramSimulationSurfaceView,updateDiagramStep,type DiagramProject,
} from '../app/diagramProject';
import {type DiagramSymbolKind} from '../app/diagramAnnotations';
import {diagramCalloutCPMarkup} from '../app/diagramCalloutSVG';
import type {DiagramImage} from '../app/diagramImages';
import {defaultCreaseDisplay} from '../app/creaseDisplay';
import {startDiagramGeometry} from '../app/diagramGeometryTask';
import {readDiagramLineDefaults} from '../app/diagramLineStyles';
import {switchDiagramPaperState} from '../app/diagramPaperState';
import {refreshChangedViewDrawings} from '../app/diagramProjectPreparation';
import {applyDiagramSpatialCamera} from '../app/diagramSpatialCameraTransaction';
import {startDiagramSpatialReprojection} from '../app/diagramSpatialTask';
import {diagramProcessFigureZoom} from '../app/diagramStepZoom';
import {defaultModelView} from '../app/modelViewState';
import {normalizeDiagramViewportAngle} from '../app/diagramViewport';
import AppDialog from './AppDialog';
import DiagramDrawingCanvas,{canvasFoldPreview,type DiagramDrawingTool,type DiagramFoldLinkPreviewSegment} from './DiagramDrawingCanvas';
import DiagramSpatialOrbit,{type DiagramSpatialOrbitProps} from './DiagramSpatialOrbit';
import DiagramSimulationSurfaceOrbit from './DiagramSimulationSurfaceOrbit';
import DiagramImageCropDialog from './DiagramImageCropDialog';
import './DiagramProcessFigureEditor.css';

const emptyVertices={group:[],selected:[]};
const arrowTools=[['fold','谷折箭头'],['mountainFold','山折箭头'],['unfold','预折箭头']] as const;

export default function DiagramProcessFigureEditor({initial,parent,host,label,onSave,onClose,onRemove,symbolStyles}:{
  parent:DiagramProject;host:DiagramProject['steps'][number];
  symbolStyles?:import('../app/diagramSymbolStyles').DiagramSymbolStyles;
  initial:DiagramProject;label:string;onSave:(figure:DiagramProject)=>void;onClose:()=>void;onRemove?:()=>void;
}) {
  const [figure,setFigure]=useState(initial),latest=useRef(initial);
  const [title,setTitle]=useState(initial.steps[0].title),[description,setDescription]=useState(initial.steps[0].description);
  const [tool,setTool]=useState<DiagramDrawingTool>('select'),[symbol,setSymbol]=useState<DiagramSymbolKind>('fold');
  const [selected,setSelected]=useState<string[]>([]),[imageId,setImageId]=useState<string|null>(null);
  const [cropTarget,setCropTarget]=useState<DiagramImage|null>(null);
  const [orbit,setOrbit]=useState(false),[projecting,setProjecting]=useState(false),[error,setError]=useState('');
  const [preview,setPreview]=useState<DiagramFoldLinkPreviewSegment[]|undefined>();
  const alive=useRef(true),cameraJob=useRef<{cancel:()=>void}|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;cameraJob.current?.cancel();};},[]);
  const step=figure.steps[0],id=step.id,pose=step.pose,surface=step.simulationSurface,[before,after]=figure.states;
  const cropImage=step.images?.find(item=>item.id===imageId)??(step.images?.length===1?step.images[0]:undefined);
  const settings=figure.basicSettings,canvas=step.canvas??defaultDiagramCanvas(before.doc.paper.width);
  const view=pose?.view??defaultModelView(),showPaper=step.paperVisible!==false;
  const viewKey=JSON.stringify({...view,cameras:undefined});
  const lines=useMemo(()=>settings?.lineDefaults??readDiagramLineDefaults(),[settings?.lineDefaults]);

  useEffect(()=>{
    setPreview(undefined);
    if(!showPaper||!step.foldLink?.enabled||!pose||pose.sourceStateId!==before.id||pose.sourceRevision!==before.revision)return;
    const job=startDiagramGeometry('project',[pose,before.doc,after.doc,before,step.foldLink.precreases]);
    let live=true;
    void job.promise.then(result=>{if(live)setPreview(result.preview.map(canvasFoldPreview));}).catch(cause=>{if(live)setError(String(cause instanceof Error?cause.message:cause));});
    return()=>{live=false;job.cancel();};
  },[showPaper,step.foldLink?.enabled,step.foldLink?.precreases,before,after,pose?.result,pose?.sourceStateId,pose?.sourceRevision,pose?.spatial,pose?.hiddenFaces,pose?.paperDeformation,pose?.displayOrder,viewKey]);

  function edit(change:(current:DiagramProject)=>DiagramProject) {
    try{
      const previous=latest.current,next=refreshChangedViewDrawings(change(previous),previous);
      latest.current=next;setFigure(next);setError('');return true;
    }catch(cause){setError(cause instanceof Error?cause.message:String(cause));return false;}
  }
  function selectTool(){setTool('select');setOrbit(false);}
  function startOrbit(){
    if(!pose?.spatial&&step.paperStates?.spatial&&!edit(current=>switchDiagramPaperState(current,id,'spatial')))return;
    setTool('select');setOrbit(true);
  }
  const applyCamera:DiagramSpatialOrbitProps['onCommit']=async(camera,prepared)=>{
    const snapshot=latest.current.steps[0].pose;if(!snapshot?.spatial)return false;
    const job=prepared??startDiagramSpatialReprojection(snapshot,camera,[snapshot]);cameraJob.current=job;setProjecting(true);
    try{
      const answer=await job.promise;
      return alive.current&&latest.current.steps[0].pose===snapshot&&edit(current=>applyDiagramSpatialCamera(current,id,answer));
    }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:String(cause));return false;}
    finally{if(alive.current)setProjecting(false);cameraJob.current=null;}
  };
  function save(){
    try{onSave(updateDiagramStep(latest.current,id,{title:title.trim(),description}));}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  }
  function remove(){
    try{onRemove?.();}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  }
  function applyCrop(image:DiagramImage){
    edit(current=>{
      const images=current.steps[0].images??[];
      if(images.find(item=>item.id===image.id)!==cropTarget)throw Error('这张图片已发生变化，请重新选择后裁切。');
      return updateDiagramImages(current,id,images.map(item=>item.id===image.id?image:item),showPaper);
    });
    setCropTarget(null);
  }
  return <AppDialog title={'编辑过程图 · '+label} size="large" className="diagram-process-editor" bodyClassName="diagram-process-body" onClose={onClose}
    onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();if(!projecting)save();}}}
    footer={<>{onRemove&&<button className="diagram-process-remove" onClick={remove}>删除过程图</button>}<button onClick={onClose}>取消</button><button className="ui-dialog-primary" disabled={projecting} onClick={save}>保存过程图</button></>}>
    <div className="diagram-process-tools" role="toolbar" aria-label="过程图绘图工具">
      <button aria-pressed={tool==='select'&&!orbit} onClick={selectTool}>选择</button>
      {arrowTools.map(([kind,name])=><button key={kind} aria-pressed={tool==='symbol'&&symbol===kind} onClick={()=>{setOrbit(false);setTool('symbol');setSymbol(kind);}}>{name}</button>)}
      <button disabled={!selected.length} onClick={()=>{edit(current=>updateDiagramAnnotations(current,id,(current.steps[0].annotations??[]).filter(a=>!selected.includes(a.id))));setSelected([]);}}>删除选中</button>
      {!!step.images?.length&&<button type="button" disabled={!cropImage||projecting} title={cropImage?'裁切这张图片':'先在画布选择要裁切的图片'} onClick={()=>{if(cropImage){selectTool();setCropTarget(cropImage);}}}>裁切图片</button>}
      <span className="diagram-process-view-tools">
        <button onClick={()=>edit(current=>updateDiagramCanvas(current,id,{...canvas,drawingRotation:normalizeDiagramViewportAngle((canvas.drawingRotation??0)+90)}))}>旋转 90°</button>
        {showPaper&&pose&&<button onClick={()=>edit(current=>updateDiagramPoseView(current,id,{...view,side:view.side==='back'?'front':'back',cameras:{}}))}>翻面</button>}
        {showPaper&&(surface||pose?.spatial||step.paperStates?.spatial)&&<button aria-pressed={orbit} onClick={()=>orbit?setOrbit(false):startOrbit()}>转动视角</button>}
      </span>
    </div>
    <div className="diagram-model-surface diagram-process-canvas">
      <DiagramDrawingCanvas symbolStyles={symbolStyles??settings?.symbolStyles} pose={pose} simulationSurface={surface} paperPatterns={settings?.paperPatterns} zoomRegion={diagramProcessFigureZoom(parent,host,figure)??undefined} canvas={canvas} gridPaper={before.doc} annotations={step.annotations??[]} callouts={step.callouts}
        calloutCPMarkup={(stateId,units,hideExistingCreases)=>{const cp=figure.states.find(s=>s.id===stateId);return cp?diagramCalloutCPMarkup(cp.doc,defaultCreaseDisplay(),{enabled:settings?.adaptiveLines,units,hideExistingCreases}):'';}}
        images={step.images} paperVisible={showPaper} selectedImageId={imageId??undefined} onSelectImage={setImageId} onImagesChange={images=>edit(current=>updateDiagramImages(current,id,images,showPaper))}
        tool={tool} symbol={symbol} color="#293d35" width={0.7} lineStyle="valley" lineDefaults={lines} adaptiveLineStyle={settings?.adaptiveLines}
        selection={emptyVertices} onSelect={()=>{}} onMove={()=>{}} selectedIds={selected} onSelectedIds={setSelected} onClearSelection={()=>{setSelected([]);setImageId(null);}}
        onSymbolPlaced={selectTool} onCancelSymbolPlacement={selectTool} onQuickSelect={selectTool} active={!orbit&&!cropTarget} disabled={projecting}
        onAnnotationsChange={annotations=>edit(current=>updateDiagramAnnotations(current,id,annotations))}
        onDrawingRotationChange={drawingRotation=>edit(current=>updateDiagramCanvas(current,id,{...canvas,drawingRotation}))}
        onViewChange={next=>{if(pose)edit(current=>updateDiagramPoseViewport(current,id,next.cameras));}}
        foldLinkEnabled={preview!==undefined} foldLinkPreview={preview}
      />
      {orbit&&pose?.spatial&&<DiagramSpatialOrbit interactive pose={pose} drawingRotation={canvas.drawingRotation} onCommit={applyCamera} onExit={()=>setOrbit(false)}/>}
      {orbit&&surface&&<DiagramSimulationSurfaceOrbit surface={surface} patterns={settings?.paperPatterns} drawingRotation={canvas.drawingRotation} onCommit={next=>edit(current=>updateDiagramSimulationSurfaceView(current,id,next))} onExit={()=>setOrbit(false)}/>}
    </div>
    <div className="diagram-process-caption">
      <label>图题<textarea rows={2} value={title} onChange={event=>setTitle(event.target.value)}/></label>
      <label>说明<textarea rows={2} value={description} onChange={event=>setDescription(event.target.value)}/></label>
    </div>
    {error&&<p role="alert">{error}</p>}
    {cropTarget&&<DiagramImageCropDialog image={cropTarget} onApply={applyCrop} onClose={()=>setCropTarget(null)}/>}
  </AppDialog>;
}
