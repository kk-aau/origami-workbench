import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {flasherAllLabelsSeedQuery,flasherAllVerticesLabels,flasherLabelWrap,readFlasherAllLabelsParameters,writeFlasherAllLabelsParameters,
  type FlasherAllLabelsQuery,type FlasherLabelPoint} from '../app/flasherAllVerticesLabels';
import {FLASHER_ROTATIONAL_ORDER_LIMIT,type FlasherParams} from '../app/flasherParams';
import TessNumberField from './TessNumberField';

const project=(p:FlasherLabelPoint):[number,number]=>p.length===2?[p[0],-p[1]]:[p[0]+.25*p[2],-p[1]+.3*p[2]];
type View={x:number;y:number;width:number;height:number};
function bounds(points:[number,number][]):View{
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
  const size=Math.max(w,h,1),width=Math.max(w,.5*size)+.28*size,height=Math.max(h,.4*size)+.28*size;
  return{x:(Math.min(...xs)+Math.max(...xs)-width)/2,y:(Math.min(...ys)+Math.max(...ys)-height)/2,width,height};
}
export default function FlasherAllLabelsView({params}:{params?:FlasherParams}){
  const initial=()=>flasherAllLabelsSeedQuery(params?params.rings*params.heightOrder:4,params?.rotationalOrder??5,'p','p',
    params?{rings:params.rings,heightOrder:params.heightOrder}:null);
  const [query,setQuery]=useState<FlasherAllLabelsQuery>(initial),[selected,setSelected]=useState(0),[error,setError]=useState('');
  const [pan,setPan]=useState<[number,number]>([0,0]),[zoom,setZoom]=useState(1),[status,setStatus]=useState('');
  const plot=useRef<SVGSVGElement>(null),drag=useRef<{x:number;y:number;pan:[number,number]}|null>(null);
  useEffect(()=>{
    const svg=plot.current;if(!svg)return;
    const wheel=(event:WheelEvent)=>{event.preventDefault();setZoom(z=>Math.max(.5,Math.min(20,z*Math.exp(-Math.max(-.4,Math.min(.4,event.deltaY*.001))))));};
    svg.addEventListener('wheel',wheel,{passive:false});
    return()=>svg.removeEventListener('wheel',wheel);
  },[error]);
  const result=useMemo(()=>flasherAllVerticesLabels(query),[query]),items=result.data.items.flat(),active=items[selected]??items[0];
  const points=items.map(item=>project(item.position)),fit=bounds(points),view={x:fit.x+fit.width/2-fit.width/(2*zoom)+pan[0],
    y:fit.y+fit.height/2-fit.height/(2*zoom)+pan[1],width:fit.width/zoom,height:fit.height/zoom};
  const point=project(active.position),font=fit.height*.041;
  const seed=query.origin.kind==='FlasherDefaultCPRules';
  const m=query.origin.kind==='FlasherDefaultCPRules'?query.origin.rotationalOrder:params?.rotationalOrder??5;
  const apply=(next:FlasherAllLabelsQuery,reset=false)=>{setQuery(next);setError('');setStatus('');if(reset){setSelected(0);setZoom(1);setPan([0,0]);}};
  const regenerate=(n=query.n,order=m)=>apply(flasherAllLabelsSeedQuery(n,order,query.u,query.v),true);
  const changeCoordinate=(axis:number,value:string)=>{
    if(!value.trim()||!Number.isFinite(Number(value))||Math.abs(Number(value))>1e8){setError('坐标须为±10⁸内的有限数。');return;}
    const next=structuredClone(query),resolved=flasherLabelWrap(active.content.indices).join(',');
    next.bindings.find(binding=>binding.index.join(',')===resolved)!.point[axis]=Number(value);
    next.origin={kind:'finite-numeric-bindings'};apply(next);
  };
  const focus=()=>{setZoom(4);setPan([point[0]-(fit.x+fit.width/2),point[1]-(fit.y+fit.height/2)]);};
  const importFile=async(file:File)=>{
    try{if(file.size>300000)throw Error('完整标签文件超过300KB。');const q=readFlasherAllLabelsParameters(await file.text());apply(q,true);setStatus('已载入完整 u/v/n 与坐标绑定。');}
    catch(cause){setError((cause as Error).message);setStatus('');}
  };
  return <section className="flasher-all-labels" aria-label="Flasher 全部可能顶点标签">
    <div className="p46-readonly-heading"><div><span>In[4114] · 原完整 Table</span><h2>首扇区完整标签</h2></div>
      <strong data-testid="flasher-all-label-count">{items.length} 个 Text · {query.n+2} × {query.n+1}</strong></div>
    <div className="fal-inputs"><label>标签 u<input aria-label="Flasher 原标签 u" maxLength={24} value={query.u}
      onChange={e=>{if(!e.target.value||/[\u0000-\u001f\u007f]/.test(e.target.value)){setError('标签字符串不能为空或含控制字符。');return;}apply({...query,u:e.target.value});}}/></label>
      <label>位置绑定 v<input aria-label="Flasher 位置绑定符号 v" maxLength={24} value={query.v}
        onChange={e=>{if(!e.target.value||/[\u0000-\u001f\u007f]/.test(e.target.value)){setError('位置绑定名称不能为空或含控制字符。');return;}apply({...query,v:e.target.value});}}/></label>
      {seed?<><TessNumberField label="完整标签上限 n" value={query.n} min={0} max={12} onChange={n=>regenerate(n)}/>
        <TessNumberField label="种子旋转阶 m" value={m} min={3} max={FLASHER_ROTATIONAL_ORDER_LIMIT} onChange={order=>regenerate(query.n,order)}/></>:
        <div className="fal-custom-binding"><strong>{query.dimension}D 自定义位置绑定</strong><span>n={query.n} · 原单参 WrapRules</span>
          <button type="button" className="text-button" onClick={()=>regenerate()}>重建二维原种子</button></div>}
    </div>
    <div className="fal-toolbar"><button type="button" aria-label="完整标签缩小" onClick={()=>setZoom(z=>Math.max(.5,z/1.3))}>−</button>
      <button type="button" aria-label="完整标签放大" onClick={()=>setZoom(z=>Math.min(20,z*1.3))}>＋</button>
      <button type="button" onClick={()=>{setZoom(1);setPan([0,0]);}}>适合全部标签</button><button type="button" onClick={focus}>查看选中标签</button>
      <span>滚轮缩放 · 拖动画布 · 点击标签</span></div>
    {error?<p className="fal-error" role="alert">{error}</p>:<div className="fal-figure">
      <svg ref={plot} role="img" aria-label={query.dimension===3?'原全部 Text 三维位置的本地投影':'原全部 Text 二维位置'}
        data-testid="flasher-all-labels-svg" data-source-count={items.length} data-view-zoom={zoom} data-view-pan={pan.join(',')}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} preserveAspectRatio="xMidYMid meet"
        onPointerDown={e=>{if(e.button!==0||e.target!==e.currentTarget)return;drag.current={x:e.clientX,y:e.clientY,pan:[...pan]};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{if(!drag.current)return;const b=e.currentTarget.getBoundingClientRect(),scale=Math.min(b.width/view.width,b.height/view.height);
          setPan([drag.current.pan[0]-(e.clientX-drag.current.x)/scale,drag.current.pan[1]-(e.clientY-drag.current.y)/scale]);}}
        onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
        onPointerCancel={()=>{drag.current=null;}}>
        {items.map((item,i)=>{const p=points[i];return <g key={item.content.indices.join(',')} onClick={()=>setSelected(i)} className={selected===i?'selected':''}>
          <text data-testid="flasher-original-all-label" data-ijk={item.content.indices.join(',')} data-resolved-ijk={item.resolvedPositionIndex.join(',')}
            data-source-position={item.position.join(',')} x={p[0]} y={p[1]} fontSize={font} fill="black" className="fal-label">
            <tspan fontWeight="bold">{item.content.base.value}</tspan><tspan baselineShift="sub" fontSize="75%">{item.content.indices.join(',')}</tspan>
          </text><title>{query.u}({item.content.indices.join(', ')}) · {item.position.map(x=>Number(x.toPrecision(8))).join(', ')}</title></g>;})}
        <circle className="fal-selected" cx={point[0]} cy={point[1]} r={font*.7} fill="none" stroke="#008a91" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
      </svg></div>}
    <div className="fal-inspector"><label>原 Table 项<select aria-label="选中完整标签" value={selected} onChange={e=>setSelected(Number(e.target.value))}>
      {items.map((item,i)=><option key={i} value={i}>{query.u}({item.content.indices.join(', ')})</option>)}</select></label>
      <code data-testid="flasher-all-label-binding">{query.v}({active.content.indices.join(', ')}) → {query.v}({active.resolvedPositionIndex.join(', ')})</code>
      {active.position.map((x,i)=><label key={`${selected}-${i}-${x}`}>{['X','Y','Z'][i]}<input aria-label={`标签位置 ${['X','Y','Z'][i]}`}
        type="number" step="any" min={-1e8} max={1e8} defaultValue={x} onChange={e=>changeCoordinate(i,e.target.value)}/></label>)}
    </div>
    <p className="fal-source">{seed?query.origin.kind==='FlasherDefaultCPRules'&&query.origin.prefill?
      `当前 r=${query.origin.prefill.rings}、h=${query.origin.prefill.heightOrder}、m=${m} → n=r·h=${query.n}；v 使用原二维 DefaultCPRules 位置。`:
      `原二维 DefaultCPRules 位置，n=${query.n}、m=${m}。`:'有限数值坐标绑定；修改位置只影响本标签图。'}
      {' 原负 i 标签保留，位置按 WrapRules 解析；包含面板线中间点。'}{query.dimension===3&&' 三维图仅作本地投影，保存位置仍为原三维坐标。'}</p>
    <div className="fal-files"><label className="fal-import">载入标签参数<input type="file" accept=".json,application/json" aria-label="Flasher 完整标签参数文件"
      onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value='';}}/></label>
      <button type="button" disabled={!!error} onClick={()=>download(writeFlasherAllLabelsParameters(query),'Flasher-完整标签参数.json')}>保存标签参数</button>
      <button type="button" disabled={!!error} onClick={()=>download(JSON.stringify(result,null,2)+'\n','Flasher-完整原标签图元.json')}>保存全部原 Text 图元</button>
      <button type="button" onClick={()=>apply(initial(),true)}>读取当前 r/h/m</button><span role="status">{status}</span></div>
    <p className="fal-note">原返回为 Black 样式的嵌套 Text，不增加折线。此有限数值标签图不表示已求解 CP／FF 或可折性。</p>
  </section>;
}
