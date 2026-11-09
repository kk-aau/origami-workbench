import {useState} from 'react';
import {createPortal} from 'react-dom';
import TessNumberField from './TessNumberField';
import {TessDialog} from './TessellationEditor';
import {readTessParams,unitCyclicSourceParams,type TessParams} from '../app/tessellation';
import {UNIT_CYCLIC_ALT_TYPE,readUnitCyclicSpec,
  unitCyclicCenteredPreset,unitCyclicEffectiveAngles,unitCyclicGeneralPreset,
  type UnitCyclicSpec} from '../app/unitCyclicSource';

type CustomParams=Extract<TessParams,{family:'custom'}>;

export default function UnitCyclicControls({params,onChange}:{params:CustomParams;onChange:(next:TessParams)=>void}){
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  const spec=params.unitCyclic;
  const apply=(next:UnitCyclicSpec)=>{
    const valid=readUnitCyclicSpec(next);
    if(!valid){setError('当前角度、边长或构造排布无法形成受限严格凸圆内接多边形。');return;}
    const checked=readTessParams(unitCyclicSourceParams(valid,params.paper));
    if(!checked){setError('当前参数未通过来源网格回读校验。');return;}
    setError('');onChange(checked);
  };
  const begin=()=>{apply(unitCyclicCenteredPreset());setOpen(true);};
  if(!spec)return <button className="outline unit-regular-centered-trigger" aria-label="编辑圆内接四边形居中扭转 · In[3042]" onClick={begin}>原版圆内接</button>;
  const sides=spec.angles.length,hexagon=sides===6;
  const singleOnly=sides!==4,large=sides>=8;
  const alt=spec.tileType===UNIT_CYCLIC_ALT_TYPE;
  const mode=alt?'alt':'centered';
  const setMode=(next:'centered'|'alt')=>{
    if(next===mode)return;
    const base={angles:[...spec.angles],side:spec.side,sideIndex:spec.sideIndex,width:spec.width,
      arrangement:spec.arrangement==='single'?'single' as const:next==='alt'?'in3045-pair' as const:'in3042-pair' as const,
      tiles:spec.tiles.map(tile=>({centralTypes:[...tile.centralTypes]}))};
    apply(next==='alt'?{...base,tileType:UNIT_CYCLIC_ALT_TYPE,twistAngle:30}:
      {...base,tileType:unitCyclicCenteredPreset().tileType,pleatAngle:80});
  };
  const setAngle=(index:number,value:number)=>{
    const angles=[...spec.angles];angles[index]=value;
    if(sides===4){angles[2]=180-angles[0];angles[3]=180-angles[1];}
    apply({...spec,angles} as UnitCyclicSpec);
  };
  const setEdge=(tileIndex:number,edgeIndex:number,value:'M'|'V')=>apply({...spec,tiles:spec.tiles.map((tile,i)=>i===tileIndex?{centralTypes:tile.centralTypes.map((old,j)=>j===edgeIndex?value:old)}:tile)});
  const setArrangement=(single:boolean)=>{
    if(singleOnly)return;
    apply({...spec,arrangement:single?'single':(alt?'in3045-pair':'in3042-pair'),tiles:single?spec.tiles.slice(0,1):[spec.tiles[0],spec.tiles[1]??{centralTypes:Array(4).fill('V')}]});
  };
  const effective=unitCyclicEffectiveAngles(spec.angles);
  const editableAngles=sides%2?sides-1:sides-2;
  const title=sides===4?'单位圆内接四边形扭转':`单位圆内接 ${sides} 边形扭转 · 公式推演`;
  return <>
    <button className="outline unit-regular-centered-trigger"
      aria-label={sides===4?'编辑圆内接四边形扭转参数':`编辑圆内接 ${sides} 边形公式推演扭转参数`}
      title={`${sides} 边 · 内角 ${spec.angles.slice(0,editableAngles).join('/')}° · 边 ${spec.side} · ${alt?'Alt α '+spec.twistAngle+'°':'τ '+spec.pleatAngle+'°'}`}
      onClick={()=>setOpen(true)}>{singleOnly?'圆内接推演':'原版圆内接'}</button>
    {open&&createPortal(<TessDialog title={title} onClose={()=>setOpen(false)}>
      <p>{sides===4?'In[3042] / In[3045] 保存双块；末两角按圆内接约束补足。':hexagon?'Out[359] 只锚定母六边形；扭转按 In[3041]/[3044] 本地组合。':`In[378]/[3041]/[3044] 通式的数值组合；原版没有 ${sides} 边扭转数值 Out。`}</p>
      <div className="unit-cyclic-modes"><label className="select-field">母多边形边数<select aria-label="圆内接多边形边数" value={sides} onChange={e=>apply(unitCyclicGeneralPreset(Number(e.target.value)))}>{Array.from({length:22},(_,i)=><option key={i} value={i+3}>{i+3} 边{[4,6,8].includes(i+3)?' · 保存来源/预设':''}</option>)}</select></label>
        <label className="select-field">原版构造<select aria-label="单位圆内接构造模式" value={mode} onChange={e=>setMode(e.target.value as 'centered'|'alt')}><option value="centered">居中褶角 τ · In[3041]</option><option value="alt">居中扭角 α · In[3044] Alt</option></select></label>{!singleOnly&&<label className="select-field">拼块排布<select aria-label="单位圆内接拼块排布" value={spec.arrangement} onChange={e=>setArrangement(e.target.value==='single')}><option value={alt?'in3045-pair':'in3042-pair'}>双块 · 第 2 边半周接合</option><option value="single">单块</option></select></label>}</div>
      <div className={`unit-triangle-angles${large?' unit-cyclic-many-angles':''}`}>{Array.from({length:editableAngles},(_,index)=><TessNumberField key={index} label={'内角 '+String.fromCharCode(65+index)} value={spec.angles[index]} min={1} max={179} step={.1} onChange={value=>setAngle(index,value)}/>)}<div className="unit-triangle-derived">补角 <strong>{effective.slice(-(sides%2?1:2)).map(angle=>`${+angle.toFixed(4)}°`).join(' / ')}</strong><small>{sides%2?'末角按内角和重算':'末两角按内角和与交错和重算'}</small></div></div>
      <div className="unit-triangle-numbers">{sides%2===0&&<><TessNumberField label="定长边长度" value={spec.side} min={.05} max={5} step={.01} onChange={side=>apply({...spec,side})}/><label className="select-field">定长边<select aria-label="圆内接定长边" value={spec.sideIndex} onChange={e=>apply({...spec,sideIndex:Number(e.target.value)})}>{Array.from({length:sides-1},(_,i)=><option key={i} value={i+2}>第 {i+2} 边</option>)}</select></label></>}{alt?<TessNumberField label="中心扭角 α" value={spec.twistAngle} min={1} max={89.9} step={.1} onChange={twistAngle=>apply({...spec,twistAngle})}/>:<TessNumberField label="中心褶角 τ" value={spec.pleatAngle} min={1} max={89.9} step={.1} onChange={pleatAngle=>apply({...spec,pleatAngle})}/>}</div>
      <TessNumberField label="褶宽 w" value={spec.width} min={.05} max={.8} step={.01} onChange={width=>apply({...spec,width})}/>
      {error&&<p className="unit-regular-parameter-error" role="alert">{error}</p>}
      <div className="unit-triangle-tiles">{spec.tiles.map((tile,tileIndex)=><div className="unit-triangle-tile" key={tileIndex}><div className="unit-triangle-tile-head"><strong>第 {tileIndex+1} 块{tileIndex===1?' · 第 2 边半周接合':''}</strong></div><div className={`unit-triangle-edges${large?' unit-cyclic-many-edges':''}`} role="group" aria-label={'第 '+(tileIndex+1)+' 块中心山谷赋型'}>{tile.centralTypes.map((type,i)=><label key={i}>边 {i+1}<select aria-label={'第 '+(tileIndex+1)+' 块第 '+(i+1)+' 边中心山谷'} value={type} onChange={e=>setEdge(tileIndex,i,e.target.value as 'M'|'V')}><option value="M">M 山</option><option value="V">V 谷</option></select></label>)}</div></div>)}</div>
      <p className="note">{sides===4?'四边形保存双块来源；其余输入仍须通过完整层序才可采用。':`当前为 ${sides} 边有界数值通式单块；原版未保存对应扭转数值 Out，采用须通过几何、平折和层序检查。`}</p><footer><button className="primary" onClick={()=>setOpen(false)}>完成参数编辑</button></footer>
    </TessDialog>,document.body)}
  </>;
}
