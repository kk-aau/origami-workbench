import type {Doc} from '../core/types';
import {selectProjectFile} from '../app/selectProjectFile';
import {startProjectImport,type ProjectImportTask} from '../app/projectImportTask';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {DiagramProject} from '../app/diagramProject';
import {DIAGRAM_PDF_LAYOUTS,defaultDiagramPDFOptions,planDiagramPDF,type DiagramPDFOptions,type DiagramPDFPlan} from '../app/diagramPDFLayout';
import {diagramPDFPaperStepIds,prepareDiagramPDFProject,exportDiagramPDF} from '../app/diagramPDF';
import {diagramPDFPageSVG} from '../app/diagramPDFPage';
import {diagramStepImagePanels,diagramStepImageSVG,prepareDiagramImageProject,exportDiagramImagesZIP} from '../app/diagramImageExport';
import {diagramStepZoom} from '../app/diagramStepZoom';
import {readAdaptiveLineStyle} from '../app/adaptiveLineStyle';
import {downloadBlob} from '../app/api';
import {readDiagramLineDefaults,type DiagramLineDefaults} from '../app/diagramLineStyles';
import './DiagramPDFExport.css';
import DiagramCPExport from './DiagramCPExport';

export interface DiagramPDFExportProps {editorDoc?:Doc;project:DiagramProject;onClose:()=>void;onMessage?:(message:string)=>void;lineDefaults?:DiagramLineDefaults;options?:DiagramPDFOptions;onOptionsChange?:(options:DiagramPDFOptions)=>void}
export default function DiagramPDFExport({editorDoc,project,onClose,onMessage,lineDefaults,options:controlledOptions,onOptionsChange}:DiagramPDFExportProps) {
  const [cpExport,setCPExport]=useState(false);
  const [localOptions,setLocalOptions]=useState(()=>defaultDiagramPDFOptions(project)),[format,setFormat]=useState<'pdf'|'images'>('pdf'),[page,setPage]=useState(0),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[exportError,setExportError]=useState('');
  const [cpSource,setCPSource]=useState<'last'|'editor'|'file'>('last'),[fileCP,setFileCP]=useState<{doc:Doc;name:string}|null>(null),[cpLoading,setCPLoading]=useState(false),[cpError,setCPError]=useState('');
  const cpInput=useRef<HTMLInputElement>(null),cpTask=useRef<ProjectImportTask|null>(null),cpRequest=useRef(0);
  const baseOptions=controlledOptions??localOptions;
  const options=useMemo(()=>({...baseOptions,coverCPDoc:cpSource==='editor'?editorDoc:cpSource==='file'?fileCP?.doc:undefined,coverCPLabel:cpSource==='editor'?'CP · 折痕编辑区':cpSource==='file'?'CP · '+fileCP?.name:undefined}),[baseOptions,cpSource,editorDoc,fileCP]);
  async function loadCoverCP(file:File){
    const request=++cpRequest.current;cpTask.current?.cancel();setCPLoading(true);setCPError('');
    const task=startProjectImport(file,false);cpTask.current=task;
    try{const result=await task.promise;if(!mounted.current||request!==cpRequest.current)return;if(result.kind!=='crease')throw new Error('请选择 CP、FOLD 或折痕工程文件。');setFileCP({doc:result.doc,name:file.name});setCPSource('file');}
    catch(error){if(mounted.current&&request===cpRequest.current)setCPError(error instanceof Error?error.message:'文件读取失败，原封面 CP 已保留。');}
    finally{if(mounted.current&&request===cpRequest.current){setCPLoading(false);cpTask.current=null;}}
  }
  async function chooseCoverCP(){try{const file=await selectProjectFile(cpInput.current);if(file&&mounted.current)await loadCoverCP(file);}catch(error){if(mounted.current)setCPError(error instanceof Error?error.message:'无法打开文件。');}}

  const [retry,setRetry]=useState(0),[preparation,setPreparation]=useState<{source:DiagramProject;key:string;project:DiagramProject|null;progress:string;error:string}|null>(null);
  const dialog=useRef<HTMLDivElement>(null),mounted=useRef(true),prepareController=useRef<AbortController|null>(null),exportController=useRef<AbortController|null>(null);
  const palette=useMemo(()=>structuredClone(lineDefaults??project.basicSettings?.lineDefaults??readDiagramLineDefaults()),[lineDefaults,project.basicSettings?.lineDefaults]);
  const planned=useMemo(()=>{try{return {plan:planDiagramPDF(project,options),error:''};}catch(error){return {plan:null,error:error instanceof Error?error.message:'PDF 选项无效。'};}},[project,options]);
  const imagePanels=useMemo(()=>planned.plan?diagramStepImagePanels(project,options):[],[project,options,planned.plan]);
  const preparationKey=!cpExport&&planned.plan?format+JSON.stringify(format==='images'?imagePanels.map(panel=>project.steps[panel.stepIndex]).filter(step=>step.pose&&step.paperVisible!==false).map(step=>step.id):diagramPDFPaperStepIds(project,options)):null;
  const currentPreparation=preparation?.source===project&&preparation.key===preparationKey?preparation:null,preparedProject=currentPreparation?.project??null;
  const previewCount=format==='images'?imagePanels.length:planned.plan?.pages.length??0,visiblePage=previewCount?Math.min(page,previewCount-1):0;
  function update<K extends keyof DiagramPDFOptions>(key:K,value:DiagramPDFOptions[K]) {const next={...baseOptions,[key]:value};setLocalOptions(next);onOptionsChange?.(next);setExportError('');}
  useEffect(()=>{if(cpExport)return;const before=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLElement>('button')?.focus();return ()=>{if(before?.isConnected)before.focus();};},[cpExport]);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;cpRequest.current++;cpTask.current?.cancel();prepareController.current?.abort();exportController.current?.abort();};},[]);
  useEffect(()=>{
    if(preparationKey===null)return;
    const controller=new AbortController();prepareController.current=controller;
    setPreparation({source:project,key:preparationKey,project:null,progress:'正在准备步骤折图…',error:''});
    void (format==='images'?prepareDiagramImageProject:prepareDiagramPDFProject)(project,options,{signal:controller.signal,onProgress:({completed,total})=>{
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
    if(!planned.plan||!preparedProject||busy||cpLoading||exportController.current)return;setBusy(true);setExportError('');setProgress(`正在生成 0 / ${format==='images'?imagePanels.length+' 张图片':planned.plan.pages.length+' 页'}`);
    const controller=new AbortController();exportController.current=controller;
    const current=()=>mounted.current&&!controller.signal.aborted&&exportController.current===controller;
    try {
      const blob=await (format==='images'?exportDiagramImagesZIP:exportDiagramPDF)(preparedProject,options,(done,total)=>{if(current())setProgress(`正在生成 ${done} / ${total} ${format==='images'?'张图片':'页'}`);},palette,{signal:controller.signal});
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
  if(cpExport)return <DiagramCPExport project={project} editorDoc={editorDoc} onBack={()=>setCPExport(false)} onClose={close} onMessage={onMessage}/>;
  return <div className="diagram-pdf-backdrop"><div ref={dialog} className="diagram-pdf-dialog ui-dialog" role="dialog" aria-modal="true" aria-labelledby="diagram-pdf-title" data-diagram-pdf-export onKeyDown={event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    if(event.key==='Tab'){const nodes=[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  }}>
    <header><div><p>折序工程 · {format==='images'?'步骤图片':'PDF'}</p><h2 id="diagram-pdf-title">导出折序图解</h2></div><button type="button" aria-label="关闭导出" onClick={close}>×</button></header>
    <div className="diagram-pdf-body"><fieldset className="diagram-pdf-options" disabled={busy}>
      <section><h3>导出格式</h3><label>文件类型<select aria-label="导出格式" value={format} onChange={event=>{if(event.target.value==='cp'){setCPExport(true);return;}setFormat(event.target.value as 'pdf'|'images');setPage(0);setProgress('');setExportError('');}}><option value="pdf">PDF 图解文档</option><option value="images">只导出步骤图片包（ZIP）</option><option value="cp">单独导出 CP（PDF / SVG / PNG）</option></select></label>{format==='images'&&<p className="diagram-pdf-hint">每步一张 300 DPI PNG，按原步骤编号命名；图片沿用 PDF 步骤图的比例和线宽，不含页眉、编号、说明文字或封面。</p>}</section>
      <section><h3>页面排版</h3><div className="diagram-pdf-field-pair"><label>纸张<select aria-label="PDF 纸张" value={options.paper} onChange={event=>update('paper',event.target.value as DiagramPDFOptions['paper'])}><option value="A4">A4</option><option value="A3">A3</option></select></label><label>方向<select aria-label="PDF 方向" value={options.orientation} onChange={event=>update('orientation',event.target.value as DiagramPDFOptions['orientation'])}><option value="portrait">纵向</option><option value="landscape">横向</option></select></label></div>
        {options.cover==='diagram'&&<label>首页步骤网格<select aria-label="首页步骤网格" value={options.introLayout??'3x3'} onChange={event=>update('introLayout',event.target.value as DiagramPDFOptions['layout'])}>{DIAGRAM_PDF_LAYOUTS.map(layout=><option key={layout.id} value={layout.id}>{layout.label}</option>)}</select></label>}
        <label>{options.cover==='diagram'?'后续页步骤网格':'步骤网格'}<select aria-label="步骤网格" value={options.layout} onChange={event=>update('layout',event.target.value as DiagramPDFOptions['layout'])}>{DIAGRAM_PDF_LAYOUTS.map(layout=><option key={layout.id} value={layout.id}>{layout.label}</option>)}</select></label>
        <label>阅读顺序<select aria-label="PDF 阅读顺序" value={options.readingOrder??'rows'} onChange={event=>update('readingOrder',event.target.value as DiagramPDFOptions['readingOrder'])}><option value="rows">逐行 · 每行从左到右</option><option value="snake">蛇形 · 隔行反向，附阅读箭头</option></select></label>
        <p className="diagram-pdf-hint">{options.readingOrder==='snake'?'每页从左上开始，隔行反向；按编号和间隙箭头阅读。':'按从左到右、从上到下排列；选中的步骤自动分页。'}</p>
        <label>导出步骤<select aria-label="导出步骤" value={options.scope} onChange={event=>update('scope',event.target.value as DiagramPDFOptions['scope'])}><option value="all">全部步骤</option><option value="current">当前步骤</option><option value="range">指定范围</option></select></label>
        {options.scope==='range'&&<div className="diagram-pdf-field-pair"><label>起始步骤<input aria-label="起始步骤" type="number" min={1} max={project.steps.length} value={options.rangeStart} onChange={event=>update('rangeStart',Number(event.target.value))}/></label><label>结束步骤<input aria-label="结束步骤" type="number" min={1} max={project.steps.length} value={options.rangeEnd} onChange={event=>update('rangeEnd',Number(event.target.value))}/></label></div>}
        {format==='pdf'&&<><label className="diagram-pdf-check"><input type="checkbox" checked={options.descriptions} onChange={event=>update('descriptions',event.target.checked)}/>显示步骤说明</label><label className="diagram-pdf-check"><input type="checkbox" checked={options.pageNumbers} onChange={event=>update('pageNumbers',event.target.checked)}/>显示页码</label></>}
      </section>{format==='pdf'&&<section><h3>首页与封面</h3><label>首面样式<select aria-label="首面样式" value={options.cover} onChange={event=>update('cover',event.target.value as DiagramPDFOptions['cover'])}><option value="diagram">图文首页 · 信息与步骤同页</option><option value="standard">独立标准封面</option><option value="minimal">独立简洁封面</option><option value="none">直接开始步骤</option></select></label>
        <label>作品标题<input aria-label="作品标题" maxLength={120} value={options.title} onChange={event=>update('title',event.target.value)}/></label>
        {options.cover!=='none'&&<><label>首页展示图<select aria-label="封面主图" value={options.coverImage} onChange={event=>update('coverImage',event.target.value as DiagramPDFOptions['coverImage'])}><option value="last">最后一步展示图</option><option value="current">当前步骤展示图</option><option value="none">不显示展示图</option></select></label>
          {options.cover==='diagram'&&<div className="diagram-pdf-field-pair"><label>设计者<input aria-label="设计者" maxLength={120} placeholder="可留空" value={options.designer??''} onChange={event=>update('designer',event.target.value)}/></label><label>设计日期<input aria-label="设计日期" maxLength={40} placeholder="例如 7/2024" value={options.designDate??''} onChange={event=>update('designDate',event.target.value)}/></label></div>}
          <div className={options.cover==='diagram'?'diagram-pdf-field-pair':undefined}><label>制图者<input aria-label="作者" maxLength={120} placeholder="可留空" value={options.author} onChange={event=>update('author',event.target.value)}/></label>{options.cover==='diagram'&&<label>制图日期<input aria-label="制图日期" maxLength={40} placeholder="例如 12/2024" value={options.diagramDate??''} onChange={event=>update('diagramDate',event.target.value)}/></label>}</div>
          <label>纸张信息<input aria-label="纸张信息" maxLength={160} value={options.paperInfo} onChange={event=>update('paperInfo',event.target.value)}/></label>
          {options.cover==='diagram'&&<label>首页附注<input aria-label="首页附注" maxLength={160} placeholder="可填写来源、教学视频等信息" value={options.headerNote??''} onChange={event=>update('headerNote',event.target.value)}/></label>}
          <label className="diagram-pdf-check"><input type="checkbox" aria-label="首页展示最终 CP" checked={options.coverCP} onChange={event=>update('coverCP',event.target.checked)}/>首页展示 CP</label>
          {options.coverCP&&<><label>封面 CP 来源<select aria-label="封面 CP 来源" disabled={busy||cpLoading} value={cpSource} onChange={e=>{if(e.target.value==='file'){void chooseCoverCP();}else setCPSource(e.target.value as 'last'|'editor');}}><option value="last">最后状态 CP</option><option value="editor" disabled={!editorDoc}>折痕编辑区 CP</option><option value="file">从文件选择…</option></select></label><button disabled={busy||cpLoading} onClick={()=>void chooseCoverCP()}>{cpLoading?'正在读取 CP…':'选择 CP 文件'}</button><input ref={cpInput} type="file" hidden accept=".cp,.fold,.json,.opx,.ori,.orh" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void loadCoverCP(file);}}/>{cpSource==='file'&&fileCP&&<p>{fileCP.name}</p>}{cpError&&<p role="alert">{cpError}</p>}</>}
</>}
      </section>}
    </fieldset><section className="diagram-pdf-preview" aria-label={format==='images'?'步骤图片预览':'PDF 排版预览'}><div className="diagram-pdf-preview-toolbar"><strong>{format==='images'?'步骤图片预览':'排版预览'}</strong><span>{planned.plan?format==='images'?`${imagePanels.length} 张 PNG · 300 DPI`:`${planned.plan.pages.length} 页 · ${planned.plan.selected.length} 个步骤`:''}</span></div>
      <div className="diagram-pdf-preview-surface" aria-busy={!!planned.plan&&!preparedProject&&!currentPreparation?.error}>{planned.plan?preparedProject?format==='images'?<DiagramStepImagePreview project={preparedProject} panel={imagePanels[visiblePage]} palette={palette}/>:<DiagramPDFPagePreview project={preparedProject} options={options} plan={planned.plan} pageIndex={visiblePage} palette={palette}/>:currentPreparation?.error?<div><p role="alert" className="diagram-pdf-error">{currentPreparation.error}</p><button type="button" onClick={()=>{setExportError('');setRetry(old=>old+1);}}>重新准备折图</button></div>:<p role="status">{currentPreparation?.progress||'正在准备步骤折图…'}</p>:<p role="alert">{planned.error}</p>}</div>
      <div className="diagram-pdf-preview-nav"><button type="button" disabled={!planned.plan||visiblePage===0||busy} onClick={()=>setPage(visiblePage-1)} aria-label="预览上一页">←</button><span>{planned.plan?`${visiblePage+1} / ${previewCount}`:'-'}</span><button type="button" disabled={!planned.plan||visiblePage>=previewCount-1||busy} onClick={()=>setPage(visiblePage+1)} aria-label="预览下一页">→</button></div>
      <p className="diagram-pdf-hint">{format==='images'?'压缩包中仅包含所选步骤的图像文件。':'长说明自动续页；图片和折图按当前显示状态输出。'}</p>
    </section></div>
    <footer><div aria-live="polite">{exportError?<span role="alert" className="diagram-pdf-error">{exportError}</span>:progress||(!preparedProject&&planned.plan&&!currentPreparation?.error?currentPreparation?.progress||'正在准备步骤折图…':format==='images'?'预览确认后，导出步骤图片包。':'预览确认后，导出 PDF 文件。')}</div><button type="button" onClick={close}>{busy?'取消导出':'取消'}</button><button type="button" className="diagram-pdf-primary" disabled={busy||cpLoading||!planned.plan||!preparedProject} onClick={()=>void exportFile()}>{busy?'正在导出…':format==='images'?'导出图片包':'导出 PDF'}</button></footer>
  </div></div>;
}

function DiagramStepImagePreview({project,panel,palette}:{project:DiagramProject;panel:ReturnType<typeof diagramStepImagePanels>[number];palette:DiagramLineDefaults}) {
  const svg=useMemo(()=>{const step=project.steps[panel.stepIndex];return diagramStepImageSVG(step,project.states,panel.size,palette,project.basicSettings?.adaptiveLines??readAdaptiveLineStyle(),diagramStepZoom(project,step.id)?.region);},[project,panel,palette]);
  return <svg className="diagram-pdf-page" viewBox={`0 0 ${panel.size.width} ${panel.size.height}`} role="img" aria-label={'第 '+(panel.stepIndex+1)+' 步图片预览'} style={{aspectRatio:panel.size.width+'/'+panel.size.height}} dangerouslySetInnerHTML={{__html:svg.slice(svg.indexOf('>')+1,svg.lastIndexOf('</svg>'))}}/>;
}

/** Pure page composition; the dialog supplies its prepared layer snapshot. */
export function DiagramPDFPagePreview({project,options,plan,pageIndex,palette}:{project:DiagramProject;options:DiagramPDFOptions;plan:DiagramPDFPlan;pageIndex:number;palette:DiagramLineDefaults}) {
  const svg=useMemo(()=>diagramPDFPageSVG(project,options,plan,pageIndex,palette,project.basicSettings?.adaptiveLines??readAdaptiveLineStyle()),[project,options,plan,pageIndex,palette]);
  return <svg className="diagram-pdf-page" viewBox={`0 0 ${plan.width} ${plan.height}`} role="img" aria-label={'PDF 第 '+(pageIndex+1)+' 页预览'} style={{aspectRatio:plan.width+'/'+plan.height}} dangerouslySetInnerHTML={{__html:svg.slice(svg.indexOf('>')+1,svg.lastIndexOf('</svg>'))}}/>;
}
