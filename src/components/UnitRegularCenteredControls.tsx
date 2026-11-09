import {useState} from 'react';
import {createPortal} from 'react-dom';
import TessNumberField from './TessNumberField';
import {TessDialog} from './TessellationEditor';
import {readTessParams,unitRegularCenteredParams,type TessParams} from '../app/tessellation';
import {UNIT_REGULAR_CENTERED_ALT_TILE_TYPE,UNIT_REGULAR_OFFSET_TILE_TYPE,
  readUnitRegularCenteredSpec,unitRegularCenteredAltPreset,unitRegularCenteredAltSidePairPreset,
  unitRegularCenteredPleatAngle,unitRegularCenteredPreset,unitRegularSidePairLayout,
  unitRegularOffsetPreset,unitRegularOffsetSidePairPreset,unitRegularOffsetFourPreset,type UnitRegularCenteredSpec} from '../app/unitRegularCentered';
import {p36In3081Params} from '../app/p36In3081Source';

type CustomParams=Extract<TessParams,{family:'custom'}>;

export default function UnitRegularCenteredControls({params,onChange}:{params:CustomParams;onChange:(next:TessParams)=>void}){
  const [open,setOpen]=useState(false);
  const [parameterError,setParameterError]=useState('');
  const spec=params.unitRegularCentered;
  const apply=(next:UnitRegularCenteredSpec)=>{
    const valid=readUnitRegularCenteredSpec(next);
    if(!valid){setParameterError(next.tileType===UNIT_REGULAR_OFFSET_TILE_TYPE
      ?'偏置与褶宽须满足 |d| + w/2 < 0.5；请先调整另一项。':'原版来源参数不在可用范围内。');return;}
    const checked=readTessParams(unitRegularCenteredParams(valid,params.paper));
    if(!checked){setParameterError('当前参数无法形成有效的自定义拼块。');return;}
    setParameterError('');onChange(checked);
  };
  const begin=()=>{apply(unitRegularCenteredPreset());setOpen(true);};
  if(!spec)return <><button className="outline unit-regular-centered-trigger" aria-label="单位正多边形扭转 · In[3005]" onClick={begin}>原版正多边形</button><button className="outline unit-regular-centered-trigger" aria-label="载入十三块扭转 · In[3081]" onClick={()=>{
    const checked=readTessParams(p36In3081Params(.18,30,params.paper));
    if(checked)onChange(checked);
  }}>十三块 · In[3081]</button></>;
  const offset=spec.tileType===UNIT_REGULAR_OFFSET_TILE_TYPE;
  const alt=spec.tileType===UNIT_REGULAR_CENTERED_ALT_TILE_TYPE;
  const sidePair=unitRegularSidePairLayout(spec.arrangement);
  const mode=offset?'offset':alt?'twist':'pleat';
  const pair=offset?'in3019-pair':alt?'in3010-pair':'in3005-pair';
  const switchMode=(next:'pleat'|'twist'|'offset')=>{
    if(next===mode)return;
    const common={sides:spec.sides,width:next==='offset'&&spec.width>=.7 ? .2 : spec.width};
    const highSides=spec.sides>12;
    const single=highSides||spec.arrangement==='single';
    if(next==='offset'){
      const preset=unitRegularOffsetPreset();
      apply({...preset,...common,arrangement:single?'single':'in3019-pair',
        tiles:preset.tiles.slice(0,single?1:2).map(tile=>({...tile,
          centralTypes:Array.from({length:spec.sides},()=> highSides?'M' as const:'V' as const)}))});
      return;
    }
    const centralTypes=spec.tileType===UNIT_REGULAR_OFFSET_TILE_TYPE
      ?Array.from({length:spec.sides},(_,i)=>highSides?'M' as const:i%4<2?'M' as const:'V' as const)
      :[...spec.centralTypes];
    apply(next==='twist'
      ?{...unitRegularCenteredAltPreset(),...common,centralTypes,
        arrangement:single?'single':'in3010-pair'}
      :{...unitRegularCenteredPreset(),...common,centralTypes,
        arrangement:single?'single':'in3005-pair'});
  };
  const setArrangement=(value:string)=>{
    const single=value==='single';
    if(spec.tileType===UNIT_REGULAR_OFFSET_TILE_TYPE){
      if(value==='in3087-four'){apply(unitRegularOffsetFourPreset());return;}
      if(value==='in3084-pair'||value==='in3085-pair'||value==='in3086-pair'){
        apply(unitRegularOffsetSidePairPreset(Number(value.slice(2,6)) as 3084|3085|3086));
        return;
      }
      const tiles=single?spec.tiles.slice(0,1):[spec.tiles[0],spec.tiles[1]??{
        offset:-Math.min(.15,Math.max(0,.5-spec.width/2-.01)),
        centralTypes:Array.from({length:spec.sides},()=> 'V' as const)}];
      apply({...spec,arrangement:single?'single':'in3019-pair',tiles});
    }else if(spec.tileType===UNIT_REGULAR_CENTERED_ALT_TILE_TYPE){
      if(value==='in3078-pair'||value==='in3079-pair'||value==='in3080-pair')
        apply(unitRegularCenteredAltSidePairPreset(Number(value.slice(2,6)) as 3078|3079|3080));
      else apply({...spec,arrangement:single?'single':'in3010-pair'});
    }
    else apply({...spec,arrangement:single?'single':'in3005-pair'});
  };
  const setSides=(sides:number)=>{
    // Beyond the saved square pair, start from a verified single-tile
    // assignment.  Carrying its MMVV seam types into a larger polygon can
    // make even an otherwise valid single tile fail the local M/V test.
    if(spec.tileType===UNIT_REGULAR_OFFSET_TILE_TYPE){
      const reset=sides>12||!!sidePair&&sides!==sidePair.sides||spec.arrangement==='in3087-four'&&sides!==4;
      apply({...spec,sides,arrangement:reset?'single':spec.arrangement,
        tiles:(reset?spec.tiles.slice(0,1):spec.tiles).map(tile=>({...tile,
          centralTypes:sides>12?Array.from({length:sides},()=> 'M' as const)
            :Array.from({length:sides},(_,i)=>tile.centralTypes[i]??'V')}))});
    }else{
      const centralTypes=sides>12?Array.from({length:sides},()=> 'M' as const)
        :Array.from({length:sides},(_,i)=>spec.centralTypes[i]??(i%4<2?'M':'V'));
      if(spec.tileType===UNIT_REGULAR_CENTERED_ALT_TILE_TYPE)
        apply({...spec,sides,arrangement:sides>12||
          sidePair&&sides!==sidePair.sides?'single':spec.arrangement,centralTypes});
      else apply({...spec,sides,arrangement:sides>12?'single':spec.arrangement,centralTypes});
    }
  };
  const setOffset=(index:number,value:number)=>{
    if(spec.tileType!==UNIT_REGULAR_OFFSET_TILE_TYPE)return;
    apply({...spec,tiles:spec.tiles.map((tile,i)=>i===index?{...tile,offset:value}:tile)});
  };
  const setEdge=(tileIndex:number,edgeIndex:number,value:'M'|'V')=>{
    if(spec.tileType===UNIT_REGULAR_OFFSET_TILE_TYPE)
      apply({...spec,tiles:spec.tiles.map((tile,i)=>i===tileIndex?{...tile,
        centralTypes:tile.centralTypes.map((old,j)=>j===edgeIndex?value:old)}:tile)});
    else apply({...spec,centralTypes:spec.centralTypes.map((old,j)=>j===edgeIndex?value:old)});
  };
  const sourceSummary=offset
    ?spec.tiles.map(tile=>`d ${tile.offset>=0?'+':''}${tile.offset} · ${tile.centralTypes.join('')}`).join(' / ')
    :alt?`α ${spec.twistAngle}° · ${spec.centralTypes.join('')}${sidePair?' / '+spec.centralTypes.map(type=>type==='M'?'V':'M').join(''):''}`
      :`τ ${spec.pleatAngle}° · ${spec.centralTypes.join('')}`;
  return <>
    <button className="outline unit-regular-centered-trigger" aria-label="编辑单位正多边形扭转参数"
      title={`n ${spec.sides} · w ${spec.width} · ${sourceSummary}`}
      onClick={()=>setOpen(true)}>原版正{spec.sides}边形</button>
    {open&&createPortal(<TessDialog title="单位正多边形扭转" onClose={()=>setOpen(false)}>
      <p>单位边长 · {offset?'逐块有符号偏置':alt?'居中扭角':'居中褶角'}</p>
      <div className="unit-regular-centered-modes">
        <label className="select-field">原版构造<select aria-label="单位正多边形构造模式" value={mode} onChange={e=>switchMode(e.target.value as 'pleat'|'twist'|'offset')}><option value="pleat">居中褶角 τ · In[3005]</option><option value="twist">居中扭角 α · In[3010] Alt</option><option value="offset">逐块偏置 d · In[3019]</option></select></label>
        <label className="select-field">拼块排布<select aria-label="单位正多边形拼块排布" value={spec.arrangement} onChange={e=>setArrangement(e.target.value)}><option value={pair}>{offset?'上下双块 · In[3019]':alt?'上下双块 · In[3010]':'两块 · In[3005]'}</option>{alt&&<><option value="in3078-pair">三角侧接 · In[3078]</option><option value="in3079-pair">正方侧接 · In[3079]</option><option value="in3080-pair">六边侧接 · In[3080]</option></>}{offset&&<><option value="in3084-pair">三角侧接 · In[3084]</option><option value="in3085-pair">正方侧接 · In[3085]</option><option value="in3086-pair">六边侧接 · In[3086]</option><option value="in3087-four">四方编织 · In[3087]</option></>}<option value="single">单块</option></select></label>
      </div>
      <div className="unit-regular-centered-numbers">
        <TessNumberField label="单位正多边形边数 n" value={spec.sides} min={3} max={24} onChange={setSides}/>
        <TessNumberField label="褶宽 w" value={spec.width} min={.05} max={.8} step={.01} onChange={width=>apply({...spec,width})}/>
        {offset?<span className="unit-regular-offset-tilt">逐块褶线倾角固定为 90°</span>
          :alt?<TessNumberField label="居中扭角 α" value={spec.twistAngle} min={1} max={89.9} step={.1} onChange={twistAngle=>apply({...spec,twistAngle})}/>
            :<TessNumberField label="居中褶角 τ" value={spec.pleatAngle} min={1} max={179} step={.1} onChange={pleatAngle=>apply({...spec,pleatAngle})}/>}
      </div>
      {alt&&<small className="unit-regular-centered-angle-note">锐角子域 1° ≤ α &lt; 90°；按 τ=atan(tan α / w)，当前褶角 τ≈{unitRegularCenteredPleatAngle(spec).toFixed(3)}°。</small>}
      {alt&&sidePair&&<small className="unit-regular-centered-angle-note">侧向接边固定为两个正 {sidePair.sides} 边形；第二块中心山谷自动与第一块逐边相反。修改边数将改为单块。</small>}
      {parameterError&&<p className="unit-regular-parameter-error" role="alert">{parameterError}</p>}
      {spec.tileType===UNIT_REGULAR_OFFSET_TILE_TYPE
        ?<div className="unit-regular-offset-tiles">{spec.tiles.map((tile,tileIndex)=><div className="unit-regular-offset-tile" key={tileIndex}>
          <div className="unit-regular-offset-head"><strong>第 {tileIndex+1} 块{spec.arrangement==='in3087-four'?` · 四方第 ${tileIndex+1} 位`:tileIndex===1?(sidePair?` · 接第 1 块第 ${sidePair.edge} 边`:' · 上移 1 单位'):''}</strong>
            <TessNumberField label={`第 ${tileIndex+1} 块有符号偏置 d`} value={tile.offset} min={-.4} max={.4} step={.01} onChange={value=>setOffset(tileIndex,value)}/></div>
          <div className="unit-regular-centered-edges" role="group" aria-label={`第 ${tileIndex+1} 块逐边中心山谷赋型`}>
            {tile.centralTypes.map((type,i)=><label key={i}>边 {i+1}<select aria-label={`第 ${tileIndex+1} 块第 ${i+1} 边中心山谷`} value={type} onChange={e=>setEdge(tileIndex,i,e.target.value as 'M'|'V')}><option value="M">M 山</option><option value="V">V 谷</option></select></label>)}
          </div></div>)}</div>
        :<div className="unit-regular-centered-edges" role="group" aria-label="逐边中心山谷赋型">{spec.centralTypes.map((type,i)=><label key={i}>边 {i+1}<select aria-label={`第 ${i+1} 边中心山谷`} value={type} onChange={e=>setEdge(0,i,e.target.value as 'M'|'V')}><option value="M">M 山</option><option value="V">V 谷</option></select></label>)}</div>}
      <p className="note" title="切换构造模式载入对应样例并保留兼容的边数、褶宽与排布；任意参数尚未证明与 Wolfram 保存图形逐点等价。">{spec.arrangement==='in3087-four'?`In[3087] 四方拼块：w=${spec.width}、d=${spec.tiles.map(tile=>tile.offset).join('/')}；改动参数后为本地变体。`:sidePair?`In[${spec.arrangement.slice(2,6)}] 侧接双块：n=${sidePair.sides}、w=${spec.width}、${offset?`d=${spec.tiles[0].offset}/ ${spec.tiles[1].offset}`:alt?`α=${spec.twistAngle}°`:''}；改动参数后为本地变体。`:offset?'In[3019] 双块 n=4、w=0.2、d=±0.15、VVVV；须满足 |d|+w/2<0.5。':alt?'In[3010] 双块 n=4、w=0.2、α=30°、MMVV。':'In[3005] 双块 n=4、w=0.2、τ=70°、MMVV。'}大于 12 边时先用已验证的单块同型中心边；其他参数须整片层序已解才可采用，不代表逐点等价。</p>
      <footer><button className="primary" onClick={()=>setOpen(false)}>完成参数编辑</button></footer>
    </TessDialog>,document.body)}
  </>;
}
