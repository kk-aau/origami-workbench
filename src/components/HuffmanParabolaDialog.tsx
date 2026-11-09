import {useEffect,useMemo,useRef,useState} from 'react';
import {
  HUFFMAN_PARABOLA_PRESET,fetchHuffmanParabola,validateHuffmanParabolaQuery,
  type HuffmanParabolaResult,
} from '../app/huffmanParabola';
import {HuffmanPairedDrawing} from './HuffmanCircle4Dialog';
import {TessDialog} from './TessellationEditor';
import {download} from '../app/api';
import {PARABOLA_DIRECT_DEFAULT,readParabolaDirectQuery,fetchParabolaDirect,parabolaParameterFile,readParabolaParameterFile,type ParabolaDirectResult} from '../app/huffmanParabolaDirect';
import './HuffmanCircle4Dialog.css';

/** In[4060] is an unfinished saved drawing, not a closed origami model. */
export default function HuffmanParabolaDialog({onClose}:{onClose:()=>void}){
  const [divisions,setDivisions]=useState(String(HUFFMAN_PARABOLA_PRESET.divisions));
  const [mode,setMode]=useState<'saved'|'direct'>('saved'),[argumentsDeg,setArgumentsDeg]=useState(PARABOLA_DIRECT_DEFAULT.parametersDeg.map(String));
  const file=useRef<HTMLInputElement>(null);
  const [result,setResult]=useState<HuffmanParabolaResult|ParabolaDirectResult|null>(null);
  const [status,setStatus]=useState<'checking'|'ready'|'invalid'|'error'>('checking');
  const [error,setError]=useState('');
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-37);
  const generation=useRef(0);
  const validation=useMemo(()=>{
    try{
      if(!divisions.trim())throw Error('请填写采样段数。');
      if(mode==='direct'&&argumentsDeg.some(x=>!x.trim()))throw Error('请完整填写四个度数参数。');
      return {query:mode==='direct'?readParabolaDirectQuery({family:'huffman-parabola-in4060',mode:'direct-four-arguments',parametersDeg:argumentsDeg.map(Number),divisions:Number(divisions)}):validateHuffmanParabolaQuery({family:'huffman-parabola-in4060',divisions:Number(divisions)}),error:''};
    }catch(cause){return {query:null,error:(cause as Error).message};}
  },[divisions,mode,argumentsDeg]);
  useEffect(()=>{
    if(!validation.query){setResult(null);setStatus('invalid');setError(validation.error);return;}
    const id=++generation.current,controller=new AbortController(),query=validation.query;
    setResult(null);setStatus('checking');setError('');
    const timer=window.setTimeout(()=>{
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]);
      const pending='mode' in query?fetchParabolaDirect(query,signal):fetchHuffmanParabola(query,signal);
      pending.then(next=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setResult(next);setStatus('ready');setActive(0);
      }).catch(cause=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setStatus('error');setError((cause as Error).message||'Huffman 抛物线查询失败。');
      });
    },120);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[validation]);
  const edit=(value:string)=>{++generation.current;setDivisions(value);setResult(null);};
  const direct=result?.family==='origamica-huffman-parabola-direct'?result:null;
  const row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)];
  const load=async(input:File)=>{++generation.current;setResult(null);try{const q=readParabolaParameterFile(JSON.parse(await input.text()));setMode('direct');setDivisions(String(q.divisions));setArgumentsDeg(q.parametersDeg.map(String));setError('');}catch(e){setStatus('invalid');setError((e as Error).message);}};
  return <TessDialog title="第 45 节 · Huffman 共焦抛物线" onClose={onClose}>
    <div className="huffman-circle4-dialog" data-input-mode={mode}>
      <aside className="huffman-controls">
        <div className="huffman-overline"><span>{mode==='direct'?'4058 / PARTLY WORKED OUT':'4060 / PARTLY WORKED OUT'}</span>
          <button type="button" onClick={()=>edit(String(HUFFMAN_PARABOLA_PRESET.divisions))}>恢复保存采样</button></div>
        <label className="huffman-field">构造输入<select aria-label="HCwCParabola 构造输入" value={mode} onChange={e=>{++generation.current;setResult(null);setMode(e.target.value as 'saved'|'direct');}}><option value="saved">In[4060] 原保存输入</option><option value="direct">In[4058] 原四参数直接构造</option></select></label>
        <h3>圆与抛物线，<br/>部分完成。</h3>
        <p>{mode==='direct'?'按当前四参数重算原17项；保留原母线偏移与部分完成状态。':'原版以 5°／85°／60°／−90° 展示三片直纹面。这里按保存输入数值重建，原版没有为它保存闭合求根条件。'}</p>
        {mode==='direct'&&<><div className="huffman-argument-grid">{['第一锥端点 t₁ °','第二锥起点 t₂ °','首折角 γ₁ °','次折角 γ₂ °'].map((label,i)=><label className="huffman-field" key={label}>{label}<input type="number" step="0.1" aria-label={`HCwCParabola ${label}`} value={argumentsDeg[i]} onChange={e=>{++generation.current;setResult(null);setArgumentsDeg(argumentsDeg.map((x,k)=>k===i?e.target.value:x));}}/></label>)}</div><div className="huffman-parameter-storage"><button disabled={!validation.query||!('mode' in validation.query)} onClick={()=>{if(validation.query&&'mode' in validation.query)download(JSON.stringify(parabolaParameterFile(readParabolaDirectQuery(validation.query)),null,2),'HCwCParabola-四参数.json');}}>保存参数JSON</button><button onClick={()=>file.current?.click()}>载入参数JSON</button><input ref={file} hidden type="file" accept=".json,application/json" aria-label="HCwCParabola 四参数文件" onChange={e=>{const f=e.target.files?.[0];if(f)void load(f);e.target.value='';}}/></div></>}
        <label className="huffman-field">采样段数
          <input aria-label="Huffman 抛物线采样段数" type="number" min="8" max="64" step="1"
            value={divisions} onChange={event=>edit(event.target.value)}/></label>
        <div className="huffman-sample-kind">{mode==='direct'?(validation.query?.divisions===25?'25 段：沿用原图采样数；四参数为当前输入':'8–64 段：当前四参数的本地受限采样'):validation.query?.divisions===25?
          '25 段：原版 In[4059] 绘图输入':
          '8–64 段：本地受限重采样；原版只保存 25 段输入'}</div>
        <label className="huffman-position" htmlFor="huffman-parabola-position">当前母线
          <strong>{row?`${active} / ${result!.query.divisions} · t=${(row.t/Math.PI).toFixed(3)}π`:'等待采样'}</strong></label>
        <input id="huffman-parabola-position" className="huffman-range" type="range" min="0"
          max={Math.max(0,(result?.sample.rows.length??1)-1)}
          value={Math.min(active,Math.max(0,(result?.sample.rows.length??1)-1))}
          onChange={event=>setActive(Number(event.target.value))} disabled={!result}/>
        <div className={`huffman-status ${status}`} role={status==='invalid'||status==='error'?'alert':'status'}
          aria-live="polite">{status==='ready'?(direct?'原四参数与全部17项已独立回读；原版仍为部分完成。':'保存参数下的二维／三维样点已计算；无原版闭合条件。'):
            status==='checking'?(mode==='direct'?'正在计算四参数构造和17项…':'正在计算保存输入下的成对绘图…'):error}</div>
        {direct&&<div className="huffman-direct-residual">末端 q(90°)={direct.diagnostics.terminalParabolaParameterDeg.toFixed(6)}° · 非γ₂</div>}
        {result&&!direct&&<div className="huffman-root"><span>本地末端抛物线参数 q(90°)</span>
          <code>{result.diagnostics.terminalParabolaParameterDeg.toFixed(8)}°</code>
          <span>不是折角 γ₂，也不是原版数值 Out。</span></div>}
        <div className="huffman-source">{mode==='direct'?'原版 In[4058] · 四数值参数 · 原式单位':'原版 In[4058] / [4060] / [4069]'}
          <span>原文标为 partially worked out；无机器可读的数值 Out 或抛物线闭合求根条件。</span></div>
      </aside>
      <main className="huffman-results">
        <div className="huffman-head"><div><span>CONFOCAL PARABOLA / 只读对照</span>
          <strong>展开绘图 ↔ 空间绘图</strong></div><code>x + y²/8 = 2</code></div>
        <div className="huffman-panels">
          <section className="huffman-panel"><header><span>01 / PLANE</span><strong>二维对镜双块</strong></header>
            {result?<HuffmanPairedDrawing rows={result.sample.rows} space={false}
              azimuth={azimuth} active={active}/>:
              <div className="huffman-empty">等待二维采样</div>}
            <p>单位圆与共焦抛物线 · 三片直纹带</p></section>
          <section className="huffman-panel"><header><span>02 / SPACE</span><strong>三维正交投影</strong></header>
            {result?<HuffmanPairedDrawing rows={result.sample.rows} space
              azimuth={azimuth} active={active}/>:
              <div className="huffman-empty">等待三维采样</div>}
            <label className="huffman-azimuth">视角
              <input aria-label="Huffman 抛物线三维视角方位角" type="range" min="-180" max="180"
                value={azimuth} onChange={event=>setAzimuth(Number(event.target.value))}/>
              <b>{azimuth}°</b></label></section>
        </div>
        <div className="huffman-legend"><span><i className="strip-one"/>第一片</span>
          <span><i className="strip-two"/>第二片</span><span><i className="strip-three"/>第三片</span>
          <span><i className="active"/>当前母线</span></div>
        <div className="huffman-cert"><strong>部分完成 · 只读 · 不可采用</strong><span>
          原版在空间第三母线固定增加 10⁻⁶，整块因此不是精确等距纸面；也没有抛物线版闭合条件或连续部署、自碰撞证明。</span></div>
        <footer className="huffman-footer"><span>{mode==='direct'?'17项为采样表示；0<t₁<t₂<90°，0<γ₁<180°，−180<γ₂<0°；原NumericQ其他域未实现。':'本地数值重建仅供核对保存绘图输入。'}</span>
          {mode==='direct'&&<button disabled={!direct} onClick={()=>download(JSON.stringify(direct,null,2),'HCwCParabola-原17项.json')}>导出原17项JSON</button>}
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
