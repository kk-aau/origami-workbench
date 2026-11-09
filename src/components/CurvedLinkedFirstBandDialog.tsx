import {useEffect,useMemo,useRef,useState} from 'react';
import {fetchLinkedFirstBand,LINKED_FIRST_BAND_PRESET,
  validateLinkedFirstBandQuery,type LinkedFirstBandResult,type LinkedFirstBandQuery,
  type LinkedFirstBandRow} from '../app/curvedLinkedFirstBand';
import {fetchLinkedZeroChain,validateLinkedZeroChainQuery,
  type LinkedZeroChainResult,type LinkedZeroChainRow,type LinkedZeroChainQuery} from '../app/curvedLinkedZeroChain';
import {fetchP45LinkedChain,validateP45LinkedChainQuery,
  type P45LinkedChainResult,type P45LinkedChainRow,type P45LinkedChainQuery} from '../app/curvedP45LinkedChain';
import {TessDialog} from './TessellationEditor';
import {download} from '../app/api';
import CurvedLinkedNDSolveControls from './CurvedLinkedNDSolveControls';
import {linkedStepOptionsFromFields} from '../app/curvedLinkedNDSolveOptions';

import './HuffmanCircle4Dialog.css';
import './CurvedLinkedFirstBandDialog.css';
import CurvedLinkedCommonParameterDialog from './CurvedLinkedCommonParameterDialog';

type XY=[number,number];
function project(point:number[],space:boolean,azimuth:number):XY{
  if(!space)return [point[0],-point[1]];
  const angle=azimuth*Math.PI/180,elevation=.39;
  const horizontal=point[0]*Math.cos(angle)-point[1]*Math.sin(angle);
  const depth=point[0]*Math.sin(angle)+point[1]*Math.cos(angle);
  return [horizontal,-depth*Math.sin(elevation)-point[2]*Math.cos(elevation)];
}
function path(points:XY[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(9)} ${y.toPrecision(9)}`).join(' ');
}
function LinkedBandDrawing({rows,space,azimuth,active}:{rows:LinkedFirstBandRow[];
  space:boolean;azimuth:number;active:number}){
  const first=rows.map(row=>project(space?row.foldedFirst:row.flatFirst,space,azimuth));
  const second=rows.map(row=>project(space?row.foldedSecond:row.flatSecond,space,azimuth));
  const points=[...first,...second],xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs),minY=Math.min(...ys);
  const width=Math.max(...xs)-minX,height=Math.max(...ys)-minY;
  const pad=.1*Math.max(width,height,.1);
  const viewBox=`${minX-pad} ${minY-pad} ${Math.max(width,.1)+2*pad} ${Math.max(height,.1)+2*pad}`;
  const step=Math.max(1,Math.round((rows.length-1)/12));
  const selected=Math.min(active,rows.length-1);
  return <svg data-testid={space?'linked-first-band-3d':'linked-first-band-2d'}
    role="img" aria-label={space?'同心圆首条直纹带三维正交投影':'同心圆首条直纹带二维展开'}
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    <path d={`${path(first)} ${path(second.slice().reverse()).replace(/^M/,'L')} Z`}
      fill="#8fd2bd" fillOpacity=".27" stroke="none"/>
    {first.map((point,i)=>i===rows.length-1||i%step===0?<line key={i}
      x1={point[0]} y1={point[1]} x2={second[i][0]} y2={second[i][1]}
      stroke="#7eaa9c" strokeOpacity=".65" strokeWidth="1"
      vectorEffect="non-scaling-stroke"/>:null)}
    <path d={path(first)} fill="none" stroke="#d8b275" strokeWidth="2"
      vectorEffect="non-scaling-stroke"/>
    <path d={path(second)} fill="none" stroke="#8fd2bd" strokeWidth="2"
      vectorEffect="non-scaling-stroke"/>
    <line className="huffman-active" x1={first[selected][0]} y1={first[selected][1]}
      x2={second[selected][0]} y2={second[selected][1]}
      vectorEffect="non-scaling-stroke"/>
  </svg>;
}

function LinkedChainDrawing({rows,space,azimuth,active,saved=false,showSavedPatches=true}:{
  rows:LinkedZeroChainRow[]|P45LinkedChainRow[];space:boolean;azimuth:number;
  active:number;saved?:boolean;showSavedPatches?:boolean}){
  const curves=Array.from({length:5},(_,index)=>rows.map(row=>
    project(space?row.foldedCurves[index]:row.flatCurves[index],space,azimuth)));
  const points=curves.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs),minY=Math.min(...ys);
  const width=Math.max(...xs)-minX,height=Math.max(...ys)-minY;
  const pad=.1*Math.max(width,height,.1);
  const viewBox=`${minX-pad} ${minY-pad} ${Math.max(width,.1)+2*pad} ${Math.max(height,.1)+2*pad}`;
  const colors=['#d8b275','#8fd2bd','#a8a0d3','#e9a991','#b2d8a0'];
  const selected=Math.min(active,rows.length-1);
  const step=Math.max(1,Math.round((rows.length-1)/12));
  const rulingCount=Math.min(rows.length,51);
  const savedRulings=new Set(Array.from({length:rulingCount},(_,i)=>
    Math.round(i*(rows.length-1)/(rulingCount-1))));
  return <svg data-testid={`${saved?'p45-linked-chain':'linked-zero-chain'}-${space?'3d':'2d'}`}
    role="img" aria-label={saved?(space?'保存输入五曲线与直纹面三维数值投影':'保存输入五曲线与直纹面二维数值图'):
      (space?'零扰动四条直纹带三维正交投影':'零扰动四条直纹带二维展开')}
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    {(!saved||showSavedPatches)&&curves.slice(0,4).map((curve,index)=><path
      key={`band-${index}`} data-testid={saved?`p45-ruled-patch-${index}`:undefined}
      d={`${path(curve)} ${path(curves[index+1].slice().reverse()).replace(/^M/,'L')} Z`}
      fill={colors[index]} fillOpacity={saved?(index%2===0?0.15:0.11):(index%2===0?0.23:0.16)}
      stroke="none"/>)}
    {curves.slice(0,4).map((curve,index)=>curve.map((point,i)=>
      (saved?savedRulings.has(i):i===rows.length-1||i%step===0)&&
        (!saved||showSavedPatches)?<line key={`${index}-${i}`}
        x1={point[0]} y1={point[1]} x2={curves[index+1][i][0]} y2={curves[index+1][i][1]}
        stroke="#a9b7ad" strokeOpacity={saved?0.19:0.4} strokeDasharray={saved?'3 3':undefined}
        strokeWidth={saved?0.7:1} vectorEffect="non-scaling-stroke"/>:null))}
    {curves.map((curve,index)=><path key={`curve-${index}`} d={path(curve)}
      fill="none" stroke={colors[index]} strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}
    {(!saved||showSavedPatches)&&curves.slice(0,4).map((curve,index)=><line key={`active-${index}`}
      className="huffman-active" x1={curve[selected][0]} y1={curve[selected][1]}
      x2={curves[index+1][selected][0]} y2={curves[index+1][selected][1]}
      vectorEffect="non-scaling-stroke"/>)}
  </svg>;
}

/** Three explicitly separated scopes of the linked-circle notebook example. */
export default function CurvedLinkedFirstBandDialog({onClose}:{onClose:()=>void}){
  const [mode,setMode]=useState<'saved'|'saved-chain'|'zero-chain'|'common-parameter'>('saved');
  const [segments,setSegments]=useState(String(LINKED_FIRST_BAND_PRESET.segments));
  const [interpolationPoints,setInterpolationPoints]=useState('32');
  const [stepFields,setStepFields]=useState({stepMaxSteps:'',stepMaxSize:''}),sourceFile=useRef<HTMLInputElement>(null);
  const [result,setResult]=useState<LinkedFirstBandResult|LinkedZeroChainResult|
    P45LinkedChainResult|null>(null);
  const [status,setStatus]=useState<'checking'|'ready'|'invalid'|'error'>('checking');
  const [retry,setRetry]=useState(0);
  const [error,setError]=useState(''),[active,setActive]=useState(0),
    [azimuth,setAzimuth]=useState(-35),[showSavedPatches,setShowSavedPatches]=useState(true);
  const generation=useRef(0);
  const validation=useMemo<{query:LinkedFirstBandQuery|P45LinkedChainQuery|LinkedZeroChainQuery|null;error:string}>(()=>{
    try{
      if(mode==='common-parameter')return {query:null,error:''};
      if(!segments.trim())throw Error('请填写本地采样段数。');
      if(mode==='saved-chain'&&!interpolationPoints.trim())
        throw Error('请填写本地插值区间数。');
      const options=mode==='zero-chain'?undefined:linkedStepOptionsFromFields(stepFields.stepMaxSteps,stepFields.stepMaxSize,Math.PI);
      const value=mode==='saved'?{family:'linked-concentric-first-band',segments:Number(segments)}:
        mode==='saved-chain'?{family:'linked-concentric-first-band',variant:mode,
          segments:Number(segments),interpolationPoints:Number(interpolationPoints)}:
          {family:'linked-concentric-first-band',variant:mode,segments:Number(segments)};
      const withSteps={...value,...(options?{ndsolveOptions:options}:{})};
      return {query:mode==='saved'?validateLinkedFirstBandQuery(withSteps):
        mode==='saved-chain'?validateP45LinkedChainQuery(withSteps):
          validateLinkedZeroChainQuery(withSteps),error:''};
    }catch(cause){return {query:null,error:(cause as Error).message};}
  },[mode,segments,interpolationPoints,stepFields]);
  useEffect(()=>{
    if(!validation.query){setResult(null);setStatus('invalid');setError(validation.error);return;}
    const id=++generation.current,controller=new AbortController(),query=validation.query;
    setResult(null);setStatus('checking');setError('');
    const timer=window.setTimeout(()=>{
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]);
      const request=(async()=>{
        for(let attempt=0;;attempt++){
          try{return await ('variant' in query?
            query.variant==='saved-chain'?fetchP45LinkedChain(query,signal):
              fetchLinkedZeroChain(query,signal):fetchLinkedFirstBand(query,signal));}
          catch(cause){
            if(attempt>=19||signal.aborted||
              !(cause as Error).message.includes('已有镶嵌计算正在进行'))throw cause;
            await new Promise(resolve=>window.setTimeout(resolve,300));
          }
        }
      })();
      request.then(next=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setResult(next);setStatus('ready');setActive(0);
      }).catch(cause=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setStatus('error');setError((cause as Error).message||'关联同心圆查询失败。');
      });
    },120);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[validation,retry]);
  const edit=(value:string)=>{++generation.current;setSegments(value);setResult(null);};
  const editInterpolation=(value:string)=>{
    ++generation.current;setInterpolationPoints(value);setResult(null);
  };
  const switchMode=(value:'saved'|'saved-chain'|'zero-chain'|'common-parameter')=>{
    ++generation.current;setStepFields({stepMaxSteps:'',stepMaxSize:''});setMode(value);setSegments(value==='saved-chain'?'100':'32');
    setResult(null);
  };
  const row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)];
  const chain=result?.family==='linked-concentric-zero-chain'?result:null;
  const five=result?.family==='linked-concentric-saved-chain'?result:null;
  const first=result?.family==='linked-concentric-first-band'?result:null;
  if(mode==='common-parameter')return <CurvedLinkedCommonParameterDialog onClose={onClose}
    onReference={()=>switchMode('saved-chain')}/>;
  return <TessDialog title="第 45 节 · 关联同心圆" onClose={onClose}>
    <div className="huffman-circle4-dialog">
      <aside className="huffman-controls">
        <div className="huffman-overline"><span>LINKED CONCENTRIC FOLDS</span>
          <button type="button" onClick={()=>{
            edit(mode==='saved-chain'?'100':'32');setInterpolationPoints('32');
            setStepFields({stepMaxSteps:'',stepMaxSize:''});setShowSavedPatches(true);setRetry(value=>value+1);
          }}>恢复本地设置</button></div>
        <h3>{mode==='saved'?'保存输入首带':mode==='saved-chain'?'保存五曲线':'零扰动四带'}，<br/>两种视图。</h3>
        <p>{mode==='saved'?'原版五折保存例的第一对同心圆，保留 q₁=s+0.1 sin(2s)。':
          mode==='saved-chain'?(interpolationPoints==='32'?
            '按原式以默认 32 区间的本地四次样条绘图；可调整插值区间作数值试验，后续带不等距。':
            `按原式以 ${interpolationPoints||'—'} 区间重解；这是改变原默认选项的本地数值试验，后续带不等距。`):
          '将原版 q₁ 的扰动设为 0；源公式此时一致，可构造四条连续等距带片。这不是原保存图。'}</p>
        <label className="huffman-field">构造范围
          <select aria-label="关联同心圆构造范围" value={mode}
            onChange={event=>switchMode(event.target.value as typeof mode)}>
            <option value="saved">原保存输入 · 首带</option>
            <option value="saved-chain">原保存输入 · 五曲线数值图</option>
            <option value="zero-chain">零扰动子域 · 四带</option>
            <option value="common-parameter">共同参数 · 等距多带（可调）</option>
          </select></label>
        <label className="huffman-field">本地采样段数
          <input aria-label="关联首带采样段数" type="number" min="8" max="128" step="1"
            value={segments} onChange={event=>edit(event.target.value)}/></label>
        {mode==='saved-chain'&&<label className="huffman-field">本地插值区间数（原默认 32）
          <input aria-label="五曲线本地插值区间数" type="number" min="8" max="128" step="1"
            value={interpolationPoints}
            onChange={event=>editInterpolation(event.target.value)}/></label>}
        {mode==='saved-chain'&&<label className="huffman-field">
          <input aria-label="显示原版直纹面" type="checkbox" checked={showSavedPatches}
            onChange={event=>setShowSavedPatches(event.target.checked)}/>
          显示原式直纹面（只读、非等距）</label>}
        {(mode==='saved'||mode==='saved-chain')&&<CurvedLinkedNDSolveControls maxSteps={stepFields.stepMaxSteps} maxStepSize={stepFields.stepMaxSize}
          onChange={(key,value)=>{++generation.current;setResult(null);setStatus('checking');setStepFields(x=>({...x,[key]:value}));}}
          integration={result&&'first3DIntegration' in result?result.first3DIntegration:undefined}/>}
        <div className="linked-first3d-storage"><button disabled={!validation.query} onClick={()=>download(JSON.stringify(validation.query,null,2),'关联首First3D参数.json')}>保存参数</button><button onClick={()=>sourceFile.current?.click()}>载入参数</button></div>
        <input hidden ref={sourceFile} type="file" accept=".json,application/json" aria-label="载入关联首First3D参数文件" onChange={async e=>{const selected=e.currentTarget.files?.[0];e.currentTarget.value='';if(!selected)return;++generation.current;setResult(null);setStatus('checking');
          try{if(selected.size>16384)throw Error('参数文件超过16KB。');const raw=JSON.parse(await selected.text()),q=raw.variant==='saved-chain'?validateP45LinkedChainQuery(raw):raw.variant==='zero-chain'?validateLinkedZeroChainQuery(raw):validateLinkedFirstBandQuery(raw);
            setMode('variant' in q?q.variant:'saved');setSegments(String(q.segments));setInterpolationPoints('interpolationPoints' in q?String(q.interpolationPoints??32):'32');
            const options='ndsolveOptions' in q?q.ndsolveOptions:undefined;setStepFields({stepMaxSteps:options?.MaxSteps===undefined?'':String(options.MaxSteps),stepMaxSize:options?.MaxStepSize===undefined?'':String(options.MaxStepSize)});}
          catch(cause){setStatus('error');setError((cause as Error).message);}}}/>
        <label className="huffman-position" htmlFor="linked-band-position">{five?'当前样点':'当前母线'}
          <strong>{row?`${(row.s/Math.PI).toFixed(3)} π`:'—'}</strong></label>
        <input id="linked-band-position" className="huffman-range" type="range" min="0"
          max={result?result.query.segments:32} value={result?Math.min(active,result.query.segments):0}
          disabled={!result} onChange={event=>setActive(Number(event.target.value))}/>
        <div className={`huffman-status ${status}`} role="status">
          {status==='ready'?(chain?'零扰动四带连续等距；全局层序未检查。':
            five?'五曲线仅作有限数值图；第二带不等距。':
              '保存输入首带局部等距；后续带不等距。'):
            status==='checking'?'正在计算关联同心圆…':error}</div>
        {result&&<div className="huffman-root"><span>{five?'本地公式数值诊断':'数值标架最大正交误差'}</span>
          <code>{five?`求根残差 ${five.diagnostics.maxNodeRootResidual.toExponential(2)}`:
            (chain?chain.certification.numericalFrameGramMaxError:
              first!.certification.firstBandNumericalFrameGramMaxError).toExponential(2)}</code>
          <span>{five?`当前 ${five.source.interpolationIntervals} 区间，q₄ 端点外推 ${five.diagnostics.q4EndpointExtrapolation.toFixed(4)} rad；16／32／64 区间下起点分别为 ${five.diagnostics.q4EndpointByIntervals16_32_64.map(pair=>pair[0].toFixed(4)).join('／')}`:
            chain?'四带等距 · 端边重合 · 层序未验':'原保存五折整串未认证'}</span></div>}
        <div className="huffman-source">原版保存输入：第 45 节 339070–340404 行。
          <span>二维／三维采样为本地计算，笔记本未保存可机读点表。</span></div>
      </aside>
      <section className="huffman-results">
        <div className="huffman-head"><div><span>LINKED CONCENTRIC CIRCLES</span>
          <strong>{five?'保存输入五曲线与直纹面':chain?'零扰动四条直纹带':'保存输入首条直纹带'} · 二维／三维</strong></div>
          <code>{chain||five?'R₀…R₄ 1.0…1.4':'R₀ 1.0 · R₁ 1.1'}</code></div>
        <div className="huffman-panels">
          <section className="huffman-panel"><header><span>01 / UNFOLDED</span>
            <strong>二维展开</strong></header>
            {five?<LinkedChainDrawing rows={five.sample.rows} saved
              showSavedPatches={showSavedPatches} space={false}
              azimuth={azimuth} active={active}/>:
              chain?<LinkedChainDrawing rows={chain.sample.rows} space={false}
              azimuth={azimuth} active={active}/>:
              first?<LinkedBandDrawing rows={first.sample.rows} space={false}
                azimuth={azimuth} active={active}/>:<div className="huffman-empty">{status==='checking'?'计算中':'无有效图像'}</div>}
            <p>{five?'fᵢ(s)=(1+0.1i)e(qᵢ(s))；直纹面按源式数值绘制，不代表等距纸面':
              chain?'fᵢ(s)=(1+0.1i)e(s)，i=0…4':'f₀(s)=e(s)；f₁(s)=1.1 e(q₁(s))'}</p></section>
          <section className="huffman-panel"><header><span>02 / FOLDED</span>
            <strong>{five?'三维直纹面投影':'三维直纹带'}</strong></header>
            {five?<LinkedChainDrawing rows={five.sample.rows} saved
              showSavedPatches={showSavedPatches} space
              azimuth={azimuth} active={active}/>:
              chain?<LinkedChainDrawing rows={chain.sample.rows} space
              azimuth={azimuth} active={active}/>:
              first?<LinkedBandDrawing rows={first.sample.rows} space
                azimuth={azimuth} active={active}/>:<div className="huffman-empty">{status==='checking'?'计算中':'无有效图像'}</div>}
            <div className="huffman-azimuth">视角
              <input aria-label="关联首带三维视角" type="range" min="-180" max="180"
                value={azimuth} onChange={event=>setAzimuth(Number(event.target.value))}/>
              <b>{azimuth}°</b></div></section>
        </div>
        <div className="huffman-cert"><strong>严格范围</strong>
          <span>{five?'这是按源式计算的本地四次样条与近零求根分支，不是 Wolfram 保存的数值输出。第二带起测地曲率失配 396/665；五折整体不等距且未认证，不可采用或导出 FOLD。':
            chain?'零扰动子域四带局部等距且接成一纸；端边在三维重合，全局层序与碰撞未认证，不可采用。':
              '保存输入只证明首带局部等距；后续参数与测地曲率失配，五折整体未认证，不生成精确直折痕 FOLD。'}</span></div>
        <div className="huffman-footer"><span>只读分析 · 不修改当前工程</span>
          <button disabled={!result} onClick={()=>download(JSON.stringify(result,null,2),'关联首First3D完整结果.json')}>导出完整结果</button><button type="button" onClick={onClose}>关闭</button></div>
      </section>
    </div>
  </TessDialog>;
}
