import {useEffect,useRef,useState} from 'react';
import type {Doc} from '../core/types';
import {loadBackground} from '../app/backgroundLoader';
import {getPaperBounds} from '../app/paper';
import {fitBackground} from '../app/backgroundPlacement';
import {NumberField} from './Fields';
import {setBackgroundFollow,type BackgroundView} from '../app/backgroundAnchor';

export default function BackgroundPanel({doc,view,onChange,onPosition}:{doc:Doc;view:BackgroundView|null;onChange:(doc:Doc)=>boolean;onPosition:()=>void}){
  const input=useRef<HTMLInputElement>(null),latest=useRef(doc),alive=useRef(true);
  latest.current=doc;
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const bg=doc.background;
  useEffect(()=>{
    setError('');if(!bg)return;
    let cancelled=false;const image=new Image();image.src=bg.dataUrl;
    void image.decode().catch(()=>{if(!cancelled)setError('底图无法解码，原始数据仍保留。请替换或移除底图。');});
    return()=>{cancelled=true;};
  },[bg?.dataUrl]);
  async function load(file:File){
    const original=doc;setBusy(true);setError('');
    try{
      const background=await loadBackground(file,getPaperBounds(original));
      if(!alive.current)return;
      if(latest.current!==original){setError('读取期间工程已变化，本次图片未应用，请重新加载。');return;}
      onChange({...original,background});
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(alive.current)setBusy(false);}
  }
  return <section aria-label="参考底图"><h2>参考底图</h2>
    <input ref={input} className="hidden" type="file" aria-label="加载底图文件" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void load(file);}}/>
    <button className="outline full" disabled={busy} onClick={()=>input.current?.click()}>{busy?'正在校验图片…':bg?'替换底图':'加载底图'}</button>
    {error&&<p role="alert" className="note">{error}</p>}
    {bg&&<><p className="note" style={{overflowWrap:'anywhere'}}>{bg.name} · {bg.width} × {bg.height} px</p>
      <label className="checkbox"><input type="checkbox" checked={bg.visible} onChange={e=>onChange({...doc,background:{...bg,visible:e.target.checked}})}/>显示底图</label>
      <label className="checkbox"><input type="checkbox" disabled={!view} checked={!bg.viewport} onChange={e=>{try{if(view){onChange({...doc,background:setBackgroundFollow(bg,view,e.target.checked)});setError('');}}catch(error){setError(error instanceof Error?error.message:String(error));}}}/>底图随画布移动与缩放</label>
      <p className="note">{bg.viewport?'当前固定在屏幕：移动、缩放画布不会移动底图。':'当前随画布：底图保持与折线的相对位置。'}切换保持当前显示位置；四点配准后自动固定屏幕。</p>
      <NumberField label="底图不透明度" value={Math.round(bg.opacity*100)} min={0} max={100} step={5} suffix="%" onChange={n=>onChange({...doc,background:{...bg,opacity:n/100}})}/>
      <button className="outline full" disabled={!bg.visible||bg.opacity<=0||!!error} onClick={onPosition}>四点配准底图</button>
      <div className="button-pair"><button onClick={()=>{const {viewport:_,...rest}=bg;onChange({...doc,background:{...rest,placement:fitBackground(bg,getPaperBounds(doc))}});}}>适合纸张</button><button onClick={()=>{const {background:_,...next}=doc;onChange(next);}}>移除底图</button></div>
    </>}
    <p className="note">PNG / JPEG / WebP，约 3 MB 以内。新载入／适合纸张时恢复随画布。底图不参与折叠计算，修改可撤销。完整工程 JSON 保存原图与锁定状态；交换格式、线型图导出和打印不包含底图。</p>
  </section>;
}
