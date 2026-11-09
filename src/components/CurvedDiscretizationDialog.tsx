import {useEffect,useMemo,useState} from 'react';
import {
  CURVED_DISCRETIZATION_PRESETS,fetchCurvedDiscretizationQuery,
  validateCurvedDiscretizationQuery,
  type CurvedDiscretizationExample,type CurvedDiscretizationQuery,
  type CurvedDiscretizationResult,type Point2,
} from '../app/curvedDiscretization';
import {TessDialog} from './TessellationEditor';
import './CurvedDiscretizationDialog.css';

const options:{id:CurvedDiscretizationExample;label:string;detail:string}[]=[
  {id:'in-4088',label:'系统采样',detail:'In[4088] · 二维 / 三维抛物线'},
  {id:'in-4090',label:'均角离散',detail:'In[4090] · 弦向根'},
  {id:'in-4093',label:'椭圆系统',detail:'In[4093] · 五段均角 / 倍率'},
  {id:'multiplier-fixture',label:'角度倍率',detail:'In[4092] · 验算夹具'},
];
const fixed=(value:number,digits=9)=>Number(value.toPrecision(digits)).toString();

function Drawing({result,active}:{result:CurvedDiscretizationResult;active:number}){
  const sample=result.sample;
  let points:Point2[],baseline:Point2[]|null=null,rays:{from:Point2;to:Point2;side:string}[]=[];
  if('parameterValuesRad' in sample){
    points=sample.foldPoints;
    baseline=Array.from({length:65},(_,i)=>{
      const t=i*Math.PI/128,cosine=Math.cos(t);
      return [-2+4*cosine/(3-cosine),4*Math.sin(t)/(3-cosine)];
    });
    rays=points.flatMap((from,i)=>[
      {from,to:sample.leftSecondCrossPoints[i],side:'left'},
      {from,to:sample.rightSecondCrossPoints[i],side:'right'},
    ]);
  }else if('system' in sample){
    points=sample.system[0].values;
    baseline=Array.from({length:65},(_,i)=>{const t=i/64;return [t,t*t];});
  }else if('points' in sample){
    points=sample.points;
    baseline=Array.from({length:65},(_,i)=>{const t=i/64;return [-t*t,t];});
  }else{
    points=sample.foldPoints;
    rays=points.flatMap((from,i)=>[
      {from,to:[from[0]+.48*sample.leftRulings[i][0],
        from[1]+.48*sample.leftRulings[i][1]],side:'left'},
      {from,to:[from[0]+.48*sample.rightRulings[i][0],
        from[1]+.48*sample.rightRulings[i][1]],side:'right'},
    ]);
  }
  const all=[...points,...(baseline??[]),...rays.map(ray=>ray.to)];
  const x0=Math.min(...all.map(p=>p[0])),x1=Math.max(...all.map(p=>p[0]));
  const y0=Math.min(...all.map(p=>-p[1])),y1=Math.max(...all.map(p=>-p[1]));
  const span=Math.max(x1-x0,y1-y0,.01),pad=span*.15;
  const path=(vertices:Point2[])=>vertices.map((p,i)=>`${i?'L':'M'}${p[0]} ${-p[1]}`).join(' ');
  const marker=points[Math.min(active,points.length-1)];
  return <svg className="cdi-plot" role="img" aria-label="曲折离散化参数与采样图"
    viewBox={`${x0-pad} ${y0-pad} ${Math.max(x1-x0,.01)+2*pad} ${Math.max(y1-y0,.01)+2*pad}`}
    preserveAspectRatio="xMidYMid meet">
    {baseline&&<path className="cdi-smooth" d={path(baseline)}/>}
    {rays.map((ray,i)=><line key={i} className={`cdi-ray ${ray.side}`}
      x1={ray.from[0]} y1={-ray.from[1]} x2={ray.to[0]} y2={-ray.to[1]}
      vectorEffect="non-scaling-stroke"/>)}
    <path className="cdi-chords" d={path(points)} vectorEffect="non-scaling-stroke"/>
    {points.map((point,i)=><circle key={i} className={i===active?'cdi-point active':'cdi-point'}
      cx={point[0]} cy={-point[1]} r={span*(i===active?.018:.012)}/>)}
    <circle className="cdi-halo" cx={marker[0]} cy={-marker[1]} r={span*.038}/>
  </svg>;
}

function ResultTable({result,active,onActive}:{result:CurvedDiscretizationResult;
  active:number;onActive:(index:number)=>void}){
  const sample=result.sample;
  if('parameterValuesRad' in sample)return <table className="cdi-table"><thead><tr>
    <th>点</th><th>t / °</th><th>椭圆折痕</th><th>左次横曲线</th>
    <th>右次横曲线</th><th>弦向残差</th><th>折角倍率</th>
  </tr></thead><tbody>{sample.parameterValuesDeg.map((degrees,i)=><tr key={i}
    className={i===active?'selected':''} onClick={()=>onActive(i)}>
    <td>{i+1}</td><td>{fixed(degrees,8)}</td>
    <td>{sample.foldPoints[i].map(x=>fixed(x,7)).join(', ')}</td>
    <td>{sample.leftSecondCrossPoints[i].map(x=>fixed(x,7)).join(', ')}</td>
    <td>{sample.rightSecondCrossPoints[i].map(x=>fixed(x,7)).join(', ')}</td>
    <td>{i&&i<sample.parameterValuesRad.length-1?
      sample.directionResiduals[i-1].residual.toExponential(2):'—'}</td>
    <td>{fixed(sample.multipliers[i],10)}</td>
  </tr>)}</tbody></table>;
  if('system' in sample)return <table className="cdi-table"><thead><tr>
    <th>点</th><th>t</th><th>Curve2D</th><th>Curve3D</th>
  </tr></thead><tbody>{sample.parameterValues.map((t,i)=><tr key={i}
    className={i===active?'selected':''} onClick={()=>onActive(i)}>
    <td>{i+1}</td><td>{fixed(t,7)}</td>
    <td>{sample.system[0].values[i].map(x=>fixed(x,7)).join(', ')}</td>
    <td>{sample.system[1].values[i].map(x=>fixed(x,7)).join(', ')}</td>
  </tr>)}</tbody></table>;
  if('points' in sample)return <table className="cdi-table"><thead><tr>
    <th>点</th><th>tᵢ</th><th>f(tᵢ)</th><th>前一弦长</th><th>弦向残差</th>
  </tr></thead><tbody>{sample.parameterValues.map((t,i)=><tr key={i}
    className={i===active?'selected':''} onClick={()=>onActive(i)}>
    <td>{i+1}</td><td>{fixed(t,10)}</td>
    <td>{sample.points[i].map(x=>fixed(x,7)).join(', ')}</td>
    <td>{i?fixed(sample.chords[i-1].length,8):'—'}</td>
    <td>{i&&i<sample.parameterValues.length-1?
      sample.directionResiduals[i-1].residual.toExponential(2):'—'}</td>
  </tr>)}</tbody></table>;
  return <table className="cdi-table"><thead><tr>
    <th>顶点</th><th>二维折痕点</th><th>折角倍率</th>
  </tr></thead><tbody>{sample.foldPoints.map((p,i)=><tr key={i}
    className={i===active?'selected':''} onClick={()=>onActive(i)}>
    <td>{i+1}</td><td>{p.map(x=>fixed(x,7)).join(', ')}</td>
    <td>{fixed(sample.multipliers[i],10)}</td>
  </tr>)}</tbody></table>;
}

/** Read-only lookup of bounded section-45 numerical examples. */
export default function CurvedDiscretizationDialog({initial,onClose}:{
  initial?:CurvedDiscretizationQuery;onClose:()=>void}){
  const [example,setExample]=useState<CurvedDiscretizationExample>(initial?.example??'in-4090');
  const [divisions,setDivisions]=useState(String(initial?.example==='in-4090'||
    initial?.example==='in-4093'?initial.divisions:4));
  const [result,setResult]=useState<CurvedDiscretizationResult|null>(null);
  const [status,setStatus]=useState<'checking'|'ready'|'invalid'|'error'>('checking');
  const [error,setError]=useState(''),[active,setActive]=useState(0);
  const validated=useMemo(()=>{
    try{
      const input=example==='in-4090'||example==='in-4093'?{example,divisions:Number(divisions)}:
        CURVED_DISCRETIZATION_PRESETS[example];
      if((example==='in-4090'||example==='in-4093')&&!divisions.trim())
        throw Error('请输入分段数。');
      return {query:validateCurvedDiscretizationQuery(input),error:''};
    }catch(cause){return {query:null,error:(cause as Error).message};}
  },[example,divisions]);
  useEffect(()=>{
    if(!validated.query){setStatus('invalid');setError(validated.error);return;}
    const controller=new AbortController(),query=validated.query;
    setStatus('checking');setError('');
    const timer=window.setTimeout(()=>{
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]);
      fetchCurvedDiscretizationQuery(query,signal).then(next=>{
        if(controller.signal.aborted)return;
        setResult(next);setActive(0);setStatus('ready');
      }).catch(cause=>{
        if(controller.signal.aborted)return;
        setStatus('error');setError((cause as Error).message||'离散化查询失败。');
      });
    },140);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[validated]);
  const shown=status==='ready'&&validated.query&&
    JSON.stringify(result?.query)===JSON.stringify(validated.query)?result:null;
  const selected=options.find(option=>option.id===example)!;
  return <TessDialog title="第 45 节 · 曲折离散化" onClose={onClose}>
    <div className="curved-discretization-dialog">
      <aside className="cdi-sidebar">
        <span className="cdi-eyebrow">SECTION 45 / READ ONLY</span>
        <strong>离散化计算</strong>
        <p>仅查询原版保存输入与固定验算数据。数据由本地公式复算，原版没有数值 Out。</p>
        <div className="cdi-options" role="group" aria-label="离散化样例">
          {options.map(option=><button type="button" key={option.id}
            className={option.id===example?'selected':''}
            onClick={()=>{setExample(option.id);setActive(0);
              if(option.id==='in-4090')setDivisions('4');
              if(option.id==='in-4093')setDivisions('5');}}>
            <b>{option.label}</b><small>{option.detail}</small>
          </button>)}
        </div>
        {(example==='in-4090'||example==='in-4093')&&<label className="cdi-field">分段数 n
          <input type="number" min="2" max="16" step="1" value={divisions}
            onChange={event=>setDivisions(event.target.value)}
            aria-label={example==='in-4090'?'抛物线分段数':'椭圆分段数'}/>
          <span>{example==='in-4090'?'保存例 n=4':'保存例 n=5；其它 n 为本地推演'}；仅计算等参数初值可达的递增根。</span>
        </label>}
        <div className={`cdi-status ${status}`} role={status==='error'||status==='invalid'?'alert':'status'}
          aria-live="polite">{status==='ready'?'本地复算完成。':status==='checking'?'正在求解…':error}</div>
      </aside>
      <main className="cdi-main">
        <div className="cdi-heading"><div><span>RESULT / {selected.detail}</span>
          <strong>{selected.label}</strong></div>
          <small>{shown?shown.source.function:'等待查询'}</small></div>
        {shown?<>
          <div className="cdi-chart-card"><Drawing result={shown} active={active}/>
            <div className="cdi-chart-meta"><span>{shown.query.example==='multiplier-fixture'?
              '亮线：折痕　绿线 / 红线：左右母线':shown.query.example==='in-4093'?
                '灰线：椭圆　亮线：离散折痕　绿线 / 红线：左右次横曲线':
                '灰线：连续曲线　亮线：采样折线'}</span>
              <b>{'maximumAbsoluteResidual' in shown.sample?`最大弦向残差 ${shown.sample.maximumAbsoluteResidual.toExponential(2)}`:
                'system' in shown.sample?'5 个固定参数 · 二维／三维曲线':
                  '3 个顶点 · 局部平折验证'}</b></div></div>
          <div className="cdi-data"><div className="cdi-data-header"><strong>参数与验算值</strong>
            <small>点击行定位图中顶点</small></div>
            <div className="cdi-table-wrap"><ResultTable result={shown} active={active} onActive={setActive}/></div></div>
          <p className="cdi-note">{shown.query.example==='multiplier-fixture'?
            '该夹角夹具只验算 In[4092] 的局部倍率公式；In[4093] 的椭圆保存例另有入口。':
            shown.query.example==='in-4088'?
              '原版仅保存输入；固定参数取值由本地复算，二维与三维点列使用相同的 t。':
            shown.query.example==='in-4093'?
              `按原版 In[4093] 的固定焦点、准线复算；${shown.source.parameterStatus==='saved-input'?'n=5 是保存参数':'当前分段数是有界本地推演'}。局部倍率一致，不证明整体折叠；原版没有数值 Out。`:
            '原版仅保存输入，图中数值来自本地复算；均角条件不是等弧长或等弦长。'}</p>
        </>:<div className="cdi-empty">{status==='error'||status==='invalid'?error:'等待本地查询结果…'}</div>}
      </main>
    </div>
  </TessDialog>;
}
