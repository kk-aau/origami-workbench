import {useId,useMemo,useState} from 'react';
import type {Doc,Point} from '../core/types';
import {paperPath} from '../app/paper';
import {createPaperShape,paperShapeFromDoc,paperShapeDoc,preparePaperShapeChange,type PaperShapeKind} from '../app/paperShapes';
import {readPaperShapeLibrary,savePaperShape,type SavedPaperShape} from '../app/paperShapeLibrary';
import {WEB_APP} from '../app/webRuntime';
import './CanvasPaperSettings.css';

const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
const numberText=(value:number)=>String(Number(value.toPrecision(6)));
function readLibrary():{shapes:SavedPaperShape[];error:string}{
  try{return {shapes:readPaperShapeLibrary(),error:''};}
  catch(error){return {shapes:[],error:errorText(error)};}
}

export default function CanvasPaperSettings({doc,onApply,onMessage}:{doc:Doc;onApply:(next:Doc)=>boolean;onMessage?:(message:string)=>void}){
  const bodyId=useId(),[collapsed,setCollapsed]=useState(false),[choice,setChoice]=useState('current');
  const [library,setLibrary]=useState(readLibrary),[name,setName]=useState(''),[message,setMessage]=useState(''),[problem,setProblem]=useState(''),[saving,setSaving]=useState(false);
  const [ratio,setRatio]=useState(()=>{const side=Math.min(doc.paper.width,doc.paper.height);return [numberText(doc.paper.width/side),numberText(doc.paper.height/side)];});
  const [sides,setSides]=useState('6');
  const preview=useMemo(()=>{
    try{
      const shape=choice==='current'?paperShapeFromDoc(doc):choice.startsWith('saved:')?library.shapes.find(item=>item.id===choice.slice(6))?.shape:createPaperShape(choice as PaperShapeKind,choice==='rectangle'?ratio.map(value=>value.trim()?Number(value):NaN) as Point:[1,1],choice==='regular'?Number(sides):6,Math.max(doc.paper.width,doc.paper.height));
      if(!shape)throw Error('该纸形模板已不存在，请重新选择。');
      const paper=paperShapeDoc(shape),padding=Math.max(shape.paper.width,shape.paper.height)*.06;
      const change=choice==='current'?null:preparePaperShapeChange(doc,shape);
      return {shape,path:paperPath(paper),viewBox:`${-padding} ${-padding} ${shape.paper.width+padding*2} ${shape.paper.height+padding*2}`,change,error:''};
    }catch(error){return {shape:undefined,path:'',viewBox:'0 0 1 1',change:null,error:errorText(error)};}
  },[doc,choice,library.shapes,ratio,sides]);
  function refreshLibrary(){
    const next=readLibrary();
    setLibrary(previous=>next.error?{...previous,error:next.error}:next);
  }
  function choose(value:string){setChoice(value);setProblem('');setMessage('');}
  function apply(){
    setProblem('');setMessage('');
    try{
      if(!preview.change||!preview.shape)throw Error(preview.error||'请先选择需要应用的纸形。');
      if(choice.startsWith('saved:')){
        const current=readPaperShapeLibrary().find(item=>item.id===choice.slice(6));
        if(!current||JSON.stringify(current.shape)!==JSON.stringify(preview.shape))throw Error('纸形模板已发生变化，请重新选择后应用。');
      }
      if(!onApply(preview.change.doc))return;
      const text=preview.change.doc===doc?'纸形与当前一致，无需修改。':preview.change.clipped||preview.change.removed?`已应用纸形，裁剪 ${preview.change.clipped} 条、移除 ${preview.change.removed} 条折痕，可撤销。`:'纸形已应用，可撤销。';
      setChoice('current');setMessage(text);onMessage?.(text);
    }catch(error){setProblem(errorText(error));}
  }
  async function save(){
    if(saving)return;setProblem('');setMessage('');
    if(!preview.shape){setProblem(preview.error);return;}
    setSaving(true);
    try{
      const shapes=savePaperShape(name,preview.shape);
      if(WEB_APP)await (await import('../app/browserStorage')).flushBrowserPreferences();
      setLibrary({shapes,error:''});setName('');
      const text='纸形模板已保存，可在形状列表中选择。';setMessage(text);onMessage?.(text);
    }catch(error){setProblem(errorText(error));}
    finally{setSaving(false);}
  }
  const clipped=!!(preview.change?.clipped||preview.change?.removed);
  return <section className={'canvas-settings-section canvas-paper-settings'+(collapsed?' is-collapsed':'')}>
    <div className="canvas-paper-heading">
      <h3><button type="button" className="canvas-section-toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={()=>setCollapsed(value=>!value)}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d={collapsed?'m4 2 4 4-4 4':'m2 4 4 4 4-4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>纸张</button></h3>
      <select aria-label="纸张形状" value={choice} disabled={saving} onFocus={refreshLibrary} onChange={event=>choose(event.target.value)}>
        <option value="current">当前纸形</option><option value="square">正方形</option><option value="rectangle">矩形</option><option value="triangle">等边三角形</option><option value="regular">正多边形</option>
        {library.shapes.length>0&&<optgroup label="已保存纸形">{library.shapes.map(item=><option key={item.id} value={`saved:${item.id}`}>{item.name}</option>)}</optgroup>}
      </select>
    </div>
    <div id={bodyId} className="canvas-settings-body" hidden={collapsed}>
      {choice==='rectangle'&&<div className="canvas-paper-ratio">{(['宽比','高比'] as const).map((label,axis)=><label key={label}>{label}<input aria-label={`纸张${label}`} type="number" min="0.000001" max="100000" step="any" value={ratio[axis]} disabled={saving} onChange={event=>{const value=event.target.value;setRatio(previous=>previous.map((entry,index)=>index===axis?value:entry));setMessage('');}}/></label>)}</div>}
      {choice==='regular'&&<label className="canvas-paper-sides">边数<input aria-label="纸张边数" type="number" min={3} max={64} step={1} value={sides} disabled={saving} onChange={event=>setSides(event.target.value)}/></label>}
      {preview.shape&&<svg className="canvas-paper-preview" role="img" aria-label="纸张形状预览" viewBox={preview.viewBox}><path d={preview.path} fillRule="evenodd" vectorEffect="non-scaling-stroke"/></svg>}
      <div className="canvas-paper-apply-row"><span>{preview.change?clipped?`裁剪 ${preview.change.clipped} 条 · 移除 ${preview.change.removed} 条`:'保留当前折痕':preview.shape?'仅保存纸张边界':''}</span><button type="button" disabled={saving||!preview.change} onClick={apply}>{clipped?'应用并裁剪':'应用纸形'}</button></div>
      <form className="canvas-paper-save" onSubmit={event=>{event.preventDefault();void save();}}>
        <input aria-label="纸形模板名称" placeholder="纸形名称" maxLength={160} required disabled={saving||!preview.shape} value={name} onChange={event=>setName(event.target.value)}/>
        <button type="submit" disabled={saving||!preview.shape} title="独立保存预览中的纸张边界，不包含折痕、标注或图片">{saving?'保存中…':'保存纸形'}</button>
      </form>
      {(problem||preview.error||library.error)&&<p className="canvas-settings-error" role="alert">{problem||preview.error||library.error}</p>}
      {message&&<p className="canvas-settings-note" role="status">{message}</p>}
    </div>
  </section>;
}
