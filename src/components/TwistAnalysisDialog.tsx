import {useEffect,useState} from 'react';
import {download} from '../app/api';
import {centeredTwistAngleSelfContained,centeredTwistSelfContained,centeredTwistTypes,offsetTwistAngleSelfContained,offsetTwistSelfContained,polygonCriticalAngles,regularPolygonTwistValid,triangleCriticalAngles,twistAssignmentCatalog,validTwistTypes,TWIST_ASSIGNMENT_LIST_LIMIT,type TwistTypes} from '../app/twistAnalysis';
import {polygonTwistProperties} from '../app/polygonTwistProperties';
import {unitTriangleOffsetTwistAngle,unitTriangleOffsetTwistOffset,unitTriangleOffsetTwistRotation,unitTriangleOffsetTwistSelfContained,unitTriangleOffsetTwistShrinkage} from '../app/unitTriangleOffset';
import type {XY} from '../app/tessellation';
import TessNumberField from './TessNumberField';
import {TessDialog} from './TessellationEditor';
import TestPleatControls from './TestPleatControls';
import ThreeCycleNativeControls from './ThreeCycleNativeControls';
import type {ThreeCycleQuery} from '../app/threeCycleNative';
import './TwistAssignmentCatalog.css';

function counterclockwise(points:XY[]):XY[]{
  const twiceArea=points.reduce((sum,p,i)=>sum+p[0]*points[(i+1)%points.length][1]-p[1]*points[(i+1)%points.length][0],0);
  return twiceArea<0?[...points].reverse():points;
}
function angleAt(a:XY,b:XY,c:XY){
  const u=[a[0]-b[0],a[1]-b[1]],v=[c[0]-b[0],c[1]-b[1]];
  return Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v)))))*180/Math.PI;
}
const format=(range:[number,number]|null)=>range?`${range[0].toFixed(3)}° ～ ${range[1].toFixed(3)}°${range[0]<0||range[1]>180?' · 含物理扭角范围外的代数值':''}`:'无适用的边组';
type TileSource={variant:'general'|'centered'|'centered-angle'|'offset';width:number;offset?:number;tilt?:number;twistAngle?:number};
const effectiveTilt=(tile?:TileSource)=>tile?.variant==='offset'?90:tile?.variant==='centered-angle'&&tile.twistAngle!==undefined?
  Math.atan2(Math.sin(tile.twistAngle*Math.PI/180),tile.width*Math.cos(tile.twistAngle*Math.PI/180))*180/Math.PI:tile?.tilt??90;
const decimal=(value:number|null,places=4)=>value===null?'—':(Math.abs(value)<.5*10**-places?0:value).toFixed(places);

export default function TwistAnalysisDialog({polygon,onClose,types,tile}:{polygon:XY[];onClose:()=>void;types?:TwistTypes;tile?:TileSource}){
  const [alpha,setAlpha]=useState(36),[width,setWidth]=useState(.2),[tilt,setTilt]=useState(70),[offset,setOffset]=useState(.1);
  const [tab,setTab]=useState<'critical'|'contained'|'properties'>('critical'),[form,setForm]=useState<'pleat'|'twist'>('pleat');
  const [checkHalfPlane,setCheckHalfPlane]=useState(true);
  const [propertyMode,setPropertyMode]=useState<'polygon'|'triangle'>('polygon');
  const [propertyWidth,setPropertyWidth]=useState(tile?.width??.2);
  const [propertyOffset,setPropertyOffset]=useState(tile?.offset??0);
  const [propertyTilt,setPropertyTilt]=useState(effectiveTilt(tile));
  const [triangleAngles,setTriangleAngles]=useState<[number,number,number]>([50,60,70]);
  const [triangleWidth,setTriangleWidth]=useState(.09),[triangleOffset,setTriangleOffset]=useState(.06),[triangleAlpha,setTriangleAlpha]=useState(22.843204806313516);
  const [triangleForm,setTriangleForm]=useState<'offset'|'angle'>('offset'),[triangleTypes,setTriangleTypes]=useState('MMM');
  const [narrow,setNarrow]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width:620px)').matches);
  const [exportStatus,setExportStatus]=useState('');
  useEffect(()=>setExportStatus(''),[alpha,width,tilt,form,tab]);
  useEffect(()=>{
    const media=window.matchMedia('(max-width:620px)'),update=()=>setNarrow(media.matches);
    media.addEventListener('change',update);return ()=>media.removeEventListener('change',update);
  },[]);
  const points=counterclockwise(polygon),n=points.length;
  const critical=polygonCriticalAngles(points,{checkHalfPlane}),triangle=n===3?triangleCriticalAngles([
    angleAt(points[2],points[0],points[1]),angleAt(points[0],points[1],points[2]),angleAt(points[1],points[2],points[0])
  ]):null;
  const {all,valid,centered,counts}=twistAssignmentCatalog(n,alpha,width,tilt,form);
  const previewLimit=narrow?4:n>32?8:24;
  const [chosen,setChosen]=useState(types?.join('')??'M'.repeat(n));
  const chosenTypes=chosen.split('') as TwistTypes;
  const currentCentered=form==='pleat'?centeredTwistSelfContained(n,width,tilt,chosenTypes):centeredTwistAngleSelfContained(n,width,alpha,chosenTypes);
  const currentOffset=form==='pleat'?offsetTwistSelfContained(n,width,offset,chosenTypes):offsetTwistAngleSelfContained(n,width,alpha,chosenTypes);
  const properties=polygonTwistProperties(points,propertyWidth,propertyOffset,propertyTilt);
  const triangleOffsetValue=triangleForm==='offset'?triangleOffset:unitTriangleOffsetTwistOffset(triangleAngles,triangleWidth,triangleAlpha);
  const triangleAlphaValue=triangleForm==='offset'?unitTriangleOffsetTwistAngle(triangleAngles,triangleWidth,triangleOffset):triangleOffsetValue===null?null:triangleAlpha;
  const triangleShrinkage=triangleOffsetValue===null?null:unitTriangleOffsetTwistShrinkage(triangleAngles,triangleWidth,triangleOffsetValue);
  const triangleRotation=triangleOffsetValue===null?null:unitTriangleOffsetTwistRotation(triangleAngles,triangleWidth,triangleOffsetValue);
  const triangleContained=triangleOffsetValue!==null&&unitTriangleOffsetTwistSelfContained(triangleAngles,triangleWidth,triangleOffsetValue,triangleTypes.split('') as TwistTypes);
  const sequences=all.map(t=>t.join(''));
  if(!sequences.includes(chosen))sequences.unshift(chosen);
  const exportAllowed=(count:string|undefined)=>count!==undefined&&BigInt(count)<=BigInt(TWIST_ASSIGNMENT_LIST_LIMIT);
  const exportAssignments=async(kind:'valid'|'centered')=>{
    const count=counts?.[kind];if(!exportAllowed(count))return;
    setExportStatus('');
    try{
    const values=kind==='valid'?validTwistTypes(n,alpha):centeredTwistTypes(n,width,form==='pleat'?tilt:alpha,form);
    const text=JSON.stringify({source:'Origamica.AllCyclicTwistTypes.rotation-only',order:n,
      query:kind==='valid'?{kind,angleDeg:alpha}:{kind,width,form,valueDeg:form==='pleat'?tilt:alpha},
      count,assignments:[...values].map(types=>types.join(''))},null,2)+'\n';
    const result=await download(text,`扭转赋型-${n}边-${kind}.json`);
    if(result.status==='cancelled'){setExportStatus('已取消导出。');return;}
    setExportStatus(result.status==='saved'?`已导出全部 ${count} 个赋型。`:`已交给浏览器下载全部 ${count} 个赋型。`);
    }catch(error){setExportStatus(error instanceof Error?error.message:String(error));}
  };
  const resultGrid=(items:TwistTypes[],count:string|undefined,label:string,kind:'valid'|'centered')=><section className="twist-assignment-results" aria-label={label}>
    <div className="twist-assignment-summary"><span>{count===undefined?'当前边数只查询所选赋型':`共 ${count} 个，显示 ${Math.min(items.length,previewLimit)} 个`}</span>
      <button className="text-button" onClick={()=>exportAssignments(kind)} disabled={!exportAllowed(count)} title={count&&BigInt(count)>BigInt(TWIST_ASSIGNMENT_LIST_LIMIT)?'结果超过单文件容量，请缩小查询范围。':undefined}>导出全部{kind==='valid'?'有效':'自包含'}赋型</button></div>
    <div className={`twist-assignment-preview${n>16?' long-sequences':''}${n>32?' wide-sequences':''}`}>
      {items.slice(0,previewLimit).map(t=><code key={t.join('')}>{t.join('')}</code>)}
    </div>
  </section>;
  return <TessDialog title="扭转临界角与山谷赋型" onClose={onClose}>
    <div className="spherical-vertex-tabs" role="tablist" aria-label="扭转分析模式">
      <button role="tab" aria-selected={tab==='critical'} aria-pressed={tab==='critical'} onClick={()=>setTab('critical')}>临界角与赋型</button>
      <button role="tab" aria-selected={tab==='contained'} aria-pressed={tab==='contained'} onClick={()=>setTab('contained')}>单位拼块自包含</button>
      <button role="tab" aria-selected={tab==='properties'} aria-pressed={tab==='properties'} onClick={()=>setTab('properties')}>扭转构造性质</button>
    </div>
    {tab==='properties'?<div className="twist-properties">
      <div className="spherical-vertex-tabs" role="group" aria-label="扭转性质类型">
        <button aria-pressed={propertyMode==='polygon'} onClick={()=>setPropertyMode('polygon')}>当前轮廓性质</button>
        <button aria-pressed={propertyMode==='triangle'} onClick={()=>setPropertyMode('triangle')}>单位三角偏置</button>
      </div>
      {propertyMode==='polygon'?<>
        <p className="note">{tile?'读取当前精确单元的初始参数。':'按当前外轮廓建立精确扭转单元。'}此处修改只更新查询。</p>
        <div className="twist-property-inputs">
          <TessNumberField label="查询褶宽 w" value={propertyWidth} min={.01} max={.8} step={.01} onChange={setPropertyWidth}/>
          <TessNumberField label="查询偏置 d" value={propertyOffset} min={-.4} max={.4} step={.01} onChange={setPropertyOffset}/>
          <TessNumberField label="查询褶倾角 τ" value={propertyTilt} min={1} max={179} step={.1} onChange={setPropertyTilt}/>
        </div>
        {tile&&<button className="text-button twist-property-reset" onClick={()=>{setPropertyWidth(tile.width);setPropertyOffset(tile.offset??0);setPropertyTilt(effectiveTilt(tile));}}>读取当前单元参数</button>}
        {properties?<>
          <div className="twist-property-summary" data-testid="twist-property-summary"><strong>{properties.numSides} 边中心多边形</strong><span>中心角合计 {decimal(properties.centralPolygonAngles.reduce((sum,value)=>sum+value,0),2)}°</span><span>Kawasaki 超额合计 {decimal(properties.centralPolygonAnglesExcess.reduce((sum,value)=>sum+value,0),2)}°</span></div>
          <table className="twist-property-table" aria-label="中心多边形逐边性质"><thead><tr><th>边</th><th>扭角 α</th><th>中心边长</th><th>中心角</th><th>Kawasaki 超额</th></tr></thead><tbody>{properties.twistAngles.map((angle,i)=><tr key={i}><th>{i+1}</th><td>{decimal(angle,2)}°</td><td>{decimal(properties.centralPolygonSides[i])}</td><td>{decimal(properties.centralPolygonAngles[i],2)}°</td><td>{decimal(properties.centralPolygonAnglesExcess[i],2)}°</td></tr>)}</tbody></table>
        </>:<p role="status" className="twist-property-invalid">当前褶宽、偏置或褶倾角不能生成有效的中心多边形。</p>}
      </>:<>
        <p className="note">原版示例为 50°／60°／70°、褶宽 0.09、偏置 0.06。三个内角之和须为 180°。</p>
        <div className="twist-property-inputs twist-triangle-angles">{triangleAngles.map((value,i)=><TessNumberField key={i} label={`内角 ${i+1}`} value={value} min={.1} max={179.9} step={.1} onChange={next=>setTriangleAngles(previous=>previous.map((angle,j)=>j===i?next:angle) as [number,number,number])}/>)}</div>
        <div className="twist-property-form">
          <div className="spherical-vertex-tabs" role="group" aria-label="三角形参数形式">
            <button aria-pressed={triangleForm==='offset'} onClick={()=>{if(triangleForm==='angle'&&triangleOffsetValue!==null)setTriangleOffset(triangleOffsetValue);setTriangleForm('offset');}}>偏置 d</button>
            <button aria-pressed={triangleForm==='angle'} onClick={()=>{if(triangleForm==='offset'&&triangleAlphaValue!==null)setTriangleAlpha(triangleAlphaValue);setTriangleForm('angle');}}>扭角 α</button>
          </div>
          <button className="text-button" onClick={()=>{setTriangleAngles([50,60,70]);setTriangleWidth(.09);setTriangleOffset(.06);setTriangleAlpha(22.843204806313516);setTriangleForm('offset');setTriangleTypes('MMM');}}>恢复原版示例</button>
        </div>
        <div className="twist-property-inputs twist-triangle-parameters">
          <TessNumberField label="三角褶宽 w" value={triangleWidth} min={.01} max={.49} step={.01} onChange={setTriangleWidth}/>
          {triangleForm==='offset'?<TessNumberField label="三角偏置 d" value={triangleOffset} min={-.4} max={.4} step={.01} onChange={setTriangleOffset}/>:<TessNumberField label="三角扭角 α" value={triangleAlpha} min={.1} max={179.9} step={.1} onChange={setTriangleAlpha}/>}
          <label className="select-field">中心边山谷<select aria-label="三角中心边山谷" value={triangleTypes} onChange={event=>setTriangleTypes(event.target.value)}>{['MMM','MMV','MVM','VMM','MVV','VMV','VVM','VVV'].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        </div>
        <div className="twist-triangle-result" aria-label="单位三角偏置结果">
          <div><span>扭角 α</span><strong data-testid="triangle-offset-angle">{decimal(triangleAlphaValue,3)}°</strong></div>
          <div><span>偏置 d</span><strong data-testid="triangle-offset-value">{decimal(triangleOffsetValue,4)}</strong></div>
          <div><span>收缩率 ρ</span><strong>{decimal(triangleShrinkage,4)}</strong></div>
          <div><span>旋转 β</span><strong>{decimal(triangleRotation,3)}°</strong></div>
        </div>
        <p className="twist-triangle-contained" data-testid="triangle-offset-contained">{triangleAlphaValue===null?'内角或参数无效':`${triangleTypes}：${triangleContained?'自包含':'不自包含'}`}</p>
      </>}
    </div>:tab==='critical'?<>
      <TestPleatControls initial={polygon.length>=2?[polygon[0],polygon[1]]:undefined} angle={alpha}/>
      <ThreeCycleNativeControls initial={polygon.length>=3?{family:'three-cycle-critical-native',edges:polygon.slice(0,3).map((p,i)=>[p,polygon[(i+1)%polygon.length]]) as ThreeCycleQuery['edges'],checkHalfPlane}:undefined}/>
      <label><input type="checkbox" aria-label="多边形CheckHalfPlane" checked={checkHalfPlane} onChange={e=>setCheckHalfPlane(e.target.checked)}/> CheckHalfPlane（原默认True；False使用原代数分支）</label>
      <p className="note">按当前外轮廓查询二／三循环临界角；下方按相同边数的正多边形枚举山谷序列。查询不修改折痕。</p>
      <div className="twist-analysis-ranges">
        <div><b>二循环重叠</b><span data-testid="twist-two-cycle">{format(critical.twoCycle)}</span></div>
        <div><b>三循环约束</b><span data-testid="twist-three-cycle">{!checkHalfPlane&&!critical.threeCycle?'原过滤或数值求值未返回区间':format(critical.threeCycle)}</span></div>
        {triangle&&<div><b>三角形内角公式</b><span data-testid="twist-triangle">{format(triangle)}</span></div>}
      </div>
      <div className="twist-analysis-angle"><TessNumberField label="查询扭角 α" value={alpha} min={.1} max={179.9} step={.1} onChange={setAlpha}/><span className="twist-assignment-count" data-testid="twist-assignment-count">{counts?`正 ${n} 边形有效赋型 ${counts.valid} / ${counts.all}`:`正 ${n} 边形：查询当前中心边序列`}</span></div>
      {!checkHalfPlane&&<p className="note">多边形原包装仍筛选下角&gt;0、上角&lt;180°。原三边查询保留全部代数角和具体求值状态；未返回区间不是数学无解结论。</p>}
      {types&&<p className="note" data-testid="twist-current-types">当前中心边 {types.join('')}：{regularPolygonTwistValid(n,alpha,types)?'符合正多边形判据':'不符合正多边形判据'}。自定义轮廓须另行检查实际折痕。</p>}
      {resultGrid(valid,counts?.valid,'有效山谷序列','valid')}
      <p className="twist-assignment-export-status" role="status">{exportStatus}</p>
    </>:<>
      <p className="note">查询正 {n} 边形的有效山谷与中心扭转多边形是否完全留在单位拼块内；自定义外轮廓还须检查实际几何。</p>
      <div className="spherical-vertex-tabs" role="group" aria-label="自包含参数形式">
        <button aria-pressed={form==='pleat'} onClick={()=>setForm('pleat')}>褶倾角 τ／偏置 d</button>
        <button aria-pressed={form==='twist'} onClick={()=>setForm('twist')}>扭角 α</button>
      </div>
      <div className="tess-pair">
        <TessNumberField label="褶宽 w" value={width} min={.01} max={.49} step={.01} onChange={setWidth}/>
        {form==='pleat'?<TessNumberField label="褶倾角 τ" value={tilt} min={.1} max={179.9} step={.1} onChange={setTilt}/>:<TessNumberField label="扭角 α" value={alpha} min={.1} max={179.9} step={.1} onChange={setAlpha}/>}
      </div>
      <div className="twist-analysis-angle">
        {form==='pleat'&&<TessNumberField label="偏置 d" value={offset} min={-.4} max={.4} step={.01} onChange={setOffset}/>}
        {n<=12?<label className="select-field">查询中心边山谷 <select aria-label="自包含查询山谷" value={chosen} onChange={event=>setChosen(event.target.value)}>{sequences.map(sequence=><option value={sequence} key={sequence}>{sequence}</option>)}</select></label>:<label className="select-field twist-assignment-custom">查询中心边山谷<input aria-label="自包含查询山谷" value={chosen} onChange={event=>setChosen(event.target.value.toUpperCase())} maxLength={n} spellCheck={false} aria-invalid={chosen.length!==n||/[^MV]/.test(chosen)}/></label>}
      </div>
      <div className="twist-analysis-ranges">
        <div><b>居中扭转</b><span data-testid="twist-contained-centered">{n<=12?chosen:'当前序列'}：{currentCentered?'自包含':'不自包含'}{counts?`；有效赋型 ${counts.centered} / ${counts.all}`:''}</span></div>
        <div><b>偏置扭转</b><span data-testid="twist-contained-offset">{n<=12?chosen:'当前序列'}：{currentOffset?'自包含':'不自包含'}</span></div>
      </div>
      <p className="note">下列序列满足居中单元判据。可输入山谷序列查询偏置单元；自包含不代表整片层序已解。</p>
      {resultGrid(centered,counts?.centered,'自包含山谷序列','centered')}
      <p className="twist-assignment-export-status" role="status">{exportStatus}</p>
    </>}
  </TessDialog>;
}
