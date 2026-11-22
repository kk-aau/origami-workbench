import DiagramPDFLayoutControls from './DiagramPDFLayoutControls';
import DiagramPDFPageFurnitureControls from './DiagramPDFPageFurnitureControls';
import DiagramPDFPanelEditor from './DiagramPDFPanelEditor';
import {useGalleryPreview,type GalleryPreviewProps} from './DiagramPDFGalleryEditor';
import {diagramExportTransitions} from '../app/diagramExportPanel';
import {diagramPDFMainRouteChoices} from '../app/diagramPDFBranchPanels';
import DiagramExportDecorationControls,{type DiagramDecorationTab} from './DiagramExportDecorationControls';
import {useDiagramPDFRibbonPaint} from './DiagramPDFRibbonPaint';
import DiagramPDFRibbonEditor from './DiagramPDFRibbonEditor';
import {defaultDiagramPDFRibbon,diagramPDFBackgroundSVG,diagramPDFBranchContinuations,diagramPDFRibbonSVG,diagramPDFRibbonTracks,diagramPDFRibbonSaveNodes} from '../app/diagramPDFDecoration';
import {changeDiagramPDFSeamHeight} from '../app/diagramPDFSeams';
import DiagramPDFSeamHandles,{type ChangeSeamHeight} from './DiagramPDFSeamHandles';
import DiagramPDFScrollPreview from './DiagramPDFScrollPreview';
import type {Doc} from '../core/types';
import {selectProjectFile} from '../app/selectProjectFile';
import {startProjectImport,type ProjectImportTask} from '../app/projectImportTask';
import {useEffect,useLayoutEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent,type CSSProperties,type ReactNode} from 'react';
import type {DiagramProject,DiagramExportSettings} from '../app/diagramProject';
import {PDF_PT_PER_MM,DEFAULT_DIAGRAM_SCALE_CHANGE_PERCENT,DIAGRAM_PDF_LAYOUTS,diagramPanelNumber,diagramPDFPanelPlacementKey,diagramPDFPanelSlotInfo,diagramPDFRibbonCaptionRects,planDiagramPDF,type DiagramPDFOptions,type DiagramPDFPlan} from '../app/diagramPDFLayout';
import {prepareDiagramPDFProject,exportPreparedDiagramPDF} from '../app/diagramPDF';
import {DIAGRAM_PREVIEW_TIMEOUT_MS} from '../app/diagramLayerDisplay';
import {diagramPDFPreviewBodySVG} from '../app/diagramPDFPage';
import {createDiagramPDFPreviewPlanner,diagramPDFPreviewGeometry} from '../app/diagramPDFPreviewPlan';
import {previewPageBody,loadPreviewPageBody,retainPreviewPageBodies} from './diagramPDFPreviewBody';
import DiagramPDFGalleryControls from './DiagramPDFGalleryControls';
import DiagramGalleryAlignControls from './DiagramGalleryAlignControls';
import {arrangeDiagramGallery,type GalleryArrangement,type GalleryArrangementAxis} from '../app/diagramPDFGalleryArrange';
import {galleryItems,type DiagramGalleryBox,type DiagramGalleryPlace,type DiagramGalleryPlacement,type DiagramGalleryView} from '../app/diagramPDFGallery';
import {diagramStepImagePanels,diagramStepImagePanelSVG,prepareDiagramImageProject,exportDiagramImagesZIP} from '../app/diagramImageExport';
import {readAdaptiveLineStyle} from '../app/adaptiveLineStyle';
import {downloadBlob} from '../app/api';
import {readDiagramLineDefaults,type DiagramLineDefaults} from '../app/diagramLineStyles';
import './DiagramPDFExport.css';
import DiagramCPExport from './DiagramCPExport';

function parseScalePercent(text:string):number|null {
  const raw=text.trim();
  if(!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw))return null;
  const value=Number(raw);
  return Number.isFinite(value)?value:null;
}

export interface DiagramPDFExportProps {editorDoc?:Doc;project:DiagramProject;onClose:()=>void;onMessage?:(message:string)=>void;lineDefaults?:DiagramLineDefaults;options:DiagramPDFOptions;settings?:DiagramExportSettings;onSettingsChange:(patch:DiagramExportSettings)=>void;onSaveProject?:(asCopy:boolean)=>void}
export default function DiagramPDFExport({editorDoc,project,onClose,onMessage,lineDefaults,options,settings,onSettingsChange,onSaveProject}:DiagramPDFExportProps) {
  const [editingSteps,setEditingSteps]=useState(false),[selectedPanel,setSelectedPanel]=useState('');
  const [cpExport,setCPExport]=useState(false),[enlarged,setEnlarged]=useState(false);
  const [selectedScaleTransition,setSelectedScaleTransition]=useState('');
  const [scalePercentDraft,setScalePercentDraft]=useState<string|null>(null);
  const [coverTarget,setCoverTarget]=useState<'image'|'cp'>('image'),[coverAxis,setCoverAxis]=useState<'x'|'y'>('x');
  const [selectedGallery,setSelectedGallery]=useState<number|null>(null),[galleryBoxes,setGalleryBoxes]=useState<DiagramGalleryBox[]>([]);
  const [selectedGalleryPlace,setSelectedGalleryPlace]=useState<DiagramGalleryPlace>('result');
  const [galleryGroup,setGalleryGroup]=useState<{page:number;place:DiagramGalleryPlace;indices:number[]}|null>(null);
  const [arrangeError,setArrangeError]=useState('');
  const [chosenPanel,setSettingsPanel]=useState<'content'|'layout'|'cover'|'result'|'color'>('cover'),[editingRibbon,setEditingRibbon]=useState(false);
  const [decorationTab,setDecorationTab]=useState<DiagramDecorationTab>('background');
  const [pane,setPane]=useState<'settings'|'preview'>('settings');
  const [spread,setSpread]=useState(true);
  const [page,setPage]=useState(0),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[exportError,setExportError]=useState('');
  const format=settings?.format??'pdf',cpSource=settings?.coverCPSource??'last';
  const settingsPanel=format==='images'&&chosenPanel!=='layout'?'content':format==='pdf'&&chosenPanel==='content'?'cover':chosenPanel;
  const [cpLoading,setCPLoading]=useState(false),[cpError,setCPError]=useState('');
  const cpInput=useRef<HTMLInputElement>(null),cpTask=useRef<ProjectImportTask|null>(null),cpRequest=useRef(0);
  const scalePercent=options.scaleChangePercent??DEFAULT_DIAGRAM_SCALE_CHANGE_PERCENT;
  const invalidScalePercent=options.scaleIndicators&&scalePercentDraft!==null&&parseScalePercent(scalePercentDraft)===null;
  async function loadCoverCP(file:File){
    const request=++cpRequest.current;cpTask.current?.cancel();setCPLoading(true);setCPError('');
    const task=startProjectImport(file,false);cpTask.current=task;
    try{const result=await task.promise;if(!mounted.current||request!==cpRequest.current)return;if(result.kind!=='crease')throw new Error('请选择 CP、FOLD 或折痕工程文件。');onSettingsChange({coverCPSource:'file',pdf:{coverCPDoc:result.doc,coverCPLabel:file.name}});}
    catch(error){if(mounted.current&&request===cpRequest.current)setCPError(error instanceof Error?error.message:'文件读取失败，原封面 CP 已保留。');}
    finally{if(mounted.current&&request===cpRequest.current){setCPLoading(false);cpTask.current=null;}}
  }
  async function chooseCoverCP(){try{const file=await selectProjectFile(cpInput.current);if(file&&mounted.current)await loadCoverCP(file);}catch(error){if(mounted.current)setCPError(error instanceof Error?error.message:'无法打开文件。');}}
  function selectCoverSource(source:string){
    if(source==='file'){void chooseCoverCP();return;}
    if(source==='editor'&&editorDoc)onSettingsChange({coverCPSource:'editor',pdf:{coverCPDoc:editorDoc,coverCPLabel:editorDoc.name}});
    if(source==='last')onSettingsChange({coverCPSource:'last',pdf:{coverCPDoc:undefined,coverCPLabel:undefined}});
    setCPError('');
  }

  const [retry,setRetry]=useState(0),[preparation,setPreparation]=useState<{source:DiagramProject;key:string;project:DiagramProject|null;progress:string;error:string}|null>(null);
  const dialog=useRef<HTMLDivElement>(null),mounted=useRef(true),prepareController=useRef<AbortController|null>(null),exportController=useRef<AbortController|null>(null);
  const palette=useMemo(()=>structuredClone(lineDefaults??project.basicSettings?.lineDefaults??readDiagramLineDefaults()),[lineDefaults,project.basicSettings?.lineDefaults]);
  const previewPlanner=useMemo(createDiagramPDFPreviewPlanner,[]);
  const mainRouteChoices=useMemo(()=>project.branchSteps?.length?diagramPDFMainRouteChoices(project):[],[project.steps,project.branchSteps,project.branchOrder,project.branchLabels]);
  const planned=useMemo(()=>{try{return {plan:previewPlanner(project,options),error:''};}catch(error){return {plan:null,error:error instanceof Error?error.message:'PDF 选项无效。'};}},[previewPlanner,project,options]);
  const lastPlan=useRef<DiagramPDFPlan|null>(null);if(planned.plan)lastPlan.current=planned.plan;
  const geometry=planned.plan&&diagramPDFPreviewGeometry(planned.plan);
  const scaleTransitions=useMemo(()=>geometry?diagramExportTransitions(project,geometry):[],[project,geometry]);
  const scaleTransition=scaleTransitions.find(item=>item.key===selectedScaleTransition)??scaleTransitions[0];
  function selectScaleTransition(key:string){
    setSelectedScaleTransition(key);const transition=scaleTransitions.find(item=>item.key===key);
    if(transition&&planned.plan){const pageIndex=planned.plan.pages.findIndex(page=>page.cells.includes(transition.from));if(pageIndex>=0)setPage(pageIndex);}
  }
  function changeScaleMarker(value:'auto'|'zoom'|'zoomOut'|'none'){
    if(!scaleTransition)return;const overrides={...options.scaleMarkerOverrides};
    if(value==='auto')delete overrides[scaleTransition.key];else overrides[scaleTransition.key]=value;
    update('scaleMarkerOverrides',overrides);
  }
  const imagePanels=useMemo(()=>format==='images'&&planned.plan?diagramStepImagePanels(project,options,planned.plan):[],[format,project,options,planned.plan]);
  const coverGallery=galleryItems(project,options,'cover'),resultGallery=galleryItems(project,options,'result');
  const hasCoverImage=coverGallery.length>0||options.coverImage!=='none';
  const preparationKey=!cpExport&&planned.plan?JSON.stringify([format,planned.plan.selected,format==='pdf'&&options.cover!=='none'?planned.plan.coverStepIndex:null,format==='pdf'?[...(options.cover==='none'?[]:coverGallery),...resultGallery].map(item=>[item.stepId,item.camera]):null]):null;
  const currentPreparation=preparation?.source===project&&preparation.key===preparationKey?preparation:null,preparedProject=currentPreparation?.project??null;
  useEffect(()=>preparedProject?retainPreviewPageBodies(preparedProject):undefined,[preparedProject]);
  const previewCount=format==='images'?imagePanels.length:planned.plan?.pages.length??0,visiblePage=previewCount?Math.min(page,previewCount-1):0;
  const sideBySide=spread&&format==='pdf'&&previewCount>1;
  const firstPage=sideBySide?Math.floor(visiblePage/2)*2:visiblePage;
  const lastPage=sideBySide?Math.min(firstPage+1,previewCount-1):firstPage;
  const ribbonPaint=useDiagramPDFRibbonPaint(!busy&&format==='pdf'&&settingsPanel==='color'&&decorationTab==='paint',project,options,planned.plan,firstPage,lastPage,setPage,patchOptions);
  function toggleSpread(enabled:boolean){
    setSpread(enabled);
  }
  function turnPreview(delta:number){
    setPage(Math.max(0,Math.min(previewCount-1,visiblePage+delta*(sideBySide?2:1))));
  }
  useEffect(()=>{
    if(coverTarget==='image'&&!hasCoverImage&&options.coverCP)setCoverTarget('cp');
    if(coverTarget==='cp'&&!options.coverCP&&hasCoverImage)setCoverTarget('image');
  },[coverTarget,hasCoverImage,options.coverCP]);
  const coverMoveTarget=coverGallery.length?'cp':coverTarget;
  const selectedOffset=(coverMoveTarget==='image'?options.coverImageOffset:options.coverCPOffset)??{x:0,y:0};
  const previewHasCover=visiblePage===0&&options.cover!=='none';
  const previewHasResults=!!planned.plan?.pages[visiblePage]?.resultGallery;
  const galleryPlace=previewHasCover&&previewHasResults
    ?selectedGallery!==null?selectedGalleryPlace:settingsPanel==='result'?'result':'cover'
    :previewHasResults?'result':previewHasCover?'cover':null;
  const firstResultPage=planned.plan?.pages.findIndex(p=>p.resultGallery)??-1;
  const editingCoverImage=galleryPlace==='cover'&&selectedGallery!==null&&options.gallery?.[selectedGallery]?.cover;
  const emptyResult=settingsPanel==='result'&&!!planned.plan&&firstResultPage<0&&!editingCoverImage;
  function selectCover(target:'image'|'cp'){setSelectedGallery(null);setGalleryGroup(null);setCoverTarget(target);setPage(0);}
  function moveCover(target:'image'|'cp',offset:{x:number;y:number}){update(target==='image'?'coverImageOffset':'coverCPOffset',offset);}
  function selectGallery(index:number,place:DiagramGalleryPlace,items=options.gallery,plan=planned.plan){
    if(!items?.[index]?.[place]||!plan)return;
    let pageIndex=0;
    if(place==='result'){
      const resultIndex=galleryItems(project,{...options,gallery:items},place).indexOf(items[index]);
      pageIndex=plan.pages.findIndex(({resultGallery})=>resultGallery&&resultIndex>=resultGallery.start&&resultIndex<resultGallery.start+resultGallery.count);
      if(pageIndex<0)return;
    }
    setSelectedGallery(index);setSelectedGalleryPlace(place);setCoverTarget('image');setPage(pageIndex);
    setGalleryGroup(null);setArrangeError('');
    setEditingRibbon(false);setEditingSteps(false);
  }
  function changeGallery(items:DiagramGalleryView[]|undefined,selection?:number|null,place?:DiagramGalleryPlace){
    update('gallery',items);
    if(selection===undefined)return;
    setGalleryGroup(null);setArrangeError('');
    if(place&&planned.plan&&items&&selection!==null){
      const nextOptions={...options,gallery:items};
      selectGallery(selection,place,items,planDiagramPDF(project,nextOptions));
    }else setSelectedGallery(selection);
  }
  function moveGallery(index:number,place:DiagramGalleryPlace,placement:DiagramGalleryPlacement|undefined){
    if(!options.gallery?.[index])return;
    const items=options.gallery.map((item,i)=>{
      if(i!==index)return item;
      const layout={...item.layout};
      if(placement)layout[place]=placement;else delete layout[place];
      return {...item,layout:Object.keys(layout).length?layout:undefined};
    });
    update('gallery',items);
  }
  function selectedOnPage(place:DiagramGalleryPlace){
    const indices=galleryGroup?.page===visiblePage&&galleryGroup.place===place?galleryGroup.indices:
      selectedGallery!==null&&selectedGalleryPlace===place?[selectedGallery]:[];
    return indices.filter(index=>galleryBoxes.some(box=>box.place===place&&box.index===index));
  }
  function selectGalleryGroup(indices:number[],place:DiagramGalleryPlace){
    if(indices.length)selectGallery(indices[indices.length-1],place);
    else setSelectedGallery(null);
    setGalleryGroup({page:visiblePage,place,indices});setArrangeError('');
  }
  function toggleGallery(index:number,place:DiagramGalleryPlace){
    const indices=selectedOnPage(place);
    selectGalleryGroup(indices.includes(index)?indices.filter(i=>i!==index):[...indices,index],place);
  }
  function arrangeGallery(place:DiagramGalleryPlace,axis:GalleryArrangementAxis,action:GalleryArrangement){
    if(!planned.plan)return;
    try{
      const items=arrangeDiagramGallery(options,planned.plan,visiblePage,project.name,galleryBoxes,place,selectedOnPage(place),axis,action);
      update('gallery',items);setArrangeError('');
    }catch(error){setArrangeError(error instanceof Error?error.message:'无法调整所选成品图。');}
  }
  function galleryAlignControls(place:DiagramGalleryPlace){
    return <DiagramGalleryAlignControls boxes={galleryBoxes} place={place} selected={selectedOnPage(place)}
      onSelect={indices=>selectGalleryGroup(indices,place)} onArrange={(axis,action)=>arrangeGallery(place,axis,action)} error={arrangeError}/>;
  }
  function patchOptions(patch:Partial<DiagramPDFOptions>) {
    const mode=options.layoutMode??'grid',saved=options.branchPagination;
    const editLayout=patch.panelPlacements||patch.ribbon?.paths&&patch.ribbon.paths!==options.ribbon?.paths;
    if(editLayout&&planned.plan?.branchPagination==='lanes'&&saved!=='lanes'&&saved?.[mode]!=='lanes'){
      patch={...patch,branchPagination:{...saved,[mode]:'lanes'}};
    }
    if(Object.entries(patch).some(([key,value])=>options[key as keyof DiagramPDFOptions]!==value))onSettingsChange({pdf:patch});
    setExportError('');
  }
  function update<K extends keyof DiagramPDFOptions>(key:K,value:DiagramPDFOptions[K]) {patchOptions({[key]:value});}
  function ribbonNodes(nodes:import('../core/types').Point[],key:string){
    if(!planned.plan)return;const ribbon=options.ribbon??defaultDiagramPDFRibbon();
    update('ribbon',{...ribbon,paths:{...ribbon.paths,[key]:diagramPDFRibbonSaveNodes(nodes,planned.plan,planned.plan.pages[visiblePage])}});
  }
  function resetRibbon(){
    if(!planned.plan)return;const ribbon=options.ribbon??defaultDiagramPDFRibbon(),paths={...ribbon.paths};
    for(const track of diagramPDFRibbonTracks(options,planned.plan,planned.plan.pages[visiblePage]))delete paths[track.key];
    update('ribbon',{...ribbon,paths});
  }
  useEffect(()=>{if(cpExport)return;const before=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLElement>('h2')?.focus();return ()=>{if(before?.isConnected)before.focus();};},[cpExport]);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;cpRequest.current++;cpTask.current?.cancel();prepareController.current?.abort();exportController.current?.abort();};},[]);
  useEffect(()=>{
    if(preparationKey===null)return;
    const controller=new AbortController();prepareController.current=controller;
    setPreparation({source:project,key:preparationKey,project:null,progress:'正在准备步骤折图…',error:''});
    void (format==='images'?prepareDiagramImageProject:prepareDiagramPDFProject)(project,options,{signal:controller.signal,timeoutMs:retry===0&&format==='pdf'?DIAGRAM_PREVIEW_TIMEOUT_MS:Infinity,onProgress:({completed,total})=>{
      if(!controller.signal.aborted&&mounted.current)setPreparation(old=>old?.source===project&&old.key===preparationKey?{...old,progress:`正在准备步骤折图 ${completed} / ${total}`}:old);
    }}).then(snapshot=>{
      if(!controller.signal.aborted&&mounted.current)setPreparation({source:project,key:preparationKey,project:snapshot,progress:'',error:''});
    }).catch(error=>{
      if(!controller.signal.aborted&&mounted.current)setPreparation({source:project,key:preparationKey,project:null,progress:'',error:error instanceof Error?error.message:'步骤折图准备失败，请重试。'});
    });
    return ()=>controller.abort();
    // Text and page styling do not invalidate the material certificates. The
    // key changes only when the actual panel/cover paper selection changes.
  },[project,preparationKey,retry]);
  function close(){cpRequest.current++;cpTask.current?.cancel();prepareController.current?.abort();exportController.current?.abort();onClose();}
  async function exportFile() {
    if(!planned.plan||!preparedProject||busy||cpLoading||invalidScalePercent||exportController.current)return;setBusy(true);setExportError('');setProgress(`正在生成 0 / ${format==='images'?imagePanels.length+' 张图片':planned.plan.pages.length+' 页'}`);
    const controller=new AbortController();exportController.current=controller;
    const current=()=>mounted.current&&!controller.signal.aborted&&exportController.current===controller;
    try {
      const blob=await (format==='images'?exportDiagramImagesZIP:exportPreparedDiagramPDF)(preparedProject,options,(done,total)=>{if(current())setProgress(`正在生成 ${done} / ${total} ${format==='images'?'张图片':'页'}`);},palette,{signal:controller.signal});
      if(!current())return;
      const name=(options.title.trim()||project.name).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,100)||'折序图解';
      setProgress(format==='images'?'正在保存步骤图片包…':'正在保存 PDF 文件…');
      const result=await downloadBlob(blob,format==='images'?`${name}_步骤图片.zip`:`${name}.pdf`,{signal:controller.signal});
      if(!current())return;
      if(result.status==='cancelled'){setProgress('已取消保存。');return;}
      const description=format==='images'?`${imagePanels.length} 张步骤图片的 ZIP 包`:`${planned.plan.pages.length} 页 PDF 文件`;
      const message=result.status==='saved'?`${description}保存完成。`:`已发起${description}浏览器下载，请确认下载结果。`;
      setProgress(message);onMessage?.(message);
    } catch(error){if(current()){setExportError(error instanceof Error?error.message:'导出失败，请重试。');setProgress('');}} finally {if(current())setBusy(false);if(exportController.current===controller)exportController.current=null;}
  }
  function changeFormat(next:'pdf'|'images') {
    if(next===format)return;
    if(settingsPanel!=='layout')setSettingsPanel(next==='pdf'?'cover':'content');
    onSettingsChange({format:next});setPage(0);setEnlarged(false);setProgress('');setExportError('');
  }
  const settingsTabs=format==='pdf'
    ?[['cover','封面'],['layout','排版'],['result','成品页'],['color','配色']] as const
    :[['content','内容'],['layout','排版']] as const;
  function showSettingsTab(key:typeof settingsPanel){
    setGalleryGroup(null);setArrangeError('');
    setSettingsPanel(key);
    if(key==='result'&&settingsPanel!=='result'){
      setSelectedGallery(null);
      if(firstResultPage>=0&&galleryPlace!=='result')setPage(firstResultPage);
    }
    if(key==='cover'){setPage(0);setSelectedGallery(null);}
    if(key!=='color')setEditingRibbon(false);
    if(key!=='layout')setEditingSteps(false);
  }
  const layoutChoices=DIAGRAM_PDF_LAYOUTS.map(layout=><option key={layout.id} value={layout.id}>{layout.label}</option>);
  const stepRangeFields=<>
    <label>导出步骤<select aria-label="导出步骤" value={options.scope} onChange={e=>update('scope',e.target.value as DiagramPDFOptions['scope'])}>
      <option value="all">{project.branchSteps?.length?'全部分支 · 同页分叉':'全部步骤'}</option>
      {(!!project.branchSteps?.length||options.scope==='route')&&<option value="route">当前路线</option>}
      <option value="current">当前步骤</option><option value="range">{project.branchSteps?.length?'当前路线的指定范围':'指定范围'}</option>
    </select></label>
    {options.scope==='range'&&<>
      <label>起始步骤<input type="number" min={1} max={project.steps.length} value={options.rangeStart} onChange={e=>update('rangeStart',Number(e.target.value))}/></label>
      <label>结束步骤<input type="number" min={1} max={project.steps.length} value={options.rangeEnd} onChange={e=>update('rangeEnd',Number(e.target.value))}/></label>
    </>}
  </>;
  function alignmentControl(key:'titleAlignment'|'stepAlignment',label:string,fallback:'left'|'center'){
    return <div className="diagram-export-alignment"><span>{label}</span><div role="group" aria-label={label}>
      {([['left','靠左'],['center','居中'],['right','靠右']] as const).map(([align,text])=><button type="button" key={align} aria-pressed={(options[key]??fallback)===align} onClick={()=>update(key,align)}>{text}</button>)}
    </div></div>;
  }
  const coverTitleFields=<>
    <label>作品标题<textarea aria-label="作品标题" rows={2} maxLength={120} value={options.title} onChange={e=>update('title',e.target.value)}/></label>
    {alignmentControl('titleAlignment','作品标题对齐','left')}
  </>;
  const summary=planned.plan
    ?format==='images'?`${imagePanels.length} 张 PNG · 300 DPI`:`${options.paper} ${options.orientation==='portrait'?'纵向':'横向'} · ${planned.plan.pages.length} 页 · ${planned.plan.selected.length} 个步骤`
    :'';
  const preparing=!!planned.plan&&!preparedProject&&!currentPreparation?.error;
  function previewSheet(index:number,visiblePages:readonly number[]){
    if(!preparedProject||!planned.plan)return null;
    const active=index===visiblePage;
    return <DiagramPDFPagePreview project={preparedProject} options={options} plan={planned.plan} pageIndex={index} palette={palette} visiblePages={visiblePages}
      selectedGallery={active?selectedGallery:null} selectedGalleryPlace={active?galleryPlace??undefined:undefined}
      gallerySelection={active&&galleryPlace?selectedOnPage(galleryPlace):undefined} onGalleryToggle={toggleGallery}
      onGallerySelect={selectGallery} onGalleryMove={moveGallery} onGalleryBoxes={active?setGalleryBoxes:undefined}
      coverTarget={coverTarget} onCoverSelect={selectCover} onCoverMove={moveCover}
      coverEditable={active&&!busy&&!editingRibbon&&!editingSteps&&!ribbonPaint.painting} editingRibbon={active&&!busy&&editingRibbon} onRibbonChange={ribbonNodes}
      paintOverlay={ribbonPaint.overlay(index)}
      editingSteps={active&&!busy&&editingSteps} selectedPanel={selectedPanel} onPanelSelect={setSelectedPanel}
      onSeamChange={!busy&&!ribbonPaint.painting&&(settingsPanel==='layout'||settingsPanel==='color')?(key,height,side)=>patchOptions({ribbonSeamHeights:changeDiagramPDFSeamHeight(options.ribbonSeamHeights,key,height,side)}):undefined}
      onPanelChange={(key,placement)=>{
        const sheet=planned.plan?.pages[index];
        const cell=sheet?.cells.find(cell=>diagramPDFPanelPlacementKey(preparedProject,cell,options.layoutMode)===key);
        if(sheet&&cell)update('panelPlacements',{...options.panelPlacements,[key]:{...placement,...diagramPDFPanelSlotInfo(sheet,cell)}});
      }}/>;
  }
  if(cpExport)return <DiagramCPExport project={project} editorDoc={editorDoc} settings={settings?.cp} onSettingsChange={cp=>onSettingsChange({cp})} onBack={()=>setCPExport(false)} onClose={close} onMessage={onMessage}/>;
  return <div className="diagram-pdf-backdrop"><div ref={dialog} className="diagram-pdf-dialog ui-dialog diagram-export-workbench" role="dialog" aria-modal="true" aria-labelledby="diagram-pdf-title" data-diagram-pdf-export onKeyDown={event=>{
    event.stopPropagation();
    if(onSaveProject&&!event.defaultPrevented&&!event.nativeEvent.isComposing&&!event.altKey&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){
      event.preventDefault();
      if(!event.repeat)onSaveProject(event.shiftKey);
      return;
    }
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){
      const nodes=[...dialog.current!.querySelectorAll<HTMLElement>('button:enabled,input:enabled,select:enabled,textarea:enabled,summary')].filter(node=>node.tabIndex>=0&&node.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement?.id==='diagram-pdf-title')){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }}>
    <header>
      <h2 id="diagram-pdf-title" tabIndex={-1}>导出折序图解</h2>
      <div className="diagram-export-formats" role="group" aria-label="导出格式">
        <button type="button" disabled={busy} aria-pressed={format==='pdf'} onClick={()=>changeFormat('pdf')}>PDF 图解</button>
        <button type="button" disabled={busy} aria-pressed={format==='images'} onClick={()=>changeFormat('images')}>步骤图片包</button>
        <button type="button" disabled={busy} onClick={()=>setCPExport(true)}>单独导出 CP</button>
      </div>
      <button type="button" aria-label="关闭导出" onClick={close}>×</button>
    </header>
    <div className="diagram-export-panes" role="group" aria-label="查看面板">
      <button type="button" aria-pressed={pane==='settings'} aria-controls="diagram-export-settings" onClick={()=>setPane('settings')}>设置</button>
      <button type="button" aria-pressed={pane==='preview'} aria-controls="diagram-export-preview" onClick={()=>setPane('preview')}>预览</button>
    </div>
    <div className="diagram-pdf-body" data-pane={pane}>
      <fieldset id="diagram-export-settings" className="diagram-pdf-options" aria-label="导出设置" disabled={busy}>
        <div className="diagram-export-settings-tabs" role="tablist" aria-label="导出设置分类">{settingsTabs.map(([key,label],index)=>
          <button type="button" role="tab" key={key} id={'export-tab-'+key} aria-controls={'export-panel-'+key} tabIndex={settingsPanel===key?0:-1} aria-selected={settingsPanel===key} onClick={()=>showSettingsTab(key)} onKeyDown={event=>{
            const count=settingsTabs.length;
            const next=event.key==='Home'?0:event.key==='End'?count-1:event.key==='ArrowRight'?(index+1)%count:event.key==='ArrowLeft'?(index+count-1)%count:-1;
            if(next<0)return;
            event.preventDefault();
            const target=settingsTabs[next][0];showSettingsTab(target);
            dialog.current?.querySelector<HTMLElement>('#export-tab-'+target)?.focus();
          }}>{label}</button>)}</div>
        {format==='images'&&<section role="tabpanel" id="export-panel-content" aria-labelledby="export-tab-content" hidden={settingsPanel!=='content'}>
          <h3>步骤图片包</h3>
          <div className="diagram-export-fields">
            <label>图片包名称<textarea rows={2} maxLength={120} value={options.title} onChange={e=>update('title',e.target.value)}/></label>
            {stepRangeFields}
          </div>
          <p className="diagram-pdf-hint">每步一张 300 DPI PNG，按步骤编号打包成 ZIP。</p>
        </section>}
        <section role="tabpanel" id="export-panel-layout" aria-labelledby="export-tab-layout" hidden={settingsPanel!=='layout'}>
          <h3>{format==='pdf'?'页面排版':'图片尺寸与排版'}</h3>
          {format==='pdf'&&<DiagramPDFPageFurnitureControls options={options} plan={planned.plan??lastPlan.current} pageIndex={visiblePage} onPage={setPage} onChange={patchOptions}/>}
          <div className="diagram-export-fields">
            <label>纸张尺寸<select aria-label="PDF 纸张" value={options.paper} onChange={e=>update('paper',e.target.value as DiagramPDFOptions['paper'])}><option>A4</option><option>A3</option></select></label>
            <label>纸张方向<select aria-label="PDF 方向" value={options.orientation} onChange={e=>update('orientation',e.target.value as DiagramPDFOptions['orientation'])}><option value="portrait">纵向</option><option value="landscape">横向</option></select></label>
            {options.cover==='diagram'&&<label>首页步骤网格<select value={options.introLayout??'3x3'} onChange={e=>update('introLayout',e.target.value as DiagramPDFOptions['layout'])}>{layoutChoices}</select></label>}
            <label>{options.cover==='diagram'?'后续页步骤网格':'步骤网格'}<select aria-label="步骤网格" value={options.layout} onChange={e=>update('layout',e.target.value as DiagramPDFOptions['layout'])}>{layoutChoices}</select></label>
            {format==='pdf'&&<>
              <label>阅读顺序<select aria-label="PDF 阅读顺序" value={options.readingOrder??'rows'} onChange={e=>{const readingOrder=e.target.value as DiagramPDFOptions['readingOrder'];patchOptions({readingOrder,...(readingOrder==='snake'?{ribbon:{...(options.ribbon??defaultDiagramPDFRibbon()),enabled:true}}:{})});}}><option value="rows">顺序阅读</option><option value="snake">蛇形彩带</option></select></label>
              {options.readingOrder!=='snake'&&options.scope==='all'&&mainRouteChoices.length>0&&<>
                <label>阅读主线<select aria-label="顺序阅读主线" value={mainRouteChoices.some(route=>route.stepId===options.sequentialMainStepId)?options.sequentialMainStepId:''} onChange={e=>update('sequentialMainStepId',e.target.value||undefined)}><option value="">自动选择最长链路</option>{mainRouteChoices.map(route=><option key={route.stepId} value={route.stepId}>{route.label}</option>)}</select></label>
                <small style={{gridColumn:'1 / -1'}}>先完整排列所选主线，其余分支按链路长度依次另起一行。步骤连续编号；仅其他分支的起点标明接续来源。</small>
              </>}
              {(options.readingOrder==='snake'||options.scope!=='all'||!project.branchSteps?.length)&&<div className="diagram-export-alignment">
                <span>全篇步骤走向</span>
                <div role="group" aria-label="全篇步骤走向">
                  <button type="button" aria-pressed={(options.snakeDirection??'horizontal')==='horizontal'} onClick={()=>update('snakeDirection','horizontal')}>横向逐行</button>
                  <button type="button" aria-pressed={options.snakeDirection==='vertical'} onClick={()=>update('snakeDirection','vertical')}>纵向逐列</button>
                </div>
              </div>}
              {stepRangeFields}
              {alignmentControl('stepAlignment','步骤文字对齐','center')}
              <div className="diagram-export-alignment"><span>步骤标号位置</span><div role="group" aria-label="步骤标号位置">{([['left','首行标题左侧'],['above','标题正上方']] as const).map(([position,label])=><button type="button" key={position} aria-pressed={(options.stepNumberPosition??'left')===position} onClick={()=>update('stepNumberPosition',position)}>{label}</button>)}</div></div>
            </>}
          </div>
          {format==='pdf'&&(planned.plan??lastPlan.current)&&<DiagramPDFLayoutControls project={project} options={options} plan={(planned.plan??lastPlan.current)!} pageIndex={visiblePage} onPage={setPage} onChange={patchOptions} editing={editingSteps} onEditing={value=>{setEditingSteps(value);setEditingRibbon(false);}} selected={selectedPanel} onSelect={setSelectedPanel}/>}
          {format==='pdf'&&<div className="diagram-export-checks">
              <label className="diagram-pdf-check"><input type="checkbox" checked={options.descriptions} onChange={e=>update('descriptions',e.target.checked)}/>显示步骤说明</label>
          </div>}
          <div className="diagram-export-scale-settings">
            <label className="diagram-pdf-check">
              <input type="checkbox" checked={options.scaleIndicators??false} onChange={e=>{setScalePercentDraft(null);update('scaleIndicators',e.target.checked);}}/>自动标记视图放大或缩小
            </label>
            {options.scaleIndicators&&<>
              <label className="diagram-export-scale-threshold">变化阈值（%）
                <input type="text" inputMode="decimal" aria-describedby="diagram-export-scale-hint" aria-invalid={invalidScalePercent} value={scalePercentDraft??String(scalePercent)}
                  onChange={event=>{
                    const raw=event.currentTarget.value,value=parseScalePercent(raw);
                    setScalePercentDraft(raw);
                    if(value!==null&&value!==scalePercent)update('scaleChangePercent',value);
                  }}
                  onBlur={()=>{if(!invalidScalePercent)setScalePercentDraft(null);}}/>
              </label>
              <p id="diagram-export-scale-hint" className={invalidScalePercent?'diagram-pdf-error':'diagram-pdf-hint'}>
                {invalidScalePercent?'请输入大于或等于 0 的有限百分数。':'相邻两图按较小的比例计算变化幅度。设为 0 时，比例一变就标记。'}
              </p>
            </>}
            <div className="diagram-manual-scale-markers">
              <label>手动调整步骤间标记<select aria-label="缩放标记所属步骤" disabled={!scaleTransition} value={scaleTransition?.key??''} onChange={e=>selectScaleTransition(e.target.value)}>{scaleTransitions.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
              <div role="group" aria-label="手动缩放标记">{([['auto','自动'],['zoom','添加放大'],['zoomOut','添加缩小'],['none','删除标记']] as const).map(([value,label])=><button type="button" key={value} disabled={!scaleTransition} aria-pressed={(scaleTransition?options.scaleMarkerOverrides?.[scaleTransition.key]??'auto':'auto')===value} onClick={()=>changeScaleMarker(value)}>{label}</button>)}</div>
            </div>
          </div>
        </section>
        {format==='pdf'&&<section role="tabpanel" id="export-panel-cover" aria-labelledby="export-tab-cover" hidden={settingsPanel!=='cover'}>
          <h3>作品信息</h3>
          <div className="diagram-export-fields diagram-cover-title-fields">{coverTitleFields}</div>
          {options.cover!=='none'&&<>
            <div className="diagram-export-fields">
              <label>设计者<input maxLength={120} value={options.designer??''} onChange={e=>update('designer',e.target.value)}/></label>
              <label>制图者<input aria-label="作者" maxLength={120} value={options.author} onChange={e=>update('author',e.target.value)}/></label>
            </div>
            <details className="diagram-export-cover">
              <summary><strong>日期、纸张与附注</strong></summary>
              <div className="diagram-export-fields">
                <label>设计日期<input maxLength={40} placeholder="例如 7/2024" value={options.designDate??''} onChange={e=>update('designDate',e.target.value)}/></label>
                <label>制图日期<input maxLength={40} placeholder="例如 12/2024" value={options.diagramDate??''} onChange={e=>update('diagramDate',e.target.value)}/></label>
                <label className="diagram-export-wide">纸张信息<input maxLength={160} value={options.paperInfo} onChange={e=>update('paperInfo',e.target.value)}/></label>
                <label className="diagram-export-wide">首页附注<input maxLength={160} value={options.headerNote??''} onChange={e=>update('headerNote',e.target.value)}/></label>
              </div>
            </details>
          </>}
          <div className="diagram-export-fields diagram-cover-sources">
            <label>首页样式<select aria-label="首面样式" value={options.cover} onChange={e=>update('cover',e.target.value as DiagramPDFOptions['cover'])}><option value="diagram">图文与步骤同页</option><option value="standard">独立标准封面</option><option value="minimal">独立简洁封面</option><option value="none">直接开始步骤</option></select></label>
            {options.cover!=='none'&&<>
              <label>封面主图<select disabled={!!coverGallery.length} value={coverGallery.length?'gallery':options.coverImage} onChange={e=>update('coverImage',e.target.value as DiagramPDFOptions['coverImage'])}>{coverGallery.length>0&&<option value="gallery">已选 {coverGallery.length} 张成品图</option>}<option value="last">最后一步展示图</option><option value="current">当前步骤展示图</option><option value="none">不显示主图</option></select></label>
              <label className="diagram-pdf-check"><input type="checkbox" aria-label="首页展示最终 CP" checked={options.coverCP} onChange={e=>update('coverCP',e.target.checked)}/>首页展示 CP</label>
              {options.coverCP&&<label>封面 CP 来源<select disabled={cpLoading} value={cpSource} onChange={e=>selectCoverSource(e.target.value)}>
                <option value="last">最后状态 CP</option><option value="editor" disabled={!editorDoc&&cpSource!=='editor'}>折痕编辑区 CP</option><option value="file">从文件选择…</option>
              </select></label>}
            </>}
          </div>
          {options.cover!=='none'&&<>
            {options.coverCP&&<>
              <input ref={cpInput} type="file" hidden accept=".cp,.fold,.json,.opx,.ori,.orh" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void loadCoverCP(file);}}/>
              {cpLoading&&<p role="status">正在读取 CP…</p>}
              {cpSource==='file'&&options.coverCPDoc&&<p className="diagram-pdf-hint">{options.coverCPLabel} <button type="button" disabled={cpLoading} onClick={()=>void chooseCoverCP()}>更换文件</button></p>}
              {cpError&&<p role="alert" className="diagram-pdf-error">{cpError}</p>}
            </>}
            {settingsPanel==='cover'&&galleryAlignControls('cover')}
            {(options.coverCP||hasCoverImage&&!coverGallery.length)&&<div className="diagram-cover-position" role="group" aria-label="封面图片位置设置">
              <div className="diagram-cover-position-heading">
                <h4>{options.coverCP&&hasCoverImage&&!coverGallery.length?'图片位置':coverMoveTarget==='cp'?'CP 位置':'成品图位置'}</h4>
                <button type="button" className="diagram-cover-position-reset" aria-label="复位所选图片" onClick={()=>{selectCover(coverMoveTarget);moveCover(coverMoveTarget,{x:0,y:0});}}>复位位置</button>
              </div>
              <div className="diagram-cover-pickers">
                {options.coverCP&&hasCoverImage&&!coverGallery.length&&<div className="diagram-cover-tool-row diagram-export-alignment">
                  <span>对象</span>
                  <div role="group" aria-label="选择封面图片">
                    <button type="button" aria-pressed={coverMoveTarget==='image'} onClick={()=>selectCover('image')}>成品图</button>
                    <button type="button" aria-pressed={coverMoveTarget==='cp'} onClick={()=>selectCover('cp')}>CP</button>
                  </div>
                </div>}
                <div className="diagram-cover-tool-row diagram-export-alignment">
                  <span>方向</span>
                  <div role="group" aria-label="封面图片调整方向">{([['x','水平'],['y','垂直']] as const).map(([axis,label])=><button type="button" key={axis} aria-pressed={coverAxis===axis} onClick={()=>setCoverAxis(axis)}>{label}</button>)}</div>
                </div>
              </div>
              <label className="diagram-cover-position-slider">
                <span>{coverAxis==='x'?'水平位置':'垂直位置'}</span>
                <input type="range" aria-label="封面图片位置" min={Math.min(-100,selectedOffset[coverAxis])} max={Math.max(100,selectedOffset[coverAxis])} step={.5} value={selectedOffset[coverAxis]} onChange={e=>{selectCover(coverMoveTarget);moveCover(coverMoveTarget,{...selectedOffset,[coverAxis]:e.currentTarget.valueAsNumber});}}/>
                <output>{Number(selectedOffset[coverAxis].toFixed(1))} mm</output>
              </label>
              {options.coverCP&&hasCoverImage&&<div className="diagram-cover-tool-row diagram-export-alignment">
                <span>置于上层</span>
                <div role="group" aria-label="封面图片置顶">
                  <button type="button" aria-pressed={(options.coverForeground??'image')==='image'} onClick={()=>update('coverForeground','image')}>成品图</button>
                  <button type="button" aria-pressed={options.coverForeground==='cp'} onClick={()=>update('coverForeground','cp')}>CP</button>
                </div>
              </div>}
            </div>}
          </>}
        </section>}
        {format==='pdf'&&<section role="tabpanel" id="export-panel-result" aria-labelledby="export-tab-result" hidden={settingsPanel!=='result'}>
          <DiagramPDFGalleryControls project={project} items={options.gallery} coverEnabled={options.cover!=='none'} onChange={changeGallery}
            selected={selectedGallery} place={galleryPlace} box={galleryBoxes.find(row=>row.index===selectedGallery&&row.place===galleryPlace)?.box} pageSize={planned.plan??undefined}
            onSelect={selectGallery} onMove={moveGallery} onPreviewResults={()=>{if(firstResultPage>=0){if(galleryPlace!=='result'){setSelectedGallery(null);setPage(firstResultPage);}setPane('preview');}}}>
            {settingsPanel==='result'&&galleryPlace&&galleryAlignControls(galleryPlace)}
          </DiagramPDFGalleryControls>
        </section>}
        {format==='pdf'&&<section role="tabpanel" id="export-panel-color" aria-labelledby="export-tab-color" hidden={settingsPanel!=='color'}>
          <h3>背景与彩带</h3>
          <DiagramExportDecorationControls options={options} onChange={patchOptions} editing={editingRibbon} onEditingChange={setEditingRibbon} onResetNodes={resetRibbon}
            tab={decorationTab} onTabChange={tab=>{setDecorationTab(tab);if(tab!=='ribbon')setEditingRibbon(false);}}>
            {ribbonPaint.controls}
          </DiagramExportDecorationControls>
        </section>}
      </fieldset>
      <section id="diagram-export-preview" className="diagram-pdf-preview" aria-label={format==='images'?'步骤图片预览':'PDF 排版预览'}>
        <div className="diagram-pdf-preview-toolbar">
          <strong>{format==='images'?'图片预览':emptyResult||galleryPlace==='result'?'成品页预览':'排版预览'}</strong>
          {!emptyResult&&<div className="diagram-pdf-preview-nav">
            {format==='pdf'&&<div className="diagram-preview-mode" role="group" aria-label="预览页数">
              <button type="button" disabled={busy} aria-pressed={!sideBySide} onClick={()=>toggleSpread(false)}>单页</button>
              <button type="button" disabled={busy||previewCount<2} aria-pressed={sideBySide} onClick={()=>toggleSpread(true)}>双页</button>
            </div>}
            <button type="button" disabled={!preparedProject||busy} aria-pressed={enlarged} onClick={()=>setEnlarged(!enlarged)}>{enlarged?'适合页面':'放大查看'}</button>
            <button type="button" disabled={!planned.plan||firstPage===0||busy} onClick={()=>turnPreview(-1)} aria-label="预览上一页">←</button>
            <span aria-live="polite">{planned.plan?(sideBySide?`${firstPage+1}–${lastPage+1}`:String(visiblePage+1))+' / '+previewCount:'—'}</span>
            <button type="button" disabled={!planned.plan||lastPage>=previewCount-1||busy} onClick={()=>turnPreview(1)} aria-label="预览下一页">→</button>
          </div>}
        </div>
        <div className={'diagram-pdf-preview-surface'+(enlarged?' is-enlarged':'')+(format==='pdf'?' is-continuous':'')} aria-busy={!emptyResult&&preparing}>
          {!planned.plan?<p role="alert">{planned.error}</p>
            :emptyResult?<p role="status">添加成品视角后，成品图会接在最后一个步骤后，排满后自动换页。</p>
            :currentPreparation?.error?<div>
              <p role="alert" className="diagram-pdf-error">{currentPreparation.error}</p>
              <button type="button" onClick={()=>{setExportError('');setRetry(old=>old+1);}}>重新准备折图（等待求解完成）</button>
            </div>
            :!preparedProject?<p role="status">{currentPreparation?.progress||'正在准备步骤折图…'}</p>
            :format==='images'?<DiagramStepImagePreview project={preparedProject} panel={imagePanels[visiblePage]} palette={palette}/>
            :<DiagramPDFScrollPreview count={previewCount} page={visiblePage} spread={sideBySide} enlarged={enlarged}
              width={planned.plan.width} height={planned.plan.height} busy={busy} onPageChange={setPage} renderPage={previewSheet}/>}
        </div>
      </section>
    </div>
    <footer>
      <div aria-live="polite">{exportError?<span role="alert" className="diagram-pdf-error">{exportError}</span>:progress||(preparing?currentPreparation?.progress:summary)}</div>
      <button type="button" onClick={close}>{busy?'取消导出':'关闭'}</button>
      <button type="button" className="diagram-pdf-primary" disabled={busy||cpLoading||invalidScalePercent||!planned.plan||!preparedProject} onClick={()=>void exportFile()}>{busy?'正在导出…':format==='images'?'导出图片包':'导出 PDF'}</button>
    </footer>
  </div></div>;
}

function DiagramStepImagePreview({project,panel,palette}:{project:DiagramProject;panel:ReturnType<typeof diagramStepImagePanels>[number];palette:DiagramLineDefaults}) {
  const svg=useMemo(()=>diagramStepImagePanelSVG(project,panel,palette,project.basicSettings?.adaptiveLines??readAdaptiveLineStyle()),[project,panel,palette]);
  const viewBox=svg.match(/viewBox="([^"]+)"/)![1],dimensions=viewBox.split(/\s+/).map(Number);
  return <svg className="diagram-pdf-page" viewBox={viewBox} role="img" aria-label={'第 '+diagramPanelNumber(panel)+' 步图片预览'} style={{aspectRatio:dimensions[2]+'/'+dimensions[3],'--diagram-page-ratio':dimensions[2]/dimensions[3]} as CSSProperties} dangerouslySetInnerHTML={{__html:svg.slice(svg.indexOf('>')+1,svg.lastIndexOf('</svg>'))}}/>;
}

/** Pure page composition; the dialog supplies its prepared layer snapshot. */
export function DiagramPDFPagePreview({project,options,plan,pageIndex,palette,visiblePages,coverTarget,onCoverSelect,onCoverMove,coverEditable=false,editingRibbon=false,onRibbonChange,onSeamChange,paintOverlay,editingSteps=false,selectedPanel='',onPanelSelect,onPanelChange,...galleryProps}:GalleryPreviewProps&{
  project:DiagramProject;options:DiagramPDFOptions;plan:DiagramPDFPlan;pageIndex:number;palette:DiagramLineDefaults;
  visiblePages?:readonly number[];
  editingSteps?:boolean;selectedPanel?:string;onPanelSelect?:(key:string)=>void;onPanelChange?:(key:string,placement:{x:number;y:number;scale:number})=>void;
  onSeamChange?:ChangeSeamHeight;
  paintOverlay?:ReactNode;
  coverTarget?:'image'|'cp';onCoverSelect?:(target:'image'|'cp')=>void;onCoverMove?:(target:'image'|'cp',offset:{x:number;y:number})=>void;coverEditable?:boolean;editingRibbon?:boolean;onRibbonChange?:(nodes:import('../core/types').Point[],key:string)=>void;
}) {
  const page=useMemo(()=>previewPageBody(project,options,plan,pageIndex,palette,project.basicSettings?.adaptiveLines??readAdaptiveLineStyle(),visiblePages),[project,options,plan,pageIndex,palette,visiblePages]);
  const [preview,setPreview]=useState<{page:typeof page;svg?:string;error?:string}|null>(null);
  const staticSVG=useMemo(()=>typeof window==='undefined'?diagramPDFPreviewBodySVG(...page.args):undefined,[page]);
  const previousSheet=preview?.page.args;
  const current=preview?.page===page?preview:null;
  const lastBody=previousSheet?.[0]===project&&previousSheet[3]===pageIndex&&previousSheet[2].width===plan.width&&previousSheet[2].height===plan.height?preview?.svg:undefined;
  const svg=page.svg??staticSVG??lastBody;
  const ready=!!(page.svg||staticSVG);
  const markup=useMemo(()=>svg?<g data-preview-page-body="" dangerouslySetInnerHTML={{__html:svg.slice(svg.indexOf('>')+1,svg.lastIndexOf('</svg>'))}}/>:null,[svg]);
  const decoration=useMemo(()=>{
    const sheet=plan.pages[pageIndex],captions=diagramPDFRibbonCaptionRects(project,options,plan,sheet);
    return {
      under:{__html:diagramPDFBackgroundSVG(options,plan,pageIndex)+diagramPDFRibbonSVG(options,plan,sheet,pageIndex,captions)},
      over:{__html:diagramPDFBranchContinuations(options,plan,sheet)}
    };
  },[project,options,plan,pageIndex]);
  // Virtual scrolling can mount neighbours while a node is being dragged.
  // Stable node arrays keep that unrelated render from cancelling the gesture.
  const editableTracks=useMemo(()=>editingRibbon&&options.readingOrder==='snake'&&options.ribbon?.enabled
    ?diagramPDFRibbonTracks(options,plan,plan.pages[pageIndex]):[],[editingRibbon,options,plan,pageIndex]);
  const lastDecoration=useRef(decoration);
  useLayoutEffect(()=>{if(ready)lastDecoration.current=decoration;},[ready,decoration]);
  const visibleDecoration=ready?decoration:lastDecoration.current;
  useEffect(()=>{
    if(page.svg){
      setPreview(old=>old?.page===page?old:{page,svg:page.svg});
      return;
    }
    let active=true;
    void loadPreviewPageBody(page).then(svg=>{
      if(active)setPreview({page,svg});
    }).catch(error=>{
      if(active&&error?.name!=='AbortError')setPreview({page,error:error instanceof Error?error.message:'PDF 页面预览失败。'});
    });
    return ()=>{active=false;};
  },[page]);
  const element=useRef<SVGSVGElement>(null);
  const gallery=useGalleryPreview(element,ready?svg:undefined,plan,ready&&coverEditable,galleryProps);
  const gesture=useRef<{id:number;target:'image'|'cp';start:DOMPoint;inverse:DOMMatrix;offset:{x:number;y:number};last:{x:number;y:number};moved:boolean}|null>(null);
  const [selection,setSelection]=useState<{x:number;y:number;width:number;height:number}|null>(null);
  useEffect(()=>{
    const graphic=element.current?.querySelector<SVGGElement>('[data-diagram-cover-artwork="'+coverTarget+'"]');
    setSelection(coverEditable&&galleryProps.selectedGallery==null&&graphic?{x:Number(graphic.dataset.coverX),y:Number(graphic.dataset.coverY),width:Number(graphic.dataset.coverWidth),height:Number(graphic.dataset.coverHeight)}:null);
  },[svg,coverTarget,coverEditable,galleryProps.selectedGallery]);
  function finish(){
    const current=gesture.current;gesture.current=null;
    if(current){
      element.current?.querySelector('[data-diagram-cover-artwork="'+current.target+'"]')?.removeAttribute('transform');
      element.current?.querySelector('[data-cover-selection]')?.removeAttribute('transform');
    }
    if(current&&element.current?.hasPointerCapture(current.id))element.current.releasePointerCapture(current.id);
  }
  useEffect(()=>()=>{gesture.current=null;},[]);
  function begin(event:ReactPointerEvent<SVGSVGElement>){
    if(!ready||!coverEditable||!onCoverMove||event.button!==0||gesture.current)return;
    const graphic=(event.target as Element).closest<SVGGElement>('[data-diagram-cover-artwork]');
    const target=graphic?.dataset.diagramCoverArtwork;
    if(target!=='image'&&target!=='cp')return;
    const matrix=event.currentTarget.getScreenCTM();if(!matrix)return;
    event.preventDefault();event.stopPropagation();
    const inverse=matrix.inverse(),offset=(target==='image'?options.coverImageOffset:options.coverCPOffset)??{x:0,y:0};
    gesture.current={id:event.pointerId,target,inverse,start:new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse),offset:{...offset},last:{...offset},moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);onCoverSelect?.(target);
  }
  function move(event:ReactPointerEvent<SVGSVGElement>){
    const current=gesture.current;if(!current||current.id!==event.pointerId||!onCoverMove)return;
    event.preventDefault();event.stopPropagation();
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(current.inverse);
    const dx=(point.x-current.start.x)/PDF_PT_PER_MM,dy=(point.y-current.start.y)/PDF_PT_PER_MM;
    if(!current.moved&&Math.hypot(dx,dy)<.25)return;
    current.moved=true;
    current.last={x:Math.max(-1000,Math.min(1000,current.offset.x+dx)),y:Math.max(-1000,Math.min(1000,current.offset.y+dy))};
    const transform=`translate(${(current.last.x-current.offset.x)*PDF_PT_PER_MM} ${(current.last.y-current.offset.y)*PDF_PT_PER_MM})`;
    element.current?.querySelector('[data-diagram-cover-artwork="'+current.target+'"]')?.setAttribute('transform',transform);
    element.current?.querySelector('[data-cover-selection]')?.setAttribute('transform',transform);
  }
  const outline=selection?`<rect data-cover-selection="true" x="${selection.x}" y="${selection.y}" width="${selection.width}" height="${selection.height}" fill="none" stroke="#42705b" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" pointer-events="none"/>`:'';
  if(current?.error)return <p role="alert">{current.error}</p>;
  if(!svg)return <p role="status">正在绘制第 {pageIndex+1} 页…</p>;
  return <svg ref={element} data-pdf-page-index={pageIndex} className={'diagram-pdf-page'+(coverEditable?' diagram-cover-editable':'')} viewBox={`0 0 ${plan.width} ${plan.height}`} role="img" aria-busy={!ready} aria-label={'PDF 第 '+(pageIndex+1)+' 页预览'} style={{aspectRatio:plan.width+'/'+plan.height,'--diagram-page-ratio':plan.width/plan.height,'--diagram-pdf-text-color':options.pageTextColor} as CSSProperties}
    onPointerDown={event=>{if(!gallery.begin(event))begin(event);}} onPointerMove={event=>{if(!gallery.move(event))move(event);}} onPointerUp={event=>{
      if(gallery.finish(event))return;
      const current=gesture.current;if(current?.id!==event.pointerId)return;
      move(event);finish();if(current.moved)onCoverMove?.(current.target,current.last);
    }} onPointerCancel={()=>{gallery.cancel();finish();}} onLostPointerCapture={()=>{gallery.cancel();finish();}}
    onContextMenu={event=>{if(gallery.cancel()||gesture.current){event.preventDefault();finish();}}}
     ><g dangerouslySetInnerHTML={visibleDecoration.under}/>{markup}<g dangerouslySetInnerHTML={visibleDecoration.over}/>{ready&&outline&&<g dangerouslySetInnerHTML={{__html:outline}}/>}
    {gallery.handles}
    {ready&&editingSteps&&onPanelSelect&&onPanelChange&&<DiagramPDFPanelEditor project={project} options={options} plan={plan} pageIndex={pageIndex} selected={selectedPanel} onSelect={onPanelSelect} onChange={onPanelChange}/>}
    {ready&&editingRibbon&&onRibbonChange&&editableTracks.filter(track=>track.nodes.length>=2).map(track=><DiagramPDFRibbonEditor key={track.key} nodes={track.nodes} edgeIndex={track.edgeIndex} bounded={track.bounded} neighbors={track.neighbors} plan={plan} seamPage={plan.pages[pageIndex]} options={options} ribbon={options.ribbon!} captionRects={diagramPDFRibbonCaptionRects(project,options,plan,plan.pages[pageIndex])} onChange={nodes=>onRibbonChange(nodes,track.key)}/>)}
    {ready&&onSeamChange&&<DiagramPDFSeamHandles options={options} plan={plan} pageIndex={pageIndex} onChange={onSeamChange}/>}
    {ready&&paintOverlay}
  </svg>;
}
