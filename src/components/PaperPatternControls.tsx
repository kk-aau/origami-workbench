import {useEffect,useMemo,useRef,useState} from 'react';
import {preparePaperPattern} from '../app/diagramImageImport';
import {makePaperImage,paperFaceStyle} from '../app/fiberPaper';
import type {PaperFaceStyle,PaperPatterns,PaperSide} from '../app/paperPatterns';
import ColorPicker from '../ui/ColorPicker';
import './PaperPatternControls.css';

type Props={value?:PaperPatterns;colors?:Record<PaperSide,string>;disabled?:boolean;onChange:(value:PaperPatterns)=>void;onBusyChange?:(busy:boolean)=>void};
const defaultColors={front:'#fffefb',back:'#f3e6ce'};

export default function PaperPatternControls({value,colors=defaultColors,disabled=false,onChange,onBusyChange}:Props){
  const [pending,setPending]=useState<PaperSide|null>(null),[error,setError]=useState('');
  const request=useRef<AbortController|null>(null),latest=useRef({value,onChange});latest.current={value,onChange};
  const front=useMemo(()=>paperFaceStyle(value?.styles?.front,value?.front,colors.front),[value?.styles?.front,value?.front,colors.front]);
  const back=useMemo(()=>paperFaceStyle(value?.styles?.back,value?.back,colors.back),[value?.styles?.back,value?.back,colors.back]);
  useEffect(()=>()=>request.current?.abort(),[]);

  async function apply(side:PaperSide,style:PaperFaceStyle,file?:File){
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setError('');setPending(side);onBusyChange?.(true);
    try{
      const previous=latest.current.value;
      const priorStyle=side==='front'?front:back;
      const upload=priorStyle.mode==='image'?previous?.[side]:priorStyle.upload;
      const image=style.mode==='color'?await makePaperImage(style,controller.signal):
        file?await preparePaperPattern(file,controller.signal):upload;
      if(controller.signal.aborted)return;
      const stored:PaperFaceStyle={mode:style.mode,color:style.color,texture:style.texture};
      if(style.mode==='color'&&upload)stored.upload=upload;
      const current=latest.current.value;
      const next={...current,styles:{...current?.styles,[side]:stored}};
      if(image)next[side]=image;else delete next[side];
      latest.current.onChange(next);
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:String(cause));}
    finally{if(!controller.signal.aborted){setPending(null);onBusyChange?.(false);}}
  }

  return <fieldset className="paper-pattern-controls" disabled={disabled||pending!==null}><legend>纸张外观</legend>
    {(['front','back'] as const).map(side=>{
      const name=side==='front'?'正面':'背面',style=side==='front'?front:back,imageMode=style.mode==='image';
      return <div className="paper-face-settings" key={side}>
        <div className="paper-mode-row"><strong>{name}</strong><div className="paper-mode-switch" role="group" aria-label={name+'外观来源'}>
          {(['color','image'] as const).map(mode=><button key={mode} type="button" aria-pressed={style.mode===mode} onClick={()=>{if(style.mode!==mode)void apply(side,{...style,mode});}}>{mode==='color'?'颜色与纹理':'上传图片'}</button>)}
        </div></div>
        <div className="paper-face-options">
          <span className={'paper-face-material'+(imageMode?' is-disabled':'')}>
            <ColorPicker aria-label={'纸张'+name+'颜色'} value={style.color} disabled={imageMode||disabled||pending!==null} onChange={color=>void apply(side,{...style,color})}/>
            <select aria-label={name+'纹理'} title="纹理" disabled={imageMode} value={style.texture} onChange={e=>void apply(side,{...style,texture:e.target.value==='washi'?'washi':'none'})}>
              <option value="none">无纹理</option><option value="washi">和纸</option>
            </select>
          </span>
          {imageMode&&<label className="paper-image-upload">{value?.[side]&&<img alt="" src={value[side]}/>}
            {value?.[side]?'换图':'选图'}<input type="file" accept="image/png,image/jpeg,image/webp" aria-label={name+'图案'} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void apply(side,style,file);}}/>
          </label>}
        </div>
      </div>;
    })}
    {error&&<small role="alert">{error}</small>}
  </fieldset>;
}
