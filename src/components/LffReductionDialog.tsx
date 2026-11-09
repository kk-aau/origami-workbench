import {useEffect,useRef,useState} from 'react';
import {api} from '../app/api';
import {TessDialog} from './TessellationEditor';

type Sector=[string,number];
type Step={crimped:string[];remaining:Sector[]};
type Reduction={kind:'local-high-order-lff-reduction';steps:Step[];crimpPairs:string[][];remaining:Sector[];fullyReduced:boolean;stopReason:string;alternatingSums:number[];globalFoldabilityChecked:boolean};

const SIX='a:100, b:20, c:30, d:40, e:50, f:120';
const EIGHT='a:60, b:20, c:30, d:40, e:50, f:60, g:40, h:60';

function parseSectors(text:string):{sectorAnglesDeg:number[];labels:string[]}{
  const parts=text.replaceAll('：',':').split(/[,，;；\s]+/).filter(Boolean);
  if(parts.length<2||parts.length>32||parts.length%2)throw Error('输入 2–32 个偶数个扇区，按逆时针排列。');
  const labeled=parts[0].includes(':');
  if(parts.some(part=>part.includes(':')!==labeled))throw Error('请统一使用“标签:角度”或只输入角度。');
  const labels:string[]=[],sectorAnglesDeg:number[]=[];
  parts.forEach((part,index)=>{
    const pieces=labeled?part.split(':'):[String(index+1),part];
    if(pieces.length!==2||!pieces[0]||pieces[0].length>24)throw Error('折线标签不能为空，且最长 24 字。');
    const value=Number(pieces[1]);
    if(!pieces[1]||!Number.isFinite(value)||value<=0||value>1_000_000)throw Error('扇区角须为正的有限数字。');
    labels.push(pieces[0]);sectorAnglesDeg.push(value);
  });
  if(new Set(labels).size!==labels.length)throw Error('每条折线须有不同标签。');
  return {sectorAnglesDeg,labels};
}

export default function LffReductionDialog({onClose}:{onClose:()=>void}){
  const [text,setText]=useState(SIX),[result,setResult]=useState<Reduction|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  const change=(value:string)=>{request.current?.abort();setText(value);setResult(null);setError('');setBusy(false);};
  const calculate=async()=>{
    request.current?.abort();setResult(null);setError('');
    let input:ReturnType<typeof parseSectors>;
    try{input=parseSectors(text);}catch(cause){setError((cause as Error).message);return;}
    const controller=new AbortController();request.current=controller;setBusy(true);
    try{
      const response=await api<Reduction>('tessellation/lff-reduction',input,controller.signal);
      if(!controller.signal.aborted)setResult(response);
    }catch(cause){if(!controller.signal.aborted)setError((cause as Error).message);}
    finally{if(request.current===controller){request.current=null;setBusy(false);}}
  };
  return <TessDialog title="高阶顶点局部平折归约" onClose={onClose}>
    <p className="note">按逆时针输入每条折线后的扇区角，可用“标签:角度”或只填角度。先检验 Kawasaki–Justin 交替和，再按原版顺序消去严格局部最小扇区。</p>
    <div className="lff-reduction-presets"><button onClick={()=>change(SIX)}>原版六度例</button><button onClick={()=>change(EIGHT)}>原版八度例</button></div>
    <textarea className="lff-reduction-input" aria-label="高阶顶点扇区角" value={text} onChange={event=>change(event.target.value)}/>
    {result&&<div className="lff-reduction-results" aria-label="高阶顶点归约结果">
      <p>交替角和：{result.alternatingSums.map(value=>Number(value.toFixed(6))).join('° / ')}° · <strong>{result.fullyReduced?'已归约至终点':'无严格局部最小扇区，归约停止'}</strong></p>
      {result.crimpPairs.length>0&&<div className="lff-reduction-pairs">{result.crimpPairs.map((pair,index)=><span key={index}>{index+1}. {pair[0]} ↔ {pair[1]}</span>)}</div>}
      {result.remaining.length>0&&<p>剩余扇区：{result.remaining.map(([label,angle])=>`${label}:${Number(angle.toFixed(6))}°`).join('，')}</p>}
      <p className="note">这是单个顶点的局部归约，不证明整张纸的层序、无碰撞或连续折叠。</p>
    </div>}
    {error&&<p role="alert" className="tess-editor-error">{error}</p>}
    <footer><span>{busy?'正在归约':'独立分析 · 不修改折痕'}</span><button className="primary" disabled={busy} onClick={()=>void calculate()}>{busy?'计算中…':'逐步归约'}</button></footer>
  </TessDialog>;
}
