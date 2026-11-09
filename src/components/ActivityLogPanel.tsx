import {useEffect,useRef,useState} from 'react';
import {api,download,safeName} from '../app/api';
import {TOOL_NAMES,type Tool} from '../app/tools';
import {flushActivityLog,recordActivity} from '../app/activityLog';
import AppDialog from './AppDialog';
import './ActivityLogPanel.css';

export interface ActivityLogEntry {
  id:string;timestamp:string;level:string;action:string;details?:Record<string,unknown>;
}
interface ActivityLogFeed {appVersion:string;entries:ActivityLogEntry[];truncated?:boolean;notes?:string|string[]}
interface ActivityLogExport extends ActivityLogFeed {format:'zhezhi-activity-log';version:1;generatedAt:string}
export interface ActivityLogPanelProps {onClose:()=>void;onMessage?:(message:string)=>void}

const ACTION_LABELS:Record<string,string>={
  'document.import.start':'开始导入文件','document.import.success':'导入完成','document.import.cancel':'取消导入','document.import.error':'导入失败',
  'document.save.start':'开始保存工程','document.save.success':'保存完成','document.save.cancel':'取消保存','document.save.error':'保存失败',
  'document.new':'新建工程','document.open':'打开工程','edit.commit':'修改绘图','edit.undo':'撤销修改','edit.redo':'重做修改',
  'workspace.switch':'切换工作区','tool.select':'选择工具','runtime.error':'运行错误','runtime.unhandledrejection':'后台任务异常',
  'app.start':'应用启动','server.start':'本地服务启动','service.start':'本地服务启动',
  'activity.view':'查看工作日志','activity.export':'导出工作日志','api.failure':'本地操作失败',
  'diagram.save.start':'开始保存折序','diagram.save.success':'折序保存完成','diagram.save.cancel':'取消保存折序','diagram.save.error':'折序保存失败',
  'diagram.open.start':'开始打开折序','diagram.open.success':'折序打开完成','diagram.open.cancel':'取消打开折序','diagram.open.error':'折序打开失败',
  'diagram.new.start':'开始新建折序','diagram.new.success':'折序新建完成','diagram.new.cancel':'取消新建折序','diagram.new.error':'折序新建失败',
  'diagram.edit':'修改折序绘图','diagram.undo':'撤销折序修改','diagram.redo':'重做折序修改',
  'desktop.confirm.fallback':'使用备用确认窗口','desktop.unresponsive':'应用暂未响应',
  'desktop.close.wait':'等待应用关闭','desktop.close.force':'强制关闭应用','desktop.close.normal':'正常关闭应用','desktop.renderer.gone':'应用窗口异常退出',
};
const LEVEL_LABELS:Record<string,string>={info:'信息',warn:'警告',warning:'警告',error:'错误',success:'成功',debug:'调试'};
const WORKSPACE_LABELS:Record<string,string>={edit:'折痕编辑',tess:'镶嵌设计',sim:'三维模拟',diagram:'折序绘图'};
const RESULT_LABELS:Record<string,string>={accepted:'已确认',cancelled:'已取消',failed:'失败',unavailable:'不可用',confirmed:'已确认'};
const brief=(value:unknown,limit=160)=>typeof value==='string'?value.trim().slice(0,limit)+(value.trim().length>limit?'…':''):typeof value==='number'&&Number.isFinite(value)?String(value):'';
const label=(labels:Record<string,string>,key:string)=>Object.hasOwn(labels,key)?labels[key]:key;
export const activityLogActionLabel=(action:string)=>label(ACTION_LABELS,action);

/** Show useful scalar diagnostics only; arbitrary objects never become JSON rows. */
export function activityLogDetails(details:ActivityLogEntry['details']):string {
  if(!details||typeof details!=='object'||Array.isArray(details))return '';
  const items:string[]=[];
  const reason=brief(details.reason)||brief(details.message),file=brief(details.fileName,100);
  if(reason)items.push(reason);
  if(file)items.push(`文件：${file}`);
  if(details.message!==details.reason&&reason&&typeof details.message==='string'&&typeof details.reason==='string'){
    const message=brief(details.message);if(message&&!items.includes(message))items.push(message);
  }
  const tool=brief(details.tool,60),workspace=brief(details.workspace,60),segments=brief(details.segments),format=brief(details.format,20),result=brief(details.result,100);
  if(tool)items.push(`工具：${Object.hasOwn(TOOL_NAMES,tool)?TOOL_NAMES[tool as Tool]:tool}`);
  if(workspace)items.push(`工作区：${label(WORKSPACE_LABELS,workspace)}`);
  if(segments)items.push(`线段：${segments} 条`);
  if(format)items.push(`格式：${format.toUpperCase()}`);
  if(result)items.push(`结果：${label(RESULT_LABELS,result)}`);
  const text=items.join('；');return text.length>420?text.slice(0,420)+'…':text;
}

const entryResult=(entry:ActivityLogEntry)=>activityLogDetails(entry.details)||(entry.action.endsWith('.start')?'已开始':entry.action.endsWith('.success')?'已完成':entry.action.endsWith('.cancel')?'已取消':entry.level==='error'||entry.action.endsWith('.error')?'未提供错误详情':'暂无补充信息');
const timestamp=(value:string)=>{
  const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date):value;
};
const errorText=(cause:unknown)=>cause instanceof Error?cause.message:'日志操作未完成，请重试。';

export default function ActivityLogPanel({onClose,onMessage}:ActivityLogPanelProps) {
  const [feed,setFeed]=useState<ActivityLogFeed|null>(null),[loading,setLoading]=useState(true),[exporting,setExporting]=useState(false);
  const [readError,setReadError]=useState(''),[exportError,setExportError]=useState(''),[notice,setNotice]=useState('');
  const [pendingWarning,setPendingWarning]=useState(false),viewRecorded=useRef(false);
  const readRequest=useRef<AbortController|null>(null),exportRequest=useRef<AbortController|null>(null);
  async function refresh(){
    readRequest.current?.abort();const request=new AbortController();readRequest.current=request;
    setLoading(true);setReadError('');setNotice('');
    try{
      const flushed=await flushActivityLog();if(request.signal.aborted)return;setPendingWarning(!flushed);
      const value=await api<ActivityLogFeed>('activity?limit=100',undefined,AbortSignal.any([request.signal,AbortSignal.timeout(10000)]));
      if(!value||!Array.isArray(value.entries)||value.entries.some(entry=>!entry||typeof entry.id!=='string'||typeof entry.timestamp!=='string'||typeof entry.action!=='string'||typeof entry.level!=='string'))throw Error('日志内容格式异常，请重试读取。');
      if(!request.signal.aborted)setFeed(value);
    }catch(cause){if(!request.signal.aborted)setReadError(errorText(cause));}
    finally{if(!request.signal.aborted)setLoading(false);}
  }
  async function exportLog(){
    if(exportRequest.current)return;const request=new AbortController();exportRequest.current=request;
    setExporting(true);setExportError('');setNotice('');
    try{
      recordActivity('activity.export',{stage:'start'});
      const flushed=await flushActivityLog();if(request.signal.aborted)return;setPendingWarning(!flushed);
      const value=await api<ActivityLogExport>('activity/export',undefined,AbortSignal.any([request.signal,AbortSignal.timeout(20000)]));
      if(request.signal.aborted)return;
      if(!value||value.format!=='zhezhi-activity-log'||value.version!==1||!Array.isArray(value.entries))throw Error('日志导出内容格式异常，请重试导出。');
      const stamp=typeof value.generatedAt==='string'?value.generatedAt:new Date().toISOString();
      const result=await download(JSON.stringify(value,null,2),safeName(`折纸工坊-工作日志-${stamp}`)+'.json','application/json',{signal:request.signal});
      if(request.signal.aborted)return;
      if(result.status==='cancelled'){setNotice('已取消导出日志。');return;}
      const message=result.status==='saved'?'日志文件保存完成。':'已发起日志浏览器下载，请确认下载结果。';setNotice(message);onMessage?.(message);
    }catch(cause){if(!request.signal.aborted)setExportError(errorText(cause));}
    finally{if(!request.signal.aborted)setExporting(false);if(exportRequest.current===request)exportRequest.current=null;}
  }
  useEffect(()=>{if(!viewRecorded.current){viewRecorded.current=true;recordActivity('activity.view');}void refresh();return()=>{readRequest.current?.abort();exportRequest.current?.abort();};},[]);
  const entries=feed?.entries.slice(-100).reverse()??[],busy=loading||exporting;
  return <AppDialog title="工作日志" onClose={onClose} size="large" className="activity-log-panel" bodyClassName="activity-log-body" busy={busy}
    footer={<><span>{feed?.appVersion?`应用版本 ${feed.appVersion}`:'版本待读取'}</span><button type="button" disabled={busy} onClick={()=>void refresh()}>刷新</button><button type="button" className="primary" disabled={busy} onClick={()=>void exportLog()}>{exporting?'正在准备日志…':'导出日志'}</button></>}>
    <p className="activity-log-introduction">日志保存在本机，用于回看操作和排查问题。这里显示最近 100 条；导出可下载本机当前保留的日志。</p>
    {pendingWarning&&<div className="activity-log-pending" role="status"><span>部分近期操作尚未写入，可重试。</span><button className="ui-button" type="button" disabled={busy} onClick={()=>void refresh()}>重试写入</button></div>}
    {readError&&<div className="activity-log-error" role="alert"><span>读取失败：{readError}</span><button className="ui-button" type="button" disabled={busy} onClick={()=>void refresh()}>重试读取</button></div>}
    {exportError&&<div className="activity-log-error" role="alert"><span>导出失败：{exportError}</span><button className="ui-button" type="button" disabled={busy} onClick={()=>void exportLog()}>重试导出</button></div>}
    {notice&&<p className="activity-log-notice" role="status">{notice}</p>}
    <section className="activity-log-records" aria-label="最近工作日志" aria-busy={loading}>
      <div className="activity-log-heading"><h3>最近工作记录</h3><span>{loading?'正在读取…':`${entries.length} 条 · 从新到旧`}</span></div>
      {loading&&!feed?<p className="activity-log-empty" role="status">正在读取本机工作日志…</p>:entries.length?<div className="activity-log-table-scroll" tabIndex={0} aria-label="工作日志列表，可滚动查看更多记录"><table><caption>最近 100 条工作记录，按时间从新到旧排列</caption><colgroup><col className="activity-log-time-column"/><col className="activity-log-level-column"/><col className="activity-log-action-column"/><col/></colgroup><thead><tr><th scope="col">时间</th><th scope="col">类型</th><th scope="col">操作</th><th scope="col">结果</th></tr></thead><tbody>{entries.map(entry=><tr key={entry.id}><td><time dateTime={entry.timestamp}>{timestamp(entry.timestamp)}</time></td><td className="activity-log-level" data-level={entry.level}>{label(LEVEL_LABELS,entry.level)}</td><td>{activityLogActionLabel(entry.action)}</td><td>{entryResult(entry)}</td></tr>)}</tbody></table></div>:!readError?<div className="activity-log-empty"><strong>还没有工作记录</strong><p>继续使用工作台后，可在这里刷新查看。</p></div>:null}
      {feed?.truncated&&<p className="activity-log-footnote">当前列表仅展示部分日志。导出可查看本机当前保留的记录。</p>}
      {feed?.notes&&<div className="activity-log-footnote">{(Array.isArray(feed.notes)?feed.notes:[feed.notes]).filter(note=>typeof note==='string').map((note,index)=><p key={index}>{note}</p>)}</div>}
    </section>
  </AppDialog>;
}
