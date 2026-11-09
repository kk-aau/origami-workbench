import {useEffect,useMemo,useRef,useState} from 'react';
import type {Doc} from '../core/types';
import type {DiagramProject} from '../app/diagramProject';
import {completeCreasePatternSVG,cpPrintPageSVG,type CPPrintOptions} from '../app/creasePatternExport';
import {defaultCreaseDisplay} from '../app/creaseDisplay';
import {convertSVGToPDFPage,downloadBlob,safeName} from '../app/api';
import {rasterizeSVG} from '../app/rasterExport';
import {selectProjectFile} from '../app/selectProjectFile';
import {startProjectImport,type ProjectImportTask} from '../app/projectImportTask';

export default function DiagramCPExport({project,editorDoc,onBack,onClose,onMessage}:{project:DiagramProject;editorDoc?:Doc;onBack:()=>void;onClose:()=>void;onMessage?:(text:string)=>void}){
  const [source,setSource]=useState<'before'|'after'|'last'|'editor'|'file'>('after'),[format,setFormat]=useState<'pdf'|'svg'|'png'>('pdf');
  const [print,setPrint]=useState<CPPrintOptions>({paper:'A4',orientation:'portrait'}),[file,setFile]=useState<{doc:Doc;name:string}|null>(null);
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState('');
  const input=useRef<HTMLInputElement>(null),dialog=useRef<HTMLDivElement>(null),task=useRef<ProjectImportTask|null>(null),controller=useRef<AbortController|null>(null),mounted=useRef(true),request=useRef(0);
  const step=project.steps.find(s=>s.id===project.activeStepId)??project.steps[0],index=project.steps.indexOf(step);
  const state=source==='last'?project.states.at(-1):project.states.find(s=>s.id===(source==='before'?step.beforeId:step.afterId));
  const doc=source==='editor'?editorDoc:source==='file'?file?.doc:state?.doc;
  const label=source==='file'?file?.name:source==='editor'?'折痕编辑区':`CP${source==='last'?project.states.length-1:index+(source==='after'?1:0)}`;
  const artwork=useMemo(()=>{try{return {svg:doc?completeCreasePatternSVG(doc,defaultCreaseDisplay()):'',error:''};}catch(e){return {svg:'',error:e instanceof Error?e.message:'CP 图像生成失败。'};}},[doc]);
  const preview=useMemo(()=>artwork.svg?(format==='pdf'?cpPrintPageSVG(artwork.svg,print):artwork.svg):'',[artwork.svg,print,format]);
  const previewBox=preview.match(/\bviewBox="([^"]+)"/)?.[1]??'0 0 1 1',dimensions=previewBox.split(/[\s,]+/).map(Number);
  useEffect(()=>{mounted.current=true;dialog.current?.querySelector<HTMLElement>('select')?.focus();return()=>{mounted.current=false;request.current++;task.current?.cancel();controller.current?.abort();};},[]);
  async function load(file:File){const id=++request.current;task.current?.cancel();setLoading(true);setError('');const pending=startProjectImport(file,false);task.current=pending;try{const result=await pending.promise;if(!mounted.current||request.current!==id)return;if(result.kind!=='crease')throw Error('请选择 CP、FOLD 或折痕工程文件。');setFile({doc:result.doc,name:file.name});setSource('file');setProgress('');}catch(e){if(mounted.current&&request.current===id)setError(e instanceof Error?e.message:'CP 文件读取失败。');}finally{if(mounted.current&&request.current===id){setLoading(false);task.current=null;}}}
  async function choose(){try{const selected=await selectProjectFile(input.current);if(selected&&mounted.current)await load(selected);}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'无法打开文件。');}}
  async function save(){
    if(!artwork.svg||busy||loading||controller.current)return;const current=new AbortController();controller.current=current;setBusy(true);setError('');setProgress('正在生成 '+format.toUpperCase()+'…');
    try{
      const blob=format==='svg'?new Blob([artwork.svg],{type:'image/svg+xml'}):format==='png'?await rasterizeSVG(artwork.svg,'png'):new Blob([new Uint8Array(await convertSVGToPDFPage(preview,current.signal)).buffer],{type:'application/pdf'});
      if(!mounted.current||current.signal.aborted)return;setProgress('正在保存…');
      const result=await downloadBlob(blob,`${safeName(project.name)}_${safeName(label??'CP')}.${format}`,{signal:current.signal});
      if(!mounted.current||current.signal.aborted)return;
      const text=result.status==='cancelled'?'已取消保存。':result.status==='saved'?`${format.toUpperCase()} 折痕图保存完成。`:'已发起折痕图浏览器下载，请确认下载结果。';setProgress(text);onMessage?.(text);
    }catch(e){if(mounted.current&&!current.signal.aborted){setError(e instanceof Error?e.message:'导出失败。');setProgress('');}}
    finally{if(controller.current===current)controller.current=null;if(mounted.current)setBusy(false);}
  }
  return <div className="diagram-pdf-backdrop"><div ref={dialog} className="diagram-pdf-dialog diagram-cp-export-dialog ui-dialog" role="dialog" aria-modal="true" aria-labelledby="diagram-cp-export-title" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='Tab'){const nodes=[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(n=>!n.hidden),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
    <header><h2 id="diagram-cp-export-title">导出折痕图</h2><button aria-label="关闭导出" onClick={onClose}>×</button></header>
    <div className="diagram-pdf-body"><fieldset className="diagram-pdf-options" disabled={busy}>
      <section><h3>CP 来源</h3><label>选择折痕图<select aria-label="导出 CP 来源" value={source} disabled={loading} onChange={e=>{if(e.target.value==='file')void choose();else{setSource(e.target.value as typeof source);setError('');setProgress('');}}}><option value="before">当前步骤 · 操作前 CP{index}</option><option value="after">当前步骤 · 操作后 CP{index+1}</option><option value="last">工程最后状态 CP{project.states.length-1}</option><option value="editor" disabled={!editorDoc}>折痕编辑区 CP</option><option value="file">从文件选择…</option></select></label><button disabled={loading} onClick={()=>void choose()}>{loading?'正在读取…':'选择 CP 文件'}</button><input ref={input} type="file" hidden accept=".cp,.fold,.json,.opx,.ori,.orh" onChange={e=>{const selected=e.target.files?.[0];e.target.value='';if(selected)void load(selected);}}/>{source==='file'&&<p className="diagram-pdf-hint">{file?.name}</p>}</section>
      <section><h3>文件格式</h3><label>输出格式<select aria-label="CP 输出格式" value={format} onChange={e=>{setFormat(e.target.value as typeof format);setProgress('');setError('');}}><option value="pdf">PDF · 完整适配纸张</option><option value="svg">SVG · 矢量图 / 实际尺寸</option><option value="png">PNG · 高清图像</option></select></label><p className="diagram-pdf-hint">{format==='pdf'?'整张 CP 等比适配所选纸张，四周留 10 mm 页边距。':format==='svg'?'保存完整矢量折痕，放大仍清晰；纸张几何保持毫米尺寸。':'最长边 2000 像素，保持原图比例；导出完整 CP，不附加页眉或说明。'}</p></section>
      {format==='pdf'&&<section><h3>打印纸张</h3><div className="diagram-pdf-field-pair"><label>纸张<select aria-label="CP PDF 纸张" value={print.paper} onChange={e=>setPrint({...print,paper:e.target.value as CPPrintOptions['paper']})}><option>A4</option><option>A3</option></select></label><label>方向<select aria-label="CP PDF 方向" value={print.orientation} onChange={e=>setPrint({...print,orientation:e.target.value as CPPrintOptions['orientation']})}><option value="portrait">纵向</option><option value="landscape">横向</option></select></label></div></section>}
    </fieldset><section className="diagram-pdf-preview" aria-label="完整 CP 预览"><div className="diagram-pdf-preview-toolbar"><strong>{label}</strong><span>{format.toUpperCase()} · 完整折痕图</span></div><div className="diagram-pdf-preview-surface">{preview?<svg className="diagram-pdf-page" role="img" aria-label="CP 完整范围预览" viewBox={previewBox} style={{aspectRatio:`${dimensions[2]}/${dimensions[3]}`}} dangerouslySetInnerHTML={{__html:preview.slice(preview.indexOf('>')+1,preview.lastIndexOf('</svg>'))}}/>:<p>请选择可用的 CP。</p>}</div><p className="diagram-pdf-hint">{format==='pdf'?'预览与导出 PDF 使用同一排版。':'预览与导出的完整 CP 范围一致。'}</p></section></div>
    <footer><div aria-live="polite">{error||artwork.error?<span role="alert" className="diagram-pdf-error">{error||artwork.error}</span>:progress||'选择来源和格式后导出。'}</div><button disabled={busy||loading} onClick={onBack}>返回折序导出</button><button onClick={onClose}>{busy?'取消导出':'取消'}</button><button className="diagram-pdf-primary" disabled={busy||loading||!artwork.svg} onClick={()=>void save()}>{busy?'正在导出…':'导出 '+format.toUpperCase()}</button></footer>
  </div></div>;
}
