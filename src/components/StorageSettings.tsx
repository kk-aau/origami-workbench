import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import type {StorageStatus,StorageDirectoryKind,StorageDirectorySelection} from '../app/storageSettings';
import './StorageSettings.css';

export interface StorageSettingsProps {
  status:StorageStatus|null;initial:boolean;unavailable?:boolean;
  onClose:()=>void;
  onPick:(kind:StorageDirectoryKind)=>Promise<StorageDirectorySelection>;
  onApply:(selections:Partial<Record<StorageDirectoryKind,string>>)=>Promise<void>;
  error?:string;busy?:boolean;
  commandSettings?:ReactNode;
  onOpenActivityLog?:()=>void;
}
const DIRECTORIES:ReadonlyArray<{kind:StorageDirectoryKind;label:string;description:string}>=[
  {kind:'projectsDir',label:'折痕工程',description:'折痕编辑工作区中的已保存工程。'},
  {kind:'diagramsDir',label:'折序绘图',description:'折序绘图库中的工程、草稿和文件夹记录。'},
  {kind:'dataDir',label:'程序数据',description:'设置、自动恢复和应用日志。'},
];
type PendingDirectories=Partial<Record<StorageDirectoryKind,{selectionId:string;path:string}>>;
const errorText=(error:unknown)=>error instanceof Error?error.message:'保存目录操作未完成，请重试。';

export default function StorageSettings({status,initial,unavailable=false,onClose,onPick,onApply,error='',busy=false,commandSettings,onOpenActivityLog}:StorageSettingsProps) {
  const dialog=useRef<HTMLDivElement>(null),operation=useRef(false);
  const [pending,setPending]=useState<PendingDirectories>({}),[picking,setPicking]=useState<StorageDirectoryKind|null>(null),[applying,setApplying]=useState(false),[localError,setLocalError]=useState('');
  const [page,setPage]=useState<'directories'|'commands'>('directories'),[commandMounted,setCommandMounted]=useState(false);
  const id=useId(),tabsId=`storage-settings-tabs-${id}`;
  const recoveryRequired=!!status?.unavailable?.length;
  const showTabs=!initial&&!recoveryRequired&&commandSettings!=null,commandPage=showTabs&&page==='commands';
  const operationLocked=!!picking||applying||!!status?.busy;
  const locked=operationLocked||(!unavailable&&busy),dialogLocked=commandPage?operationLocked:locked;
  const allowClose=!dialogLocked&&!recoveryRequired&&(!initial||unavailable);
  const ready=!!status&&!unavailable,canPick=ready&&status.pickerAvailable&&!locked;
  const pendingCount=Object.keys(pending).length,displayError=localError||error;
  const recoveryReady=!recoveryRequired||status!.unavailable!.every(item=>!!pending[item.kind]);
  function showPage(next:'directories'|'commands') {
    if(operationLocked)return;
    setPage(next);if(next==='commands')setCommandMounted(true);
  }
  useEffect(()=>{
    const before=document.activeElement as HTMLElement|null;
    dialog.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    if(!dialog.current?.contains(document.activeElement))dialog.current?.focus();
    return()=>{if(before?.isConnected)before.focus();};
  },[]);
  useEffect(()=>{if(dialogLocked)dialog.current?.focus();},[dialogLocked]);
  async function pick(kind:StorageDirectoryKind) {
    if(!canPick||operation.current)return;operation.current=true;setPicking(kind);setLocalError('');
    try {
      const selected=await onPick(kind);
      if(selected.cancelled)return;
      if(!selected.selectionId||!selected.path)throw new Error('未取得有效目录，请重新选择文件夹。');
      setPending(previous=>({...previous,[kind]:{selectionId:selected.selectionId!,path:selected.path!}}));
    }catch(failure){setLocalError(errorText(failure));}finally{operation.current=false;setPicking(null);}
  }
  function withdraw(kind:StorageDirectoryKind) {
    if(locked)return;setPending(previous=>{const next={...previous};delete next[kind];return next;});setLocalError('');
  }
  async function apply() {
    if(!ready||!recoveryReady||locked||operation.current)return;operation.current=true;setApplying(true);setLocalError('');
    const selections:Partial<Record<StorageDirectoryKind,string>>={};
    for(const category of DIRECTORIES)if(pending[category.kind])selections[category.kind]=pending[category.kind]!.selectionId;
    try {await onApply(selections);setPending({});}catch(failure){setLocalError(errorText(failure));}finally{operation.current=false;setApplying(false);}
  }
  return <div className="storage-settings-backdrop"><div ref={dialog} tabIndex={-1} className="storage-settings-dialog ui-dialog" role="dialog" aria-modal="true" aria-labelledby="storage-settings-title" aria-describedby={commandPage?'tool-command-settings-introduction':'storage-settings-introduction'} aria-busy={dialogLocked} data-storage-settings onKeyDown={event=>{
    event.stopPropagation();
    if(event.nativeEvent.isComposing||event.keyCode===229)return;
    if(event.key==='Escape'){event.preventDefault();if(allowClose)onClose();}
    if(event.key==='Tab'){
      const controls=[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(control=>!control.matches(':disabled')&&!control.closest('[hidden]'));
      const first=controls[0],last=controls.at(-1);
      if(!first){event.preventDefault();dialog.current?.focus();}
      else if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first.focus();}
    }
  }}>
    <header><div><p>{recoveryRequired?'原保存位置暂不可用':initial?'首次使用 · 保存位置':showTabs?'工作台 · 设置':'工作台 · 保存位置'}</p><h2 id="storage-settings-title">{recoveryRequired?'恢复保存位置':commandPage?'命令编辑':'保存目录'}</h2></div>{!recoveryRequired&&(!initial||unavailable)&&<button type="button" className="storage-settings-close" aria-label={showTabs?'关闭工作台设置':'关闭保存目录设置'} disabled={!allowClose} onClick={onClose}>×</button>}</header>
    {showTabs&&<div className="storage-settings-tabs" role="tablist" aria-label="设置分类" onKeyDown={event=>{
      if(operationLocked||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?'directories':event.key==='End'?'commands':commandPage?'directories':'commands';
      showPage(next);document.getElementById(`${tabsId}-${next}`)?.focus();
    }}>
      <button type="button" id={`${tabsId}-directories`} role="tab" aria-selected={!commandPage} aria-controls={`${tabsId}-directories-panel`} tabIndex={operationLocked||commandPage?-1:0} disabled={operationLocked} onClick={()=>showPage('directories')}>保存目录</button>
      <button type="button" id={`${tabsId}-commands`} role="tab" aria-selected={commandPage} aria-controls={`${tabsId}-commands-panel`} tabIndex={operationLocked||!commandPage?-1:0} disabled={operationLocked} onClick={()=>showPage('commands')}>命令编辑</button>
    </div>}
    <main hidden={commandPage} id={showTabs?`${tabsId}-directories-panel`:undefined} role={showTabs?'tabpanel':undefined} aria-labelledby={showTabs?`${tabsId}-directories`:undefined}>
      <p id="storage-settings-introduction" className="storage-settings-introduction">{recoveryRequired?'原目录不可达，无法迁移；请选择原数据所在位置或新目录。原路径及文件不会被修改。选择新空目录时，原数据不会自动出现在新目录。':initial?'为工程、折序绘图和程序数据分别选择保存位置，也可直接使用当前默认目录。':'选择新的保存位置后统一应用；现有内容会先复制完成，随后切换目录，原目录中的文件保留。'}</p>
      {!initial&&!recoveryRequired&&onOpenActivityLog&&<div className="storage-settings-log-link"><p>工作日志保存在本机，可导出近期操作与异常协助排查。</p><button type="button" disabled={dialogLocked} onClick={onOpenActivityLog}>查看与导出工作日志</button></div>}
      {unavailable?<p className="storage-settings-unavailable" role="status">保存目录设置暂不可用，原因显示在下方。可关闭此窗口继续当前工作。</p>:!status?<p className="storage-settings-status" role="status">正在读取当前保存目录…</p>:!status.pickerAvailable?<p className="storage-settings-status" role="status">当前运行环境暂不支持文件夹选择，可确认现有保存目录。</p>:null}
      <div className="storage-settings-directories">
        {DIRECTORIES.map(category=>{
          const choice=pending[category.kind],current=status?.paths[category.kind]||status?.defaults[category.kind]||'';
          return <section key={category.kind} className={'storage-settings-directory'+(choice?' has-pending':'')} data-storage-kind={category.kind} aria-labelledby={`storage-label-${category.kind}`}>
            <div className="storage-settings-category"><div><h3 id={`storage-label-${category.kind}`}>{category.label}</h3><p>{category.description}</p></div><button type="button" disabled={!canPick} aria-label={`选择${category.label}文件夹`} onClick={()=>void pick(category.kind)}>{picking===category.kind?'正在选择…':'选择文件夹'}</button></div>
            <label className="storage-settings-path"><span>当前目录</span><input readOnly disabled={locked} tabIndex={current?0:-1} aria-label={`${category.label}当前目录`} value={current} placeholder={unavailable?'当前目录由现有运行环境管理':'正在读取…'} title={current||undefined} onFocus={event=>event.currentTarget.select()}/></label>
            {status?.unavailable?.some(item=>item.kind===category.kind)&&<p className="storage-settings-unavailable" role="status">此目录不可达，请重新选择数据所在位置或新目录。</p>}
            {choice&&<div className="storage-settings-pending"><label className="storage-settings-path"><span>待应用</span><input readOnly disabled={locked} aria-label={`${category.label}待应用目录`} value={choice.path} title={choice.path} onFocus={event=>event.currentTarget.select()}/></label><button type="button" className="storage-settings-withdraw" aria-label={`撤回${category.label}目录选择`} disabled={locked} onClick={()=>withdraw(category.kind)}>撤回选择</button></div>}
          </section>;
        })}
      </div>
      <div className="storage-settings-notes"><p className={pendingCount?'storage-settings-pending-notice':''} aria-live="polite">{recoveryRequired?'为每个不可达位置重新选择目录后，即可恢复使用；原位置的内容不会被删除。':pendingCount?`已选择 ${pendingCount} 个新目录，尚未应用。点击下方按钮后统一迁移。`:'当前目录尚未改变。无需修改时，可直接确认以上目录。'}</p><p>浏览器及桌面 Chromium 缓存由宿主管理。</p></div>
    </main>
    {showTabs&&commandMounted&&<main hidden={!commandPage} id={`${tabsId}-commands-panel`} role="tabpanel" aria-labelledby={`${tabsId}-commands`}>{commandSettings}</main>}
    {!commandPage&&<footer><div className="storage-settings-result" aria-live="polite">{displayError?<span className="storage-settings-error" role="alert">{displayError}</span>:locked?<span>{picking?'正在选择文件夹…':!status?'正在读取保存目录…':'正在应用目录…'}</span>:<span>{recoveryRequired?'请选择不可达目录的新位置。':unavailable?'可关闭此窗口继续使用。':initial?'确认后开始使用工作台。':'迁移完成前保持原保存目录。'}</span>}</div>{!recoveryRequired&&(!initial||unavailable)&&<button type="button" disabled={!allowClose} onClick={onClose}>{unavailable?'关闭':'取消'}</button>}<button type="button" className="storage-settings-primary" disabled={!ready||!recoveryReady||locked} onClick={()=>void apply()}>{applying||(busy&&!unavailable)?status?'正在应用…':'正在读取…':recoveryRequired?'确认恢复保存位置':initial?'设置并开始使用':'迁移并应用'}</button></footer>}
  </div></div>;
}
