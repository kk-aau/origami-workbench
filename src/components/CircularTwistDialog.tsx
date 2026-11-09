import {useEffect,useMemo,useState} from 'react';
import {api} from '../app/api';
import {centeredUnitTriangleVertices,unitRegularCircularTwist,unitRegularPolygonVertices} from '../app/circularTwistOriginal';
import {tessGeometryError,type TessGraph,type XY} from '../app/tessellation';
import TessNumberField from './TessNumberField';
import {TessDialog} from './TessellationEditor';
import './CircularTwistDialog.css';

type Assignment='M'|'V'|'U';
export type CircularTwistInput={
  family:'circular-twist';polygon:XY[];angle:number;radius:number;
  circleDivisions:number;centralTypes:Assignment[];stationaryFace:'auto'|number;
};
type CircularTwistResult={
  fold:TessGraph;
  stats:{vertices:number;edges:number;faces:number;checks:{geometry:{status:string};local:{status:string}}};
  source:{foldedForm:XY[];circularizedFoldedForm:XY[];closureError:number;foldedFormStationaryFace:number};
  warnings:string[];
};
type View='creases'|'flat'|'drawing';
const ORIGINAL:XY[]=[[0,0],[1,0],[.5,.4]];
const DEFAULT:CircularTwistInput={family:'circular-twist',polygon:ORIGINAL,angle:30,radius:2,circleDivisions:16,centralTypes:['M','M','V'],stationaryFace:'auto'};

function matchesUnitRegularPolygon(points:XY[]):boolean{
  const expected=unitRegularPolygonVertices(points.length);
  return points.every((point,index)=>Math.hypot(point[0]-expected[index][0],point[1]-expected[index][1])<1e-8);
}
function readPolygon(text:string):XY[]{
  let raw:unknown;
  try{raw=JSON.parse(text);}catch{throw Error('中心顶点须填写为 [[x,y], …]。');}
  if(!Array.isArray(raw)||raw.length<3||raw.length>64||raw.some(point=>!Array.isArray(point)||point.length!==2||point.some(value=>typeof value!=='number'||!Number.isFinite(value)))){
    throw Error('中心多边形须有 3–64 个有限二维顶点。');
  }
  const points=raw as XY[];
  const problem=tessGeometryError(points,-1000,1000,[points.map((_,i)=>i)],true);
  if(problem)throw Error(problem);
  return points;
}

function Drawing({result,view}:{result:CircularTwistResult;view:View}){
  const coords=view==='creases'?result.fold.vertices_coords:view==='flat'?result.source.foldedForm:result.source.circularizedFoldedForm;
  const xs=coords.map(point=>point[0]),ys=coords.map(point=>point[1]);
  const left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top;
  const span=Math.max(width,height,.01),pad=span*.08;
  return <svg className="circular-twist-drawing" data-testid="circular-twist-drawing"
    aria-label={view==='creases'?'圆形扭转折痕图':view==='flat'?'逐面等距平折线图':'原版外缘圆化绘图示意'}
    viewBox={`${left-pad} ${top-pad} ${Math.max(width,.01)+2*pad} ${Math.max(height,.01)+2*pad}`} preserveAspectRatio="xMidYMid meet">
    {result.fold.edges_vertices.map(([a,b],index)=>{
      const type=result.fold.edges_assignment[index];
      const colors:Record<string,string>={M:'#c44049',V:'#315fca',B:'#263d36',U:'#889b95'};
      return <line key={index} x1={coords[a][0]} y1={coords[a][1]} x2={coords[b][0]} y2={coords[b][1]}
        stroke={colors[type]??'#889b95'} strokeWidth={type==='B'?1.75:1.3}
        strokeDasharray={type==='U'?'3 2':undefined} vectorEffect="non-scaling-stroke"/>;
    })}
  </svg>;
}

/** Edits Origamica's one-polygon circular construction before applying it to the workspace. */
export default function CircularTwistDialog({initial,polygon,generationBusy=false,onApply,onClose}:{
  initial?:Partial<CircularTwistInput>;polygon?:XY[];
  generationBusy?:boolean;
  onApply:(params:CircularTwistInput)=>void;onClose:()=>void;
}){
  const [params,setParams]=useState<CircularTwistInput>(()=>{
    const selected=initial?.polygon??polygon??ORIGINAL;
    const types=initial?.centralTypes?.length===selected.length?initial.centralTypes:
      selected.length===3?['M','M','V'] as Assignment[]:selected.map(()=>'M' as Assignment);
    return {...DEFAULT,...initial,polygon:structuredClone(selected),centralTypes:types};
  });
  const [polygonText,setPolygonText]=useState(()=>JSON.stringify(params.polygon));
  const [regularSides,setRegularSides]=useState(()=>matchesUnitRegularPolygon(params.polygon)?params.polygon.length:4);
  const [magnification,setMagnification]=useState(()=>matchesUnitRegularPolygon(params.polygon)?
    params.radius*2*Math.sin(Math.PI/params.polygon.length):3);
  const [triangleA,setTriangleA]=useState(40),[triangleB,setTriangleB]=useState(60);
  const [result,setResult]=useState<{key:string;value:CircularTwistResult}|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[view,setView]=useState<View>('creases');
  const input=useMemo(()=>{
    try{return {...params,polygon:readPolygon(polygonText)};}
    catch{return null;}
  },[params,polygonText]);
  const inputKey=input?JSON.stringify(input):'';
  const current=result?.key===inputKey?result.value:null;
  useEffect(()=>{
    let query:CircularTwistInput;
    try{query={...params,polygon:readPolygon(polygonText)};}
    catch(cause){setError((cause as Error).message);setBusy(false);return;}
    if(query.centralTypes.length!==query.polygon.length){setError('中心边山谷数量须与多边形边数一致。');setBusy(false);return;}
    if(generationBusy){setBusy(true);setError('');return;}
    const controller=new AbortController();
    let retry:ReturnType<typeof setTimeout>|undefined;
    const run=()=>{
      setBusy(true);setError('');
      void api<CircularTwistResult>('tessellation/circular-twist',query,controller.signal)
        .then(value=>{if(!controller.signal.aborted){setResult({key:JSON.stringify(query),value});setBusy(false);}})
        .catch(cause=>{
          if(controller.signal.aborted)return;
          const message=(cause as Error).message;
          if(message.includes('已有镶嵌计算正在进行'))retry=setTimeout(run,900);
          else{setError(message);setBusy(false);}
        });
    };
    const timer=setTimeout(run,110);
    return()=>{clearTimeout(timer);if(retry)clearTimeout(retry);controller.abort();};
  },[params,polygonText,generationBusy]);
  const patch=(change:Partial<CircularTwistInput>)=>setParams(old=>({...old,...change}));
  const changePolygon=(text:string)=>{
    setPolygonText(text);setResult(null);
    try{
      const points=readPolygon(text);
      setParams(old=>({...old,polygon:points,centralTypes:points.map((_,index)=>old.centralTypes[index]??'M'),
        stationaryFace:old.stationaryFace==='auto'||old.stationaryFace<=2*points.length+1?old.stationaryFace:'auto'}));
    }catch{/* Keep an incomplete coordinate draft editable. */}
  };
  const choosePreset=(points:XY[])=>{
    setPolygonText(JSON.stringify(points));
    patch({...DEFAULT,polygon:points,centralTypes:points.length===3?['M','M','V']:points.map(()=>'M')});
  };
  const chooseRegular=(sides=regularSides,m=magnification,types?:Assignment[])=>{
    try{
      const {polygon,radius}=unitRegularCircularTwist(sides,m);
      setPolygonText(JSON.stringify(polygon));
      patch({polygon,radius,angle:types?30:params.angle,circleDivisions:types?64:params.circleDivisions,
        centralTypes:types??(params.centralTypes.length===sides?params.centralTypes:polygon.map(()=>'M')),
        stationaryFace:'auto'});
      setRegularSides(sides);setMagnification(m);
      setError('');
    }catch(cause){setError((cause as Error).message);}
  };
  const chooseTriangle=(sample=false)=>{
    try{
      const polygon=centeredUnitTriangleVertices(sample?40:triangleA,sample?60:triangleB);
      setPolygonText(JSON.stringify(polygon));
      if(sample){setTriangleA(40);setTriangleB(60);}
      patch({polygon,angle:sample?20:params.angle,radius:sample?1.5:params.radius,
        circleDivisions:sample?64:params.circleDivisions,
        centralTypes:sample?['M','M','M']:
          (params.centralTypes.length===3?params.centralTypes:['M','M','M']),stationaryFace:'auto'});
      setError('');
    }catch(cause){setError((cause as Error).message);}
  };
  return <TessDialog title="原版圆形多边形扭转" onClose={onClose}>
    <div className="circular-twist-layout">
      <div className="circular-twist-parameters">
        <div className="circular-twist-presets" role="group" aria-label="中心多边形预设">
          <button onClick={()=>choosePreset(ORIGINAL)}>原版三角例</button>
          <button onClick={()=>chooseRegular(4,3,['M','M','V','V'])}>原版正四边例</button>
          <button onClick={()=>chooseRegular(6,3,['M','V','M','V','M','V'])}>原版正六边例</button>
          <button onClick={()=>chooseTriangle(true)}>原版角度三角例</button>
        </div>
        <div className="circular-twist-regular" role="group" aria-label="原版单位正多边形参数">
          <label>边数 n<select aria-label="原版正多边形边数" value={regularSides}
            onChange={event=>setRegularSides(Number(event.target.value))}>
            {Array.from({length:62},(_,index)=><option key={index+3} value={index+3}>{index+3}</option>)}
          </select></label>
          <label>圆半径倍数 m<input aria-label="原版圆半径倍数" type="number" min="1.01" max="1000" step="0.1"
            value={magnification} onChange={event=>setMagnification(Number(event.target.value))}/></label>
          <button disabled={!Number.isFinite(magnification)||magnification<=1||
            magnification/(2*Math.sin(Math.PI/regularSides))>1000}
            onClick={()=>chooseRegular()}>按 n、m 生成</button>
        </div>
        <div className="circular-twist-regular" role="group" aria-label="原版单位三角形参数">
          <label>左底角 A<input aria-label="原版三角左底角" type="number" min="1" max="178" step="1"
            value={triangleA} onChange={event=>setTriangleA(Number(event.target.value))}/></label>
          <label>右底角 B<input aria-label="原版三角右底角" type="number" min="1" max="178" step="1"
            value={triangleB} onChange={event=>setTriangleB(Number(event.target.value))}/></label>
          <button disabled={!Number.isFinite(triangleA)||!Number.isFinite(triangleB)||
            triangleA<=0||triangleB<=0||triangleA+triangleB>=180}
            onClick={()=>chooseTriangle()}>按角度生成</button>
        </div>
        <label className="circular-twist-vertices">中心顶点，按边界顺序
          <textarea aria-label="圆形扭转中心顶点" value={polygonText} spellCheck={false}
            onChange={event=>changePolygon(event.target.value)}/>
        </label>
        <div className="circular-twist-numbers">
          <TessNumberField label="射线扭角 α" value={params.angle} min={-179} max={179} step={.1} onChange={angle=>patch({angle})}/>
          <TessNumberField label="纸张圆半径" value={params.radius} min={.01} max={1000} step={.01} onChange={radius=>patch({radius})}/>
          <TessNumberField label="圆周分段" value={params.circleDivisions} min={8} max={360} onChange={circleDivisions=>patch({circleDivisions})}/>
        </div>
        <label className="select-field">折后固定面
          <select aria-label="圆形扭转折后固定面" value={params.stationaryFace}
            onChange={event=>patch({stationaryFace:event.target.value==='auto'?'auto':Number(event.target.value)})}>
            <option value="auto">原版默认 · 末端楔面</option>
            {Array.from({length:2*params.centralTypes.length+1},(_,index)=><option key={index+1} value={index+1}>第 {index+1} 面</option>)}
          </select>
        </label>
        <div className="circular-twist-types" role="group" aria-label="中心边山谷赋型">
          {params.centralTypes.map((type,index)=><label key={index}>边 {index+1}
            <select aria-label={`圆形扭转中心边 ${index+1}`} value={type}
              onChange={event=>patch({centralTypes:params.centralTypes.map((value,i)=>i===index?event.target.value as Assignment:value)})}>
              <option value="M">山 M</option><option value="V">谷 V</option><option value="U">待定 U</option>
            </select>
          </label>)}
        </div>
      </div>
      <div className="circular-twist-preview">
        <div className="spherical-vertex-tabs" role="tablist" aria-label="圆形扭转预览方式">
          <button role="tab" aria-selected={view==='creases'} aria-pressed={view==='creases'} onClick={()=>setView('creases')}>折痕图</button>
          <button role="tab" aria-selected={view==='flat'} aria-pressed={view==='flat'} onClick={()=>setView('flat')}>严格平折</button>
          <button role="tab" aria-selected={view==='drawing'} aria-pressed={view==='drawing'} onClick={()=>setView('drawing')}>原版圆化图</button>
        </div>
        {current?<Drawing result={current} view={view}/>:<div className="circular-twist-placeholder" role="status">{error||busy?'参数检查中…':'准备圆形扭转…'}</div>}
        {current&&<div className="circular-twist-stats">
          <strong>{current.stats.vertices} 点 · {current.stats.edges} 边 · {current.stats.faces} 面</strong>
          <span>几何 {current.stats.checks.geometry.status==='passed'?'通过':'未通过'} · 局部 {current.stats.checks.local.status==='passed'?'通过':current.stats.checks.local.status==='incomplete'?'待定':'未通过'}</span>
          <span>固定第 {current.source.foldedFormStationaryFace} 面 · 闭合误差 {current.source.closureError.toExponential(1)}</span>
        </div>}
        <p className="note">{view==='drawing'?'此处仅对照原版外缘圆化坐标，未应用原版的遮挡线消隐；圆化也会改变面内长度。':'此处只显示逐面反射的几何线；采用参数后，工作区会单独尝试求解层序与可见面。连续折叠路径仍未验证。'}</p>
        {error&&<p role="alert" className="tess-editor-error">{error}</p>}
      </div>
    </div>
    <footer><span>{busy?'正在更新预览…':'当前参数将成为镶嵌工作区构造'}</span>
      <button className="primary" disabled={!current||!input||busy||!!error} onClick={()=>{if(input)onApply(input);}}>采用参数</button>
    </footer>
  </TessDialog>;
}
