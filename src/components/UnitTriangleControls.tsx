import {useState} from 'react';
import {createPortal} from 'react-dom';
import TessNumberField from './TessNumberField';
import {TessDialog} from './TessellationEditor';
import {readTessParams,unitTriangleParams,type TessParams} from '../app/tessellation';
import {UNIT_TRIANGLE_ALT_TYPE,UNIT_TRIANGLE_CENTERED_TYPE,UNIT_TRIANGLE_OFFSET_TYPE,
  readUnitTriangleSpec,triangleAltPleatAngle,triangleAltPreset,triangleCenteredPreset,
  triangleOffsetPreset,type UnitTriangleSpec} from '../app/unitTriangleSource';

type CustomParams=Extract<TessParams,{family:'custom'}>;

export default function UnitTriangleControls({params,onChange}:{params:CustomParams;onChange:(next:TessParams)=>void}){
  const [open,setOpen]=useState(false),[parameterError,setParameterError]=useState('');
  const spec=params.unitTriangle;
  const close=()=>{setParameterError('');setOpen(false);};
  const apply=(next:UnitTriangleSpec)=>{
    const valid=readUnitTriangleSpec(next);
    if(!valid){setParameterError('三角内角须各不小于 1° 且合计 180°；偏置还须满足 |d|+w/2<0.5。');return;}
    const checked=readTessParams(unitTriangleParams(valid,params.paper));
    if(!checked){setParameterError('当前参数无法形成有效的自定义拼块。');return;}
    setParameterError('');onChange(checked);
  };
  const begin=()=>{apply(triangleAltPreset());setOpen(true);};
  if(!spec)return <button className="outline unit-triangle-trigger" aria-label="原版三角形扭转 · In[3028]" onClick={begin}>原版三角形</button>;
  const offset=spec.tileType===UNIT_TRIANGLE_OFFSET_TYPE;
  const alt=spec.tileType===UNIT_TRIANGLE_ALT_TYPE;
  const mode=offset?'offset':alt?'twist':'pleat';
  const pair=offset?'in3039-pair':alt?'in3028-pair':'in3025-pair';
  const switchMode=(next:'pleat'|'twist'|'offset')=>{
    if(next===mode)return;
    const common={angles:[...spec.angles] as [number,number,number],width:spec.width};
    const single=spec.arrangement==='single';
    if(next==='offset'){
      const preset=triangleOffsetPreset();
      apply({...preset,...common,arrangement:single?'single':'in3039-pair',
        tiles:preset.tiles.slice(0,single?1:2)});
      return;
    }
    const tiles=spec.tileType===UNIT_TRIANGLE_OFFSET_TYPE
      ?[{centralTypes:['M','M','M'] as ('M'|'V')[]},
        {centralTypes:['V','V','V'] as ('M'|'V')[]}].slice(0,single?1:2)
      :spec.tiles.map(tile=>({centralTypes:[...tile.centralTypes]}));
    apply(next==='twist'
      ?{...triangleAltPreset(),...common,tiles,arrangement:single?'single':'in3028-pair'}
      :{...triangleCenteredPreset(),...common,tiles,arrangement:single?'single':'in3025-pair'});
  };
  const setArrangement=(single:boolean)=>{
    if(spec.tileType===UNIT_TRIANGLE_OFFSET_TYPE){
      const tiles=single?spec.tiles.slice(0,1):[spec.tiles[0],spec.tiles[1]??{
        offset:-.05,centralTypes:['M','M','M'] as ('M'|'V')[]}];
      apply({...spec,arrangement:single?'single':'in3039-pair',tiles});
    }else if(spec.tileType===UNIT_TRIANGLE_ALT_TYPE){
      const tiles=single?spec.tiles.slice(0,1):[spec.tiles[0],spec.tiles[1]??{
        centralTypes:['V','V','V'] as ('M'|'V')[]}];
      apply({...spec,arrangement:single?'single':'in3028-pair',tiles});
    }else{
      const tiles=single?spec.tiles.slice(0,1):[spec.tiles[0],spec.tiles[1]??{
        centralTypes:['V','V','V'] as ('M'|'V')[]}];
      apply({...spec,arrangement:single?'single':'in3025-pair',tiles});
    }
  };
  const setBaseAngle=(index:0|1,value:number)=>{
    const a=index===0?value:spec.angles[0],b=index===1?value:spec.angles[1];
    apply({...spec,angles:[a,b,180-a-b]});
  };
  const setEdge=(tileIndex:number,edgeIndex:number,value:'M'|'V')=>{
    if(spec.tileType===UNIT_TRIANGLE_OFFSET_TYPE)
      apply({...spec,tiles:spec.tiles.map((tile,i)=>i===tileIndex?{...tile,
        centralTypes:tile.centralTypes.map((old,j)=>j===edgeIndex?value:old)}:tile)});
    else apply({...spec,tiles:spec.tiles.map((tile,i)=>i===tileIndex?{...tile,
      centralTypes:tile.centralTypes.map((old,j)=>j===edgeIndex?value:old)}:tile)});
  };
  const setOffset=(index:number,value:number)=>{
    if(spec.tileType!==UNIT_TRIANGLE_OFFSET_TYPE)return;
    apply({...spec,tiles:spec.tiles.map((tile,i)=>i===index?{...tile,offset:value}:tile)});
  };
  const sourceSummary=offset
    ?spec.tiles.map(tile=>`d ${tile.offset>=0?'+':''}${tile.offset} ${tile.centralTypes.join('')}`).join(' / ')
    :alt?`α ${spec.twistAngle}°`:`τ ${spec.pleatAngle}°`;
  return <>
    <button className="outline unit-triangle-trigger" aria-label="编辑原版三角形扭转参数"
      title={`A/B/C ${spec.angles.join('/')}° · w ${spec.width} · ${sourceSummary}`}
      onClick={()=>setOpen(true)}>原版三角形</button>
    {open&&createPortal(<TessDialog title="单位三角形扭转" onClose={close}>
      <p>单位底边 · 双块沿第 2 边半周接合</p>
      <div className="unit-triangle-modes">
        <label className="select-field">原版构造<select aria-label="单位三角形构造模式" value={mode} onChange={e=>switchMode(e.target.value as 'pleat'|'twist'|'offset')}><option value="pleat">居中褶角 τ · In[3025]</option><option value="twist">居中扭角 α · In[3028] Alt</option><option value="offset">逐块偏置 d · In[3039]</option></select></label>
        <label className="select-field">拼块排布<select aria-label="单位三角形拼块排布" value={spec.arrangement} onChange={e=>setArrangement(e.target.value==='single')}><option value={pair}>双块 · {offset?'In[3039]':alt?'In[3028]':'In[3025]'}</option><option value="single">单块</option></select></label>
      </div>
      <div className="unit-triangle-angles">
        <TessNumberField label="左底角 A" value={spec.angles[0]} min={1} max={178} step={.1} onChange={value=>setBaseAngle(0,value)}/>
        <TessNumberField label="右底角 B" value={spec.angles[1]} min={1} max={178} step={.1} onChange={value=>setBaseAngle(1,value)}/>
        <div className="unit-triangle-derived">顶角 C <strong>{Number(spec.angles[2].toFixed(4))}°</strong><small>180° − A − B</small></div>
      </div>
      <div className="unit-triangle-numbers">
        <TessNumberField label="褶宽 w" value={spec.width} min={.05} max={.8} step={.01} onChange={width=>apply({...spec,width})}/>
        {spec.tileType===UNIT_TRIANGLE_CENTERED_TYPE
          ?<TessNumberField label="中心褶角 τ" value={spec.pleatAngle} min={1} max={179} step={.1} onChange={pleatAngle=>apply({...spec,pleatAngle})}/>
          :spec.tileType===UNIT_TRIANGLE_ALT_TYPE
            ?<TessNumberField label="中心扭角 α" value={spec.twistAngle} min={1} max={89.9} step={.1} onChange={twistAngle=>apply({...spec,twistAngle})}/>
            :<span className="unit-triangle-fixed-angle">逐块褶线倾角固定为 90°</span>}
        {alt&&<span className="unit-triangle-pleat-note">推得 τ≈{triangleAltPleatAngle(spec).toFixed(3)}°</span>}
      </div>
      {parameterError&&<p className="unit-regular-parameter-error" role="alert">{parameterError}</p>}
      <div className="unit-triangle-tiles">{spec.tiles.map((tile,tileIndex)=><div className="unit-triangle-tile" key={tileIndex}>
        <div className="unit-triangle-tile-head"><strong>第 {tileIndex+1} 块{tileIndex===1?' · 第 2 边半周接合':''}</strong>
          {spec.tileType===UNIT_TRIANGLE_OFFSET_TYPE&&<TessNumberField label={`第 ${tileIndex+1} 块有符号偏置 d`} value={spec.tiles[tileIndex].offset} min={-.4} max={.4} step={.01} onChange={value=>setOffset(tileIndex,value)}/>}</div>
        <div className="unit-triangle-edges" role="group" aria-label={`第 ${tileIndex+1} 块逐边中心山谷赋型`}>
          {tile.centralTypes.map((type,i)=><label key={i}>边 {i+1}<select aria-label={`第 ${tileIndex+1} 块第 ${i+1} 边中心山谷`} value={type} onChange={e=>setEdge(tileIndex,i,e.target.value as 'M'|'V')}><option value="M">M 山</option><option value="V">V 谷</option></select></label>)}
        </div>
      </div>)}</div>
      <p className="note" title="任意参数仅生成候选，尚未证明与 Wolfram 保存图形逐点等价。">{mode==='pleat'?'In[3025] 保存双块层序无解。':mode==='twist'?'In[3028] 保存双块 α=25°、MMM/VVV：唯一层序。':'In[3039] 保存双块 d=±0.05、MMM/MMM：唯一层序。'}其他参数须整片层序已解才可采用；不代表逐点等价。</p>
      <footer><button className="primary" onClick={close}>完成参数编辑</button></footer>
    </TessDialog>,document.body)}
  </>;
}
