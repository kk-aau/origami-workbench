import {useEffect,useRef,useState} from 'react';
import type {Doc} from '../core/types';
import AppDialog from './AppDialog';

export interface EditorCPSource {id:string;title:string;detail?:string;preferred?:boolean}
export interface EditorCPSources {
  list:()=>Promise<EditorCPSource[]>;
  read:(id:string)=>Promise<Doc>;
}

export default function DiagramEditorCPSourceDialog({sources,target,onApply,onClose}:{
  sources:EditorCPSources;target:string;onApply:(doc:Doc)=>void;onClose:()=>void;
}){
  const current=useRef(sources);current.current=sources;
  const request=useRef(0);
  const [items,setItems]=useState<EditorCPSource[]>([]),[chosen,setChosen]=useState('');
  const [busy,setBusy]=useState<'list'|'read'|null>('list'),[error,setError]=useState('');
  function refresh(){
    const ticket=++request.current;
    setBusy('list');setError('');setItems([]);
    void current.current.list().then(next=>{
      if(request.current!==ticket)return;
      setItems(next);
      setChosen(old=>next.some(item=>item.id===old)?old:next.find(item=>item.preferred)?.id??(next.length===1?next[0].id:''));
    }).catch(reason=>{if(request.current===ticket)setError(reason instanceof Error?reason.message:String(reason));})
      .finally(()=>{if(request.current===ticket)setBusy(null);});
  }
  useEffect(()=>{refresh();return ()=>{request.current++;};},[]);
  function close(){request.current++;onClose();}
  async function apply(){
    if(busy||!chosen)return;
    const ticket=++request.current;
    setBusy('read');setError('');
    try{const doc=await current.current.read(chosen);if(request.current===ticket)onApply(doc);}
    catch(reason){if(request.current===ticket)setError(reason instanceof Error?reason.message:String(reason));}
    finally{if(request.current===ticket)setBusy(null);}
  }
  return <AppDialog title={'采用编辑区 CP · '+target} size="small" onClose={close}
    footer={<><button type="button" onClick={refresh} disabled={!!busy}>刷新列表</button><button type="button" onClick={close}>取消</button><button type="button" className="primary" disabled={!!busy||!chosen||!items.length} onClick={()=>void apply()}>{busy==='read'?'正在读取…':'采用'}</button></>}>
    {busy==='list'?<p role="status">正在读取已打开的折痕工程…</p>:items.length?
      <fieldset className="diagram-editor-cp-choices"><legend>已打开的折痕工程</legend>{items.map(item=><label key={item.id}>
        <input type="radio" name="diagram-editor-cp-source" checked={chosen===item.id} disabled={!!busy} onChange={()=>setChosen(item.id)}/>
        <span>{item.title}{item.detail&&<small>{item.detail}</small>}</span>
      </label>)}</fieldset>:!error&&<p>请先在折痕编辑区打开或新建一份工程。</p>}
    {error&&<p role="alert">{error}</p>}
  </AppDialog>;
}
