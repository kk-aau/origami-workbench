import {useEffect,useMemo,useRef,useState} from 'react';
import {
  HUFFMAN_CIRCLE4_PRESET,fetchHuffmanCircle4,validateHuffmanCircle4Query,
  type HuffmanCircle4Result,
} from '../app/huffmanCircle4';
import {TessDialog} from './TessellationEditor';
import {download} from '../app/api';
import {CIRCLE4_DIRECT_DEFAULT,readCircle4DirectQuery,fetchCircle4Direct,circle4ParameterFile,readCircle4ParameterFile,type Circle4DirectResult} from '../app/huffmanCircle4Direct';
import './HuffmanCircle4Dialog.css';

type XY=[number,number];
export type HuffmanPairedRow={
  flat:number[][];folded:number[][];flatMirror:number[][];foldedMirror:number[][];
};
type Strip=0|1|2;
const stripColors=['#d8b275','#8fd2bd','#a8a0d3'];

function project(point:number[],space:boolean,azimuth:number):XY{
  if(!space)return [point[0],-point[1]];
  const a=azimuth*Math.PI/180,elevation=.39;
  const x=point[0]*Math.cos(a)-point[1]*Math.sin(a);
  const depth=point[0]*Math.sin(a)+point[1]*Math.cos(a);
  return [x,-depth*Math.sin(elevation)-point[2]*Math.cos(elevation)];
}
function svgPath(points:XY[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(5)} ${y.toFixed(5)}`).join(' ')+' Z';
}
export function HuffmanPairedDrawing({rows,space,azimuth,active}:{rows:HuffmanPairedRow[];
  space:boolean;azimuth:number;active:number}){
  const pair=(mirror:boolean)=>rows.map(row=>(space?
    mirror?row.foldedMirror:row.folded:mirror?row.flatMirror:row.flat)
    .map(point=>project(point,space,azimuth)));
  const blocks=[pair(false),pair(true)];
  const all=blocks.flat(2),xs=all.map(point=>point[0]),ys=all.map(point=>point[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const span=Math.max(maxX-minX,maxY-minY,.1),pad=span*.12;
  const viewBox=`${minX-pad} ${minY-pad} ${Math.max(maxX-minX,.1)+2*pad} ${Math.max(maxY-minY,.1)+2*pad}`;
  const frame=Math.min(active,rows.length-1);
  return <svg data-testid={space?'huffman-circle4-3d':'huffman-circle4-2d'}
    role="img" aria-label={space?'Huffman 对镜双块的三维正交投影':'Huffman 对镜双块的二维展开'}
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    {blocks.map((block,m)=>[0,1,2].map(index=>{
      const strip=index as Strip;
      return <g key={`${m}-${strip}`}>
        {block.slice(0,-1).map((row,i)=><path key={i}
          d={svgPath([row[strip],row[strip+1],block[i+1][strip+1],block[i+1][strip]])}
          fill={stripColors[strip]} fillOpacity={strip===2?.38:.24}
          stroke={stripColors[strip]} strokeOpacity=".32"
          strokeWidth=".008" vectorEffect="non-scaling-stroke"/>)}
        <path d={block.map((row,i)=>`${i?'L':'M'}${row[strip][0]} ${row[strip][1]}`).join(' ')}
          fill="none" stroke={stripColors[strip]} strokeWidth={strip===2?1.8:1.3}
          vectorEffect="non-scaling-stroke"/>
      </g>;
    }))}
    {blocks.map((block,m)=><g key={`active-${m}`}>
      {[0,1,2].map(index=><line key={index} className="huffman-active"
        x1={block[frame][index][0]} y1={block[frame][index][1]}
        x2={block[frame][index+1][0]} y2={block[frame][index+1][1]}
        vectorEffect="non-scaling-stroke"/>)}
    </g>)}
  </svg>;
}

/** Saved paired drawing only. The third spatial ruling is deliberately not isometric. */
export default function HuffmanCircle4Dialog({onClose}:{onClose:()=>void}){
  const [divisions,setDivisions]=useState(String(HUFFMAN_CIRCLE4_PRESET.divisions));
  const [mode,setMode]=useState<'saved'|'direct'>('saved'),[argumentsDeg,setArgumentsDeg]=useState(CIRCLE4_DIRECT_DEFAULT.parametersDeg.map(String));
  const file=useRef<HTMLInputElement>(null);
  const [result,setResult]=useState<HuffmanCircle4Result|Circle4DirectResult|null>(null);
  const [status,setStatus]=useState<'checking'|'ready'|'invalid'|'error'>('checking');
  const [error,setError]=useState('');
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-37);
  const generation=useRef(0);
  const validation=useMemo(()=>{
    try{
      if(!divisions.trim())throw Error('请填写采样段数。');
      if(mode==='direct'&&argumentsDeg.some(x=>!x.trim()))throw Error('请完整填写四个度数参数。');
      return {query:mode==='direct'?readCircle4DirectQuery({family:'huffman-circle4-in4072',mode:'direct-four-arguments',parametersDeg:argumentsDeg.map(Number),divisions:Number(divisions)}):validateHuffmanCircle4Query({family:'huffman-circle4-in4072',divisions:Number(divisions)}),error:''};
    }catch(cause){return {query:null,error:(cause as Error).message};}
  },[divisions,mode,argumentsDeg]);
  useEffect(()=>{
    if(!validation.query){setResult(null);setStatus('invalid');setError(validation.error);return;}
    const id=++generation.current,controller=new AbortController(),query=validation.query;
    setResult(null);setStatus('checking');setError('');
    const timer=window.setTimeout(()=>{
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]);
      const pending='mode' in query?fetchCircle4Direct(query,signal):fetchHuffmanCircle4(query,signal);
      pending.then(next=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setResult(next);setStatus('ready');setActive(0);
      }).catch(cause=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setStatus('error');setError((cause as Error).message||'Huffman 保存例查询失败。');
      });
    },120);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[validation]);
  const edit=(value:string)=>{++generation.current;setDivisions(value);setResult(null);};
  const direct=result?.family==='origamica-huffman-circle4-direct'?result:null;
  const root=result&&'localRootDeg' in result.closure?result.closure.localRootDeg:null;
  const row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)];
  const load=async(input:File)=>{++generation.current;setResult(null);try{const q=readCircle4ParameterFile(JSON.parse(await input.text()));setMode('direct');setDivisions(String(q.divisions));setArgumentsDeg(q.parametersDeg.map(String));setError('');}catch(e){setStatus('invalid');setError((e as Error).message);}};
  return <TessDialog title="第 45 节 · Huffman 六角尖角柱" onClose={onClose}>
    <div className="huffman-circle4-dialog" data-input-mode={mode}>
      <aside className="huffman-controls">
        <div className="huffman-overline"><span>{mode==='direct'?'4070 / FOUR ARGUMENTS':'4072 / SAVED DRAWING'}</span>
          <button type="button" onClick={()=>edit(String(HUFFMAN_CIRCLE4_PRESET.divisions))}>恢复保存采样</button></div>
        <label className="huffman-field">构造输入<select aria-label="HCwCCircle4 构造输入" value={mode} onChange={e=>{++generation.current;setResult(null);setMode(e.target.value as 'saved'|'direct');}}><option value="saved">In[4071] 保存闭合例</option><option value="direct">In[4070] 原四参数直接构造</option></select></label>
        <h3>对镜双块，<br/>平面与空间。</h3>
        <p>{mode==='direct'?'四个度数参数直接代入原一致性和Darboux方程。修改即重算；不会自动求闭合根。':'按原版半径 4 圆构造方程计算闭合参数，再并排查看展开图与三维绘图。这里复现保存的绘图流程。'}</p>
        {mode==='direct'&&<><div className="huffman-argument-grid">{['第一锥端点 t₁ °','第二锥起点 t₂ °','首折角 γ₁ °','次折角 γ₂ °'].map((label,i)=><label className="huffman-field" key={label}>{label}<input type="number" step="0.1" aria-label={`HCwCCircle4 ${label}`} value={argumentsDeg[i]} onChange={e=>{++generation.current;setResult(null);setArgumentsDeg(argumentsDeg.map((x,k)=>k===i?e.target.value:x));}}/></label>)}</div><div className="huffman-parameter-storage"><button disabled={!validation.query||!('mode' in validation.query)} onClick={()=>{if(validation.query&&'mode' in validation.query)download(JSON.stringify(circle4ParameterFile(readCircle4DirectQuery(validation.query)),null,2),'HCwCCircle4-四参数.json');}}>保存参数JSON</button><button onClick={()=>file.current?.click()}>载入参数JSON</button><input ref={file} hidden type="file" accept=".json,application/json" aria-label="HCwCCircle4 四参数文件" onChange={e=>{const f=e.target.files?.[0];if(f)void load(f);e.target.value='';}}/></div></>}
        <label className="huffman-field">采样段数
          <input aria-label="Huffman 采样段数" type="number" min="8" max="64" step="1"
            value={divisions} onChange={event=>edit(event.target.value)}/></label>
        <div className="huffman-sample-kind">{mode==='direct'?(validation.query?.divisions===25?'25 段：沿用原图采样数；四参数为当前输入':'8–64 段：当前四参数的本地受限采样'):validation.query?.divisions===25?
          '25 段：原版 In[4072] 保存输入':
          '8–64 段：本地受限重采样；原版只保存 25 段输入'}</div>
        <label className="huffman-position" htmlFor="huffman-position">当前母线
          <strong>{row?`${active} / ${result!.query.divisions} · t=${(row.t/Math.PI).toFixed(3)}π`:'等待采样'}</strong></label>
        <input id="huffman-position" className="huffman-range" type="range" min="0"
          max={Math.max(0,(result?.sample.rows.length??1)-1)}
          value={Math.min(active,Math.max(0,(result?.sample.rows.length??1)-1))}
          onChange={event=>setActive(Number(event.target.value))} disabled={!result}/>
        <div className={`huffman-status ${status}`} role={status==='invalid'||status==='error'?'alert':'status'}
          aria-live="polite">{status==='ready'?(direct?'原四参数与全部17项已独立回读；未要求闭合。':'四个保存闭合条件的本地数值残差已核查。'):
            status==='checking'?(mode==='direct'?'正在计算四参数构造和17项…':'正在求解闭合条件和成对绘图…'):error}</div>
        {result&&!direct&&<div className="huffman-root"><span>本地数值根 · 度</span>
          <code>{root?.slice(0,2).map(value=>value.toFixed(5)).join(' / ')}<br/>
            {root?.slice(2).map(value=>value.toFixed(5)).join(' / ')}</code>
          <span>最大闭合残差 {result.closure.maximumAbsoluteResidual.toExponential(2)}</span></div>}
        {direct&&<div className="huffman-direct-residual">原四条件残差 {direct.closure.maximumAbsoluteResidual.toExponential(3)} · 未强制归零</div>}
        <div className="huffman-source">{mode==='direct'?'原版 In[4070] · 四数值参数 · 原式单位':'原版 In[4070] / [4071] / [4072]'}
          <span>{mode==='direct'?'按当前四参数数值重建，17项为采样表示；非Wolfram函数或数值Out。':'保存的是初猜和绘图输入，无可机读的数值 Out；不认证根唯一。'}</span></div>
      </aside>
      <main className="huffman-results">
        <div className="huffman-head"><div><span>PAIRED RULED SURFACES / 只读对照</span>
          <strong>展开绘图 ↔ 空间绘图</strong></div><code>第三母线 +10⁻⁶</code></div>
        <div className="huffman-panels">
          <section className="huffman-panel"><header><span>01 / PLANE</span><strong>二维对镜双块</strong></header>
            {result?<HuffmanPairedDrawing rows={result.sample.rows} space={false} azimuth={azimuth} active={active}/>:
              <div className="huffman-empty">等待二维采样</div>}
            <p>三片直纹带 · 对镜半转</p></section>
          <section className="huffman-panel"><header><span>02 / SPACE</span><strong>三维正交投影</strong></header>
            {result?<HuffmanPairedDrawing rows={result.sample.rows} space azimuth={azimuth} active={active}/>:
              <div className="huffman-empty">等待三维采样</div>}
            <label className="huffman-azimuth">视角
              <input aria-label="Huffman 三维视角方位角" type="range" min="-180" max="180"
                value={azimuth} onChange={event=>setAzimuth(Number(event.target.value))}/>
              <b>{azimuth}°</b></label></section>
        </div>
        <div className="huffman-legend"><span><i className="strip-one"/>第一片</span>
          <span><i className="strip-two"/>第二片</span><span><i className="strip-three"/>第三片</span>
          <span><i className="active"/>当前母线</span></div>
        <div className="huffman-cert"><strong>只读 · 不可采用为折痕图</strong><span>
          原版为避免零宽第三片，在空间第三母线长度上固定增加 10⁻⁶；平面与空间整块因此不精确等距。未验证连续部署、自碰撞或厚纸。</span></div>
        <footer className="huffman-footer"><span>{mode==='direct'?'0<t₁<t₂<90°，0<γ₁<180°，−180<γ₂<0°；原NumericQ其他域未实现。':'局部数值根仅用于复现绘图，不是原版 Wolfram 数值 Out。'}</span>
          {mode==='direct'&&<button disabled={!direct} onClick={()=>download(JSON.stringify(direct,null,2),'HCwCCircle4-原17项.json')}>导出原17项JSON</button>}
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
