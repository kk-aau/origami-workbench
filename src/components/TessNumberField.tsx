import {useEffect,useState} from 'react';

/** A live numeric draft: incomplete text stays editable without sending NaN. */
export default function TessNumberField({label,value,min,max,step=1,onChange}:{label:string;value:number;min:number;max:number;step?:number;onChange:(value:number)=>void}){
  const [text,setText]=useState(String(value)),[invalid,setInvalid]=useState(false);
  useEffect(()=>{setText(previous=>previous.trim()&&Number(previous)===value?previous:String(value));setInvalid(false);},[value]);
  const valid=(text:string)=>text.trim()!==''&&Number.isFinite(Number(text))&&Number(text)>=min&&Number(text)<=max&&(step!==1||Number.isInteger(Number(text)));
  return <div className="tess-number"><label><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={text} aria-invalid={invalid} title={`${min}–${max}`} onChange={e=>{const next=e.target.value;setText(next);setInvalid(false);if(valid(next))onChange(Number(next));}} onBlur={()=>setInvalid(!valid(text))} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setText(String(value));setInvalid(false);}if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/></label><input aria-label={`${label}滑条`} type="range" min={min} max={max} step={step} value={value} onChange={e=>{setText(e.target.value);setInvalid(false);onChange(Number(e.target.value));}}/>{invalid&&<small role="alert">{min}–{max}{step===1?'，整数':''}</small>}</div>;
}
