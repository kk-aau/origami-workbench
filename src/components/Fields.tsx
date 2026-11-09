import { useEffect, useRef, useState } from 'react';
import {draftingGlyph} from './draftingGlyph';
import './draftingGlyph.css';
export function NumberField({label,value,onChange,onDraftChange,min=-1e6,max=1e6,step=1,suffix='',disabled=false,preservePrecision=false}:{label:string;value:number;onChange:(n:number)=>void;onDraftChange?:()=>void;min?:number;max?:number|null;step?:number;suffix?:string;disabled?:boolean;preservePrecision?:boolean}) {
  const [text,setText]=useState(String(value)),[error,setError]=useState('');
  const skipCommit=useRef(false),edited=useRef(false);
  useEffect(()=>{setText(preservePrecision?String(value):String(Number(value.toFixed(5))));setError('');},[value,preservePrecision]);
  function commit(){if(skipCommit.current){skipCommit.current=false;edited.current=false;return;}if(!edited.current)return;const n=Number(text);if(!text.trim()||!Number.isFinite(n)||n<min||(max!==null&&n>max)){setError(max===null?`须为不小于 ${min} 的有限数`:`范围 ${min}–${max}`);return;}setError('');edited.current=false;onChange(n);}
  return <label className={'number-field'+(error?' invalid':'')}><span>{label}</span><span className="number-input"><input aria-label={label} type="number" value={text} min={min} max={max??undefined} step={step} disabled={disabled} onChange={e=>{edited.current=true;setText(e.target.value);onDraftChange?.();}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();edited.current=true;e.currentTarget.blur();}if(e.key==='Escape'){e.preventDefault();skipCommit.current=true;setText(String(value));setError('');e.currentTarget.blur();}}} aria-invalid={!!error}/>{suffix&&<small>{suffix}</small>}</span>{error&&<small className="field-error" role="alert">{error}</small>}</label>;
}
export function Icon({name}:{name:string}) {
 const glyph=draftingGlyph(name);
 if(glyph)return <svg className={'icon'+(name==='alternatecollinear'?' icon-wide':'')} viewBox={name==='alternatecollinear'?'0 0 36 8':'0 0 24 24'} preserveAspectRatio={name==='alternatecollinear'?'none':undefined} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{glyph}</svg>;
 const paths:Record<string,string>={
  circleedit:'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0M12 7v10M7 12h10',
  mergevertex:'M3 15h18M9 11l3 4-3 4M15 11l-3 4 3 4M8 4h8',
  pan:'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4',
  measure:'m3 16 13-13 5 5L8 21ZM12 7l3 3M8 11l3 3M4 15l3 3',
  save:'M4 3h13l4 4v14H3V3ZM7 3v6h9V3M7 21v-8h10v8',
  folder:'M3 6h7l2 3h9v11H3Z',
  check:'m4 12 5 5L20 6',
  trash:'M4 6h16M9 3h6M6 6l1 15h10l1-15M10 10v7M14 10v7',
  undo:'M9 4 3 9l6 5M3 9h11a6 6 0 0 1 0 12',
  redo:'m15 4 6 5-6 5M21 9H10a6 6 0 0 0 0 12',
  grid:'M3 8h18M3 16h18M8 3v18M16 3v18',
  export:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4M12 18v.1',
  mirror:'M12 2v20M3 7l5 5-5 5ZM21 7l-5 5 5 5Z',
  rotatecopyselection:'M5 11a7 7 0 1 1 2 6M5 5v6h6M4 18v4h4v-4ZM12 13h4v4h-4Z'
 };
 paths.eraseedge='M3 5h18M3 12h18M3 19h18M7 3v18M17 3v18';
 paths.eraseaux='M2 12h5m5 0h5m5 0h1M12 3v5m0 8v5M4 4l16 16M20 4 4 20';
 paths.backgroundposition='M3 3h18v18H3ZM5 15l5-6 4 4 4-6M5 5h3M5 5v3M19 19h-3M19 19v-3';
 paths.advancetype='M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7ZM12 8v8M8 12h8';
 paths.operationframe='M2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6M7 7h10v10H7Z';
 paths.measurel1=paths.measure;paths.measurel2=paths.measure;paths.measurea1='M3 3v18h18M3 13a8 8 0 0 1 8 8';paths.measurea2=paths.measurea1;paths.measurea3=paths.measurea1;
 paths.alternatecross='M3 20 21 2M3 7h14M9 4v15M15 13h8M18 16v7';
 paths.eraseoverlap='M2 8h20M5 5v6M19 5v6M9 16l6 6m0-6-6 6';paths.erasecross='M2 20 20 2M3 8h17M9 3v17M16 16l6 6m0-6-6 6';
 paths.replacetype='M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4';paths.deletetype='M3 5h18L14 13v6l-4 2v-8ZM17 15l5 5m0-5-5 5';
 paths.makemountain='M2 18l10-12 10 12M3 22h18';paths.makevalley='M2 6l10 12L22 6M3 22h18';paths.makeedge='M3 4h18v16H3ZM7 12h10';paths.makeaux='M2 12h3m4 0h3m4 0h3M12 3v4m0 10v4';
 paths.mergecrossvertex='M2 15h20M9 10l3 5-3 5M15 10l-3 5 3 5M3 4h6m6 0h6';paths.regionalswap=paths.replacetype;
 paths.selectpolygon='M3 5L15 2L22 12L14 21L2 17ZM7 11h8M11 7v8';paths.unselectpolygon='M3 5L15 2L22 12L14 21L2 17ZM7 11h8';
 paths.selectlasso='M9 19C-2 19 0 3 11 3S26 17 15 19C8 21 2 15 6 12M10 8h8M14 4v8';paths.unselectlasso='M9 19C-2 19 0 3 11 3S26 17 15 19C8 21 2 15 6 12M10 8h8';
 paths.selectcross='M3 20L21 2M4 7H17M9 20V6M16 16h7M19.5 12.5v7';paths.unselectcross='M3 20L21 2M4 7H17M9 20V6M16 16h7';
 paths.mark='M4 19 19 4M3 16v5h5M16 3h5v5M4 5h5M6.5 2.5v5';
 paths.cycletype='M4 8a8 8 0 0 1 14-2l3 3M21 3v6h-6M20 16a8 8 0 0 1-14 2l-3-3M3 21v-6h6';
 paths.customcolor='M13 3a9 9 0 1 0 0 18c3 0 1-4 3-5s6 0 6-4a9 9 0 0 0-9-9ZM7 9h.1M11 6h.1M16 7h.1M18 11h.1';
 paths.regioncheck='M3 5 14 2 21 10 17 21 4 18ZM7 11l4 4 7-8';
 paths.text='M4 6V3h16v3M12 3v18M8 21h8';
 return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.grid}/></svg>;
}
