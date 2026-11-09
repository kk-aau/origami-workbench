import {useEffect,useId,useRef,useState} from 'react';
import {resolveMeasurementValue,type Measurements} from '../app/measurements';

/** Explicit snapshot reference field; ordinary numeric inputs remain unchanged. */
export default function MeasurementField({label,value,onChange,measurements,min=-1e6,max=1e6,suffix='',disabled=false}:{label:string;value:number;onChange:(n:number)=>void;measurements:Measurements;min?:number;max?:number;step?:number;suffix?:string;disabled?:boolean}){
  const [text,setText]=useState(String(value)),[error,setError]=useState('');
  const edited=useRef(false),errorId=useId();
  useEffect(()=>{setText(String(value));setError('');edited.current=false;},[value]);
  function commit(){
    if(!edited.current)return;
    try{
      const n=resolveMeasurementValue(text,measurements);
      if(n<min||n>max)throw new Error(`范围 ${min}–${max}，引用值为 ${n}。`);
      onChange(n);edited.current=false;setText(String(n));setError('');
    }catch(e){setError((e as Error).message);}
  }
  return <label className={'number-field'+(error?' invalid':'')}><span>{label}</span><span className="number-input"><input aria-label={label} type="text" value={text} disabled={disabled} title="输入数字或 L1/L2/A1/A2/A3；提交时取值，L 为格单位" onChange={e=>{edited.current=true;setText(e.target.value);}} onBlur={commit} onKeyDown={e=>{
    if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();edited.current=false;setText(String(value));setError('');e.currentTarget.blur();}
  }} aria-invalid={!!error} aria-describedby={error?errorId:undefined}/>{suffix&&<small>{suffix}</small>}</span>{error&&<small id={errorId} className="field-error" role="alert">{error}</small>}</label>;
}
