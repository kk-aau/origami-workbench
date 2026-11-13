import {useState} from 'react';
import AppDialog from './AppDialog';
import type {ArtworkRecoverySummary} from '../app/artworkRecovery';
import './artwork-overview.css';

export interface ArtworkOverviewRow {name:string;content:string;source:string}
export default function ArtworkOverview({rows,recovery,onClose,onSave,onRestore,onRemove}:{
  rows:ArtworkOverviewRow[];
  recovery:{entries:ArtworkRecoverySummary[];warnings:string[];error:string;busy:boolean;listing?:boolean;updated:string;pending:boolean;currentId:string;checkpoint:()=>Promise<boolean>;refresh:()=>Promise<void>};
  onClose:()=>void;onSave:()=>void;onRestore:(entry:ArtworkRecoverySummary)=>Promise<void>;onRemove:(entry:ArtworkRecoverySummary)=>Promise<void>;
}){
  const [action,setAction]=useState(''),[failure,setFailure]=useState('');
  const run=async(id:string,fn:()=>Promise<unknown>)=>{if(action)return;setAction(id);setFailure('');try{await fn();}catch(error){setFailure(error instanceof Error?error.message:String(error));}finally{setAction('');}};
  const status=recovery.busy?'正在暂存完整作品…':recovery.error?'恢复副本未更新':recovery.updated?`${recovery.pending?'有更新待暂存 · 上次':'完整作品已暂存'} ${new Date(recovery.updated).toLocaleTimeString('zh-CN')}`:'等待暂存完整作品';
  return <AppDialog title="作品总览与恢复" onClose={onClose} size="large" closeDisabled={!!action} bodyClassName="artwork-overview" footer={<><button disabled={!!action||recovery.busy} onClick={()=>void run('checkpoint',async()=>{if(!await recovery.checkpoint())throw new Error('本次未完成暂存，请查看提示并重试。');})}>立即暂存完整作品</button><button className="primary" disabled={!!action} onClick={onSave}>下载完整作品</button></>}>
    <table aria-label="当前作品内容"><thead><tr><th>工作区</th><th>当前内容</th><th>来源与保存范围</th></tr></thead><tbody>{rows.map(row=><tr key={row.name}><th scope="row">{row.name}</th><td>{row.content}</td><td>{row.source}</td></tr>)}</tbody></table>
    <p className="artwork-recovery-status" role="status">{status}</p>
    {(failure||recovery.error)&&<p role="alert" className="warning">{[failure,recovery.error].filter(Boolean).join(' ')}。上一次成功的副本仍保留，可下载完整作品备份。</p>}
    <p className="note">恢复副本写入本机保存目录，通常在修改后约 2 秒、持续模拟时每 20 秒更新。突然断电可能丢失尚未暂存的操作；下载完整作品可另留备份。独立“保存折痕／折序”不包含其他工作区。</p>
    <div className="artwork-recovery-heading"><h3>恢复副本</h3><button disabled={!!action||recovery.busy||recovery.listing} onClick={()=>void run('refresh',recovery.refresh)}>刷新列表</button></div>
    {recovery.warnings.map((warning,index)=><p className="warning" key={index}>{warning}</p>)}
    {recovery.listing&&<p className="note" role="status">正在检查恢复副本，可以继续操作工作台。</p>}
    {!recovery.entries.length?!recovery.listing&&<p className="note">尚无完整作品恢复副本。</p>:<ul className="artwork-recovery-list">{recovery.entries.map(entry=><li key={entry.id}>
      <div><strong>{entry.name}{entry.id===recovery.currentId?' · 当前窗口':''}</strong><small>{new Date(entry.updated).toLocaleString('zh-CN')} · {entry.damaged?'文件损坏':`${entry.models} 个模型 · ${entry.steps} 步折序${entry.simulation?' · 含三维姿态':''}`}</small></div>
      <button disabled={!!action||recovery.busy||entry.damaged||entry.id===recovery.currentId} onClick={()=>void run(entry.id,()=>onRestore(entry))}>{action===entry.id?'处理中…':'恢复此作品'}</button>
      <button disabled={!!action||recovery.busy||entry.id===recovery.currentId} onClick={()=>void run(`delete:${entry.id}`,()=>onRemove(entry))}>删除副本</button>
    </li>)}</ul>}
  </AppDialog>;
}
