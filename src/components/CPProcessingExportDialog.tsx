import {useEffect,useMemo,useRef,useState} from 'react';
import {openAppDialog} from './AppDialog';
import {boundedAcrossProcessingSettings,rememberBoundedAcrossAuxiliaryChoice} from '../app/boundedAcross2DCP';
import type {Assignment,Doc,Point} from '../core/types';
import type {CPPathAnalysis,CPPathOptimization,CPPathOptimizerOptions} from '../core/cpPathOptimizer';
import {download,safeName} from '../app/api';
import {processingOptions,PROCESSING_ASSIGNMENTS,PROCESSING_LABELS,PROCESSING_COLORS,type ProcessingSettingDraft} from '../app/cpProcessingSettings';
import {startCPProcessingPreview,type CPProcessingTask,type CPProcessingFiles} from '../app/cpProcessingTask';
import {processingPreviewStatistics} from '../app/cpProcessingPreview';
import CPProcessingPreview from './CPProcessingPreview';
import './cpProcessingExport.css';

const number=(value:number)=>value.toLocaleString('zh-CN',{maximumFractionDigits:3});
const issueText=(issue:unknown):string=>typeof issue==='string'?issue:issue&&typeof issue==='object'&&'message' in issue?String(issue.message):JSON.stringify(issue);
export default function CPProcessingExportDialog({doc,onClose,onExported}:{doc:Doc;onClose:()=>void;onExported?:(message:string)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),job=useRef<CPProcessingTask|null>(null),generation=useRef(0),saveRequest=useRef<AbortController|null>(null);
  const [settings,setSettings]=useState(()=>boundedAcrossProcessingSettings(doc)),[active,setActive]=useState<Assignment>('M'),
    [merge,setMerge]=useState(false),[retain,setRetain]=useState(false),[scheme,setScheme]=useState<CPPathOptimizerOptions['pathMode']>('collinear'),[maxTurns,setMaxTurns]=useState('1'),[maxLength,setMaxLength]=useState(''),[maxSegments,setMaxSegments]=useState(''),
    [plan,setPlan]=useState<CPPathOptimization|null>(null),[files,setFiles]=useState<CPProcessingFiles|null>(null),
    [analysis,setAnalysis]=useState<CPPathAnalysis|null>(null),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),
    [original,setOriginal]=useState(false),[showPlan,setShowPlan]=useState(false),[numbers,setNumbers]=useState(false),[exported,setExported]=useState(false);
  const counts=useMemo(()=>Object.fromEntries(PROCESSING_ASSIGNMENTS.map(a=>[a,doc.segments.filter(s=>s.assignment===a).length])) as Record<Assignment,number>,[doc]);
  const input=useMemo(()=>{
    try {return {options:processingOptions(settings,merge,retain,[0,0],scheme,{maxTurns,maxMergedLength:maxLength,maxMergedSegments:maxSegments}),error:''};
    }catch(cause){return {options:null,error:cause instanceof Error?cause.message:String(cause)};}
  },[settings,merge,retain,scheme,maxTurns,maxLength,maxSegments]);
  const inputKey=JSON.stringify(input.options);
  useEffect(()=>{const restoreFocus=openAppDialog(dialog.current);return()=>{++generation.current;job.current?.cancel();saveRequest.current?.abort();restoreFocus();};},[]);
  useEffect(()=>{++generation.current;job.current?.cancel();job.current=null;setBusy(false);setPlan(null);setFiles(null);setAnalysis(null);setError('');setExported(false);},[inputKey,doc]);
  const invalidate=()=>{++generation.current;job.current?.cancel();job.current=null;setBusy(false);setPlan(null);setFiles(null);setAnalysis(null);setError('');setExported(false);};
  const edit=(field:keyof ProcessingSettingDraft,value:string|boolean)=>{invalidate();setSettings(old=>({...old,[active]:{...old[active],[field]:value}}));};
  const calculate=async()=>{
    if(!input.options)return;invalidate();const token=++generation.current;setBusy(true);
    const task=startCPProcessingPreview({doc,options:input.options});job.current=task;
    const reply=await task.promise;if(token!==generation.current)return;job.current=null;setBusy(false);
    if(reply.status==='ready'){try{processingPreviewStatistics(reply.plan,reply.files.report);}catch(e){setError((e as Error).message);return;}setPlan(reply.plan);setAnalysis(reply.plan.analysis);setFiles(reply.files);setOriginal(false);}
    else {setError(reply.message);if(reply.status==='blocked')setAnalysis(reply.analysis);}
  };
  const cancelCalculation=()=>{invalidate();setError('已取消计算，可修改设置后重新生成预览。');};
  const exportFile=async()=>{
    if(!plan||!files||busy||!input.options||saveRequest.current)return;
    const request=new AbortController();saveRequest.current=request;setSaving(true);setError('');const token=generation.current;
    try{
      const result=await download(files.dxf,safeName(doc.name)+'.加工优化.dxf','application/dxf',{signal:request.signal});
      if(request.signal.aborted||token!==generation.current||result.status==='cancelled')return;
      setExported(result.status==='saved');onExported?.(result.status==='saved'?'优化加工文件保存完成。':'已发起优化加工文件浏览器下载，请确认下载结果。');
    }catch(cause){if(!request.signal.aborted&&token===generation.current)setError('加工文件导出失败：'+(cause instanceof Error?cause.message:String(cause)));}
    finally{if(saveRequest.current===request)saveRequest.current=null;setSaving(false);}
  };
  const exportReport=async()=>{
    if(!plan||!files||busy||saveRequest.current)return;
    const request=new AbortController();saveRequest.current=request;setSaving(true);setError('');const token=generation.current;
    try{
      const result=await download(JSON.stringify({format:'zhezhi-cp-processing-report',version:1,sourceName:doc.name,settings,options:plan.options,
        before:plan.before,after:plan.after,selectedOutput:files.report.format,outputMetrics:files.report,analysis:plan.analysis,groups:plan.groups,paths:plan.paths,readback:files.report,displayedStatistics:processingPreviewStatistics(plan,files.report),
        verification:{serializedReadback:true,plotterSoftwareImport:false,machineTrial:false,physicalAccuracy:'unverified'},warnings:files.warnings},null,2),safeName(doc.name)+'.加工优化.核验.json','application/json',{signal:request.signal});
      if(request.signal.aborted||token!==generation.current||result.status==='cancelled')return;
      onExported?.(result.status==='saved'?'加工核验报告保存完成。':'已发起加工核验报告浏览器下载，请确认下载结果。');
    }catch(cause){if(!request.signal.aborted&&token===generation.current)setError('核验报告导出失败：'+(cause instanceof Error?cause.message:String(cause)));}
    finally{if(saveRequest.current===request)saveRequest.current=null;setSaving(false);}
  };
  const selected=settings[active],problems=analysis?.issues??[],outputReport=files?.report,statistics=plan&&outputReport?processingPreviewStatistics(plan,outputReport):null;
  return <dialog ref={dialog} className="cp-processing-dialog ui-dialog" aria-label="优化加工导出" onCancel={event=>{event.preventDefault();onClose();}}>
    <header><div><span className="cp-processing-kicker">CP · 毫米 / 加工路径</span><h2>优化加工导出</h2></div><button autoFocus aria-label="关闭优化加工导出" onClick={onClose}>×</button></header>
    <div className="cp-processing-layout">
      <aside className="cp-processing-settings">
        <div className="cp-processing-source"><strong title={doc.name}>{doc.name}</strong><span>{doc.segments.length} 条原线段 · 压痕</span></div>
        <table className="cp-processing-groups"><thead><tr><th>参与</th><th>线型 / 原边</th><th>次数</th></tr></thead><tbody>{PROCESSING_ASSIGNMENTS.map(assignment=><tr key={assignment} data-active={active===assignment}>
          <td><input type="checkbox" aria-label={`加工${PROCESSING_LABELS[assignment]}`} checked={settings[assignment].enabled} onChange={event=>{invalidate();if(assignment==='A')rememberBoundedAcrossAuxiliaryChoice(doc,event.target.checked);setSettings(old=>({...old,[assignment]:{...old[assignment],enabled:event.target.checked}}));}}/></td>
          <td><button className="cp-processing-type" aria-pressed={active===assignment} onClick={()=>setActive(assignment)}><i style={{background:PROCESSING_COLORS[assignment]}}/>{PROCESSING_LABELS[assignment]}<small>{counts[assignment]}</small></button></td>

          <td><input type="number" min="1" max="20" step="1" aria-label={`${PROCESSING_LABELS[assignment]}加工次数`} value={settings[assignment].passes} onChange={event=>{invalidate();setSettings(old=>({...old,[assignment]:{...old[assignment],passes:event.target.value}}));}}/></td>
        </tr>)}</tbody></table>
        <fieldset className="cp-processing-details"><legend>{PROCESSING_LABELS[active]} · 加工设置</legend>
          <label>速度 mm/s<input type="number" aria-label={`${PROCESSING_LABELS[active]}速度`} min="0" step="any" placeholder="未指定" value={selected.speed} onChange={event=>edit('speed',event.target.value)}/></label>
          <label>压力 · 设备单位<input type="number" aria-label={`${PROCESSING_LABELS[active]}压力`} min="0" step="any" placeholder="未指定" value={selected.pressure} onChange={event=>edit('pressure',event.target.value)}/></label>
        </fieldset>
        <label className="cp-processing-check"><input type="checkbox" checked={merge} onChange={event=>{invalidate();setMerge(event.target.checked);}}/>我确认：允许合并加工设置完全相同的线型</label>
        <fieldset className="cp-processing-scheme"><legend>优化方案</legend>
          <select aria-label="优化方案" value={scheme} onChange={event=>{invalidate();setScheme(event.target.value as typeof scheme);}}>
            <option value="collinear">共线相连合并</option><option value="continuous">连续路径 · 限制转弯</option><option value="independent">保留原线段</option>
          </select>
          {scheme==='collinear'&&<div className="cp-processing-limits">
            <label>最长 / mm<input aria-label="最大合并长度" type="number" min="0" step="any" placeholder="不限" value={maxLength} onChange={event=>{invalidate();setMaxLength(event.target.value);}}/></label>
            <label>最多原段<input aria-label="最多合并原段数" type="number" min="1" step="1" placeholder="不限" value={maxSegments} onChange={event=>{invalidate();setMaxSegments(event.target.value);}}/></label>
          </div>}
          {scheme==='continuous'&&<label className="cp-processing-turns">每条规划路径最多转弯<input aria-label="最多连续转弯次数" type="number" min="0" step="1" value={maxTurns} onChange={event=>{invalidate();setMaxTurns(event.target.value);}}/></label>}
        </fieldset>
        <label className="cp-processing-check cp-processing-overlap"><input type="checkbox" checked={retain} onChange={event=>{invalidate();setRetain(event.target.checked);}}/>保留重叠来源线，接受重叠区域重复加工</label>

        <table className="cp-processing-statistics" aria-label="优化前后指标"><thead><tr><th>指标</th><th>优化前</th><th>优化后</th></tr></thead><tbody>
          <tr><td>DXF 加工实体 / 条</td><td>{statistics?number(statistics.beforeEntities):'—'}</td><td>{statistics?number(statistics.afterEntities):'—'}</td></tr>
          <tr><td>线段总长 / mm</td><td>{statistics?number(statistics.beforeLength):'—'}</td><td>{statistics?number(statistics.afterLength):'—'}</td></tr>
          <tr><td>路径间距离 / mm</td><td>{statistics?number(statistics.beforeTravel):'—'}</td><td>{statistics?number(statistics.afterTravel):'—'}</td></tr>
        </tbody></table>
        <p className="cp-processing-small">按加工次数累计；优化前为原 LINE 数，优化后为实际实体数。路径间距离按文件顺序估算。</p>
      </aside>
      <section className="cp-processing-canvas">
        <nav aria-label="加工预览显示"><button aria-pressed={!original} disabled={!plan} onClick={()=>setOriginal(false)}>导出线段</button><button aria-pressed={original} onClick={()=>setOriginal(true)}>优化前</button><span/><label><input aria-label="显示规划分组" type="checkbox" checked={showPlan} onChange={event=>setShowPlan(event.target.checked)}/>规划分组</label><label><input type="checkbox" checked={numbers} onChange={event=>setNumbers(event.target.checked)}/>当前预览编号</label></nav>
        <div className="cp-processing-viewport"><CPProcessingPreview doc={doc} plan={plan} original={original} numbers={numbers} groups={showPlan} representation={files?.report.representation}/>{busy&&<div className="cp-processing-busy" role="status">正在优化并重新解析核验…</div>}</div>
        <div className="cp-processing-legend">{PROCESSING_ASSIGNMENTS.filter(a=>counts[a]>0).map(a=><span key={a}><i style={{background:PROCESSING_COLORS[a]}}/>{PROCESSING_LABELS[a]}</span>)}</div>
        <div className="cp-processing-status" aria-live="polite">
          {error||input.error?<p role="alert">{error||input.error}</p>:plan?<p className="cp-processing-ok">✓ 文件几何回读通过；这不代表实机刻印精度已验证。</p>:<p>共线且端点相连才合并；原 CP 和普通导出保留。</p>}
          {problems.slice(0,3).map((issue,i)=><p className="cp-processing-warning" key={i}>{issueText(issue)}</p>)}
          {plan&&<span>{`有效边 ${plan.analysis.included.length} · 明确排除 ${plan.analysis.excluded.length} · 零长 ${plan.analysis.zeroLength.length}；只导出落笔实线。`}</span>}
          {outputReport&&<span>{`规划分组 ${outputReport.plannedPathCount} 组 · 实际导出 ${outputReport.entityCount} 条 ${outputReport.representation==='dxf-polyline'?'POLYLINE':'LINE'} · 单组最多转弯 ${outputReport.maxPlannedTurns} 次`}</span>}
          {problems.length>3&&<span>还有 {problems.length-3} 项，请查看核验报告。</span>}
        </div>
        <p className="cp-processing-small">{scheme==='continuous'?'连续方案使用 R12 POLYLINE，每条路径保留原拐点；是否连续压痕取决于刻字软件。':'共线合并和保留原段使用普通 R12 LINE。'} 不含抬笔、落笔或机器命令；坐标、单位、纸张位置保持不变。</p>
      </section>
    </div>
    <footer><span className="cp-processing-format">压痕 · DXF / {scheme==='continuous'?'R12 POLYLINE':'普通 LINE'}</span><span className="cp-processing-unverified">实机效果：未验证</span><button onClick={onClose}>取消</button>{busy?<button onClick={cancelCalculation}>停止计算</button>:<button disabled={saving||!!input.error} onClick={()=>void calculate()}>生成预览</button>}<button disabled={!files||busy||saving} onClick={()=>void exportReport()}>核验报告</button><button className="primary" disabled={!files||!plan||busy||saving||!!input.error} onClick={()=>void exportFile()}>{saving?'正在保存…':exported?'再次导出':'导出加工文件'}</button></footer>
  </dialog>;
}
