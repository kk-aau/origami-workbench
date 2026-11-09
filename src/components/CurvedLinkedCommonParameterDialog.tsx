import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {fetchLinkedCommon,LINKED_COMMON_PRESET,validateLinkedCommonQuery,
  type LinkedCommonQuery,type LinkedCommonResult,type LinkedCommonRow} from '../app/curvedLinkedCommonParameter';
import {TessDialog} from './TessellationEditor';
import CurvedLinkedNDSolveControls from './CurvedLinkedNDSolveControls';
import {linkedStepOptionsFromFields} from '../app/curvedLinkedNDSolveOptions';

import './HuffmanCircle4Dialog.css';
import './CurvedLinkedCommonParameterDialog.css';
import CurvedGenericLinkedDialog from './CurvedGenericLinkedDialog';

const makeFields=(q:LinkedCommonQuery)=>({radii:q.radii.join(', '),harmonics:q.q1Harmonics.join(', '),
  angle:String(q.firstFoldAngleDeg),start:String(q.parameterStart),end:String(q.parameterEnd),segments:String(q.segments),
  stepMaxSteps:q.ndsolveOptions?.MaxSteps===undefined?'':String(q.ndsolveOptions.MaxSteps),stepMaxSize:q.ndsolveOptions?.MaxStepSize===undefined?'':String(q.ndsolveOptions.MaxStepSize)});
const numbers=(text:string)=>{
  const parts=text.split(/[,，;；]/).map(x=>x.trim());
  if(parts.some(x=>!x))throw Error('数值列表中不能有空项。');return parts.map(Number);
};
const colors=['#d8b275','#8fd2bd','#a8a0d3','#e9a991','#b2d8a0','#88b9dd'];
export function LinkedCommonDrawing({rows,space,azimuth,active}:{rows:LinkedCommonRow[];space:boolean;azimuth:number;active:number}){
  const theta=azimuth*Math.PI/180;
  const project=(p:number[])=>space?[Math.cos(theta)*p[0]-Math.sin(theta)*p[1],
    -.58*(Math.sin(theta)*p[0]+Math.cos(theta)*p[1])-.815*p[2]]:[p[0],-p[1]];
  const curves=rows[0].qValues.map((_,i)=>rows.map(r=>project((space?r.foldedCurves:r.flatCurves)[i])));
  const pts=curves.flat(),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),left=Math.min(...xs),top=Math.min(...ys),
    width=Math.max(...xs)-left,height=Math.max(...ys)-top,pad=.07*Math.max(width,height,.1);
  const path=(curve:number[][])=>curve.map((p,i)=>`${i?'L':'M'}${p[0]},${p[1]}`).join(' ');
  const index=Math.min(active,rows.length-1),step=Math.max(1,Math.ceil(rows.length/16));
  return <svg role="img" aria-label={space?'共同参数全部关联带三维正交投影':'共同参数全部关联带二维纸面'}
    data-testid={`linked-common-${space?'3d':'2d'}`} viewBox={`${left-pad} ${top-pad} ${width+2*pad} ${height+2*pad}`}>
    {curves.slice(0,-1).map((curve,i)=><path key={`patch-${i}`} data-testid={`linked-common-${space?'3d':'2d'}-band-${i}`}
      d={`${path(curve)} ${path(curves[i+1].slice().reverse()).replace(/^M/,'L')} Z`}
      fill={colors[i]} fillOpacity=".24" stroke="none"/>)}
    {curves.slice(0,-1).map((curve,i)=>curve.map((p,j)=>j%step===0||j===rows.length-1?
      <line key={`ruling-${i}-${j}`} x1={p[0]} y1={p[1]} x2={curves[i+1][j][0]} y2={curves[i+1][j][1]}
        stroke="#adc2b6" strokeOpacity=".3" strokeWidth=".7" vectorEffect="non-scaling-stroke"/>:null))}
    {curves.map((curve,i)=><path key={`curve-${i}`} d={path(curve)} fill="none" stroke={colors[i]}
      strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>)}
    {curves.slice(0,-1).map((curve,i)=><line key={`active-${i}`} className="huffman-active"
      x1={curve[index][0]} y1={curve[index][1]} x2={curves[i+1][index][0]} y2={curves[i+1][index][1]}
      vectorEffect="non-scaling-stroke"/>)}
  </svg>;
}

function ConcentricLinkedDialog({onClose,onReference,onGeneric}:{onClose:()=>void;onReference:()=>void;onGeneric:()=>void}){
  const [fields,setFields]=useState(()=>makeFields(LINKED_COMMON_PRESET)),[result,setResult]=useState<LinkedCommonResult|null>(null);
  const [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),
    [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35),[importError,setImportError]=useState('');
  const generation=useRef(0),file=useRef<HTMLInputElement>(null);
  const input=useMemo(()=>{
    try{
      if(Object.entries(fields).some(([k,x])=>!['stepMaxSteps','stepMaxSize'].includes(k)&&!x.trim()))throw Error('请填写全部参数。');
      const options=linkedStepOptionsFromFields(fields.stepMaxSteps,fields.stepMaxSize,Number(fields.end)-Number(fields.start));
      return {query:validateLinkedCommonQuery({...LINKED_COMMON_PRESET,radii:numbers(fields.radii),
        q1Harmonics:numbers(fields.harmonics),firstFoldAngleDeg:Number(fields.angle),
        parameterStart:Number(fields.start),parameterEnd:Number(fields.end),segments:Number(fields.segments),...(options?{ndsolveOptions:options}:{})}),error:''};
    }catch(cause){return {query:null,error:(cause as Error).message};}
  },[fields]);
  useEffect(()=>{
    const id=++generation.current,controller=new AbortController();setResult(null);setActive(0);setError('');
    if(!input.query){setStatus('error');setError(input.error);return;}
    setStatus('checking');const query=input.query;
    const timer=window.setTimeout(async()=>{
      try{
        const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]);
        let next:LinkedCommonResult;
        for(let attempt=0;;attempt++){
          try{next=await fetchLinkedCommon(query,signal);break;}
          catch(cause){if(attempt>=30||signal.aborted||!(cause as Error).message.includes('已有镶嵌计算正在进行'))throw cause;
            await new Promise(resolve=>window.setTimeout(resolve,200));}
        }
        if(id!==generation.current||controller.signal.aborted)return;setResult(next!);setStatus('ready');
      }catch(cause){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((cause as Error).message);}
    },150);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[input]);
  const edit=(key:keyof typeof fields,value:string)=>{
    ++generation.current;setResult(null);setStatus('checking');setImportError('');setFields(previous=>({...previous,[key]:value}));
  };
  const restore=()=>{++generation.current;setResult(null);setStatus('checking');setFields(makeFields(LINKED_COMMON_PRESET));
    setAzimuth(-35);setActive(0);setImportError('');};
  const row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)];
  return <TessDialog title="第 45 节 · 共同参数关联多带" onClose={onClose}>
    <div className="huffman-circle4-dialog linked-common-dialog">
      <aside className="huffman-controls">
        <div className="huffman-overline"><span>COMMON PARAMETER</span><button onClick={restore}>恢复原保存输入</button></div>
        <label className="huffman-field">构造范围<select aria-label="关联同心圆构造范围" value="common-parameter"
          onChange={event=>{if(event.target.value==='saved-chain')onReference();if(event.target.value==='generic-common-parameter')onGeneric();}}>
          <option value="common-parameter">共同参数 · 等距多带</option>
          <option value="generic-common-parameter">通用原生曲线 · 关联多带</option>
          <option value="saved-chain">原调用复放 · 五曲线参考</option></select></label>
        <p>同心曲线族，2–5 条带；q₁=s+Σaₖ sin(2ks)。保留全部输入曲线，纠正原式参数传递。</p>
        <label className="huffman-field">递增半径（逗号分隔）<input aria-label="共同参数半径" value={fields.radii} onChange={e=>edit('radii',e.target.value)}/></label>
        <label className="huffman-field">q₁ 扰动系数 a₁…a₃<input aria-label="共同参数扰动系数" value={fields.harmonics} onChange={e=>edit('harmonics',e.target.value)}/></label>
        <div className="linked-common-fields"><label className="huffman-field">初始折角 °<input aria-label="共同参数初始折角" type="number" value={fields.angle} onChange={e=>edit('angle',e.target.value)}/></label>
          <label className="huffman-field">显示段数<input aria-label="共同参数显示段数" type="number" min="8" max="128" value={fields.segments} onChange={e=>edit('segments',e.target.value)}/></label>
          <label className="huffman-field">s 起点<input aria-label="共同参数起点" type="number" step=".05" value={fields.start} onChange={e=>edit('start',e.target.value)}/></label>
          <label className="huffman-field">s 终点<input aria-label="共同参数终点" type="number" step=".05" value={fields.end} onChange={e=>edit('end',e.target.value)}/></label></div>
        <CurvedLinkedNDSolveControls maxSteps={fields.stepMaxSteps} maxStepSize={fields.stepMaxSize} onChange={edit} integration={result?.first3DIntegration}/>
        <div className={`huffman-status ${status}`} role="status" data-testid="linked-common-status">
          {status==='error'?error:status==='ready'&&result?
            `${result.certification.bandCount} 带等距；全区间正则与二维纸面通过验证。`:'正在验证全区间并计算全部带…'}</div>
        <div className="huffman-root" data-testid="linked-common-diagnostics">
          <span>{result?(result.source.savedPhysicalInputsPreserved?'原保存物理输入 · 参数合同已纠正':'同族参数变体 · 参数合同已纠正'):'等待当前参数验证'}</span>
          <code>度量误差 {result?result.diagnostics.maxMetricError.toExponential(2):'—'}</code>
          <span>全区间 q′ ≥ {result?result.diagnostics.parameterDomain.minimumSpeedLowerBound.toFixed(4):'—'}；横向 ≥ {result?result.diagnostics.parameterDomain.minimumTransverseLowerBound.toFixed(4):'—'}</span>
          <span>γ₁(起点) = {result?result.sample.rows[0].foldAnglesDeg[1].toFixed(6):'—'}°</span></div>
        <label className="huffman-position">当前母线 <strong>{row?row.s.toFixed(4):'—'}</strong></label>
        <input aria-label="共同参数当前母线" className="huffman-range" type="range" min="0" max={result?.query.segments??32}
          disabled={!result} value={result?Math.min(active,result.query.segments):0} onChange={e=>setActive(Number(e.target.value))}/>
        <div className="linked-common-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'关联多带参数.json')}>保存参数</button>
          <button onClick={()=>file.current?.click()}>载入参数</button><input ref={file} type="file" accept=".json,application/json"
            aria-label="载入关联多带参数文件" hidden onChange={async e=>{
              const selected=e.target.files?.[0];e.target.value='';if(!selected)return;
              try{if(selected.size>8192)throw Error('参数文件过大。');const q=validateLinkedCommonQuery(JSON.parse(await selected.text()));
                ++generation.current;setResult(null);setStatus('checking');setFields(makeFields(q));setImportError('');}
              catch(cause){setImportError((cause as Error).message);}
            }}/></div>
        {importError&&<span className="linked-common-import-error" role="alert">{importError}</span>}
      </aside>
      <section className="huffman-results">
        <div className="huffman-head"><div><span>LINKED RULED STRIPS</span><strong>连续曲折纸面 · 全部关联带</strong></div>
          <code>{result?`${result.query.radii.length} 曲线 / ${result.certification.bandCount} 带`:'等待验证'}</code></div>
        <div className="huffman-panels">
          <section className="huffman-panel"><header><span>01 / UNFOLDED</span><strong>二维纸面</strong></header>
            {result?<LinkedCommonDrawing rows={result.sample.rows} space={false} azimuth={azimuth} active={active}/>:<div className="huffman-empty">{status==='checking'?'验证中':'无有效图像'}</div>}
            <p>颜色标识相邻直纹带；曲线与母线使用同一参数。</p></section>
          <section className="huffman-panel"><header><span>02 / FOLDED</span><strong>三维正交投影</strong></header>
            {result?<LinkedCommonDrawing rows={result.sample.rows} space azimuth={azimuth} active={active}/>:<div className="huffman-empty">{status==='checking'?'验证中':'无有效图像'}</div>}
            <div className="huffman-azimuth">视角<input aria-label="共同参数三维视角" type="range" min="-180" max="180" value={azimuth} onChange={e=>setAzimuth(Number(e.target.value))}/><b>{azimuth}°</b></div></section>
        </div>
        <div className="huffman-cert"><strong>适用范围</strong><span>连续曲折等距构造，数值验证通过后可查看全部关联带。三维碰撞、连续折叠路径未验证，暂不可采用或导出直线 FOLD。</span></div>
        <div className="huffman-footer"><span>校正共同参数 · 连续曲折纸面</span><button disabled={!result} onClick={()=>download(JSON.stringify(result,null,2),'关联首First3D完整结果.json')}>导出完整结果</button><button onClick={onReference}>查看原式参考</button><button onClick={onClose}>关闭</button></div>
      </section>
    </div>
  </TessDialog>;
}

export default function CurvedLinkedCommonParameterDialog(props:{onClose:()=>void;onReference:()=>void}){
  const [generic,setGeneric]=useState(false);
  return generic?<CurvedGenericLinkedDialog {...props} onCommon={()=>setGeneric(false)}/>:
    <ConcentricLinkedDialog {...props} onGeneric={()=>setGeneric(true)}/>;
}
