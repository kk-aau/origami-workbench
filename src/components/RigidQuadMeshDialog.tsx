import {useEffect,useMemo,useRef,useState,type FormEvent,type PointerEvent} from 'react';
import {api} from '../app/api';
import {TessDialog} from './TessellationEditor';
import './rigidQuadMeshDialog.css';

export type RigidQuadMeshQuery={
  operation:'rigid-quad-mesh';
  bottomDirectionsDeg:number[];
  bottomFoldAnglesDeg:number[];
  leftDirectionsDeg:number[];
  leftFoldAnglesDeg:number[];
  minimumEdgeLength:number;
  minimumEdgeLengths?:[number,number,number,number][];
  baseFaces?:[number,number][];
  rectangular?:boolean;
  cornerAnglesDeg?:number[];
  samePtTolerance?:number|null;
  addPlaneGraph?:boolean;
  printSectorsOnFail?:boolean;
};

export type RigidQuadMeshResult={
  kind:'origamica-rigid-rectangular-quad-mesh'|'origamica-rigid-nonrectangular-quad-mesh';
  vertices_coords:[number,number][];
  vertices_coords3d:[number,number,number][];
  edges_vertices:[number,number][];
  edges_assignment:('B'|'M'|'V'|'U')[];
  faces_vertices:number[][];
  horizontalFaces:number;
  verticalFaces:number;
  minimumTotalEdgeLength:number;
  maximumGridClosureError:number;
  maximumFaceDistanceError:number;
  maximumFoldAngleErrorRad:number;
  maximumSharedEdgeDirectionError:number;
  faceAreaSumError:number;
  staticGlobalIsometryChecked:boolean;
  continuousRigidPathChecked:boolean;
  selfCollisionChecked:boolean;
  rectangular:boolean;
  cornerAnglesDeg:number[];
  samePtTolerance:number|null;
  planeGraphBuilt:boolean;
  unverifiedOrigamicaOptions?:string[];
};

type InputKey='bottomDirections'|'bottomFolds'|'leftDirections'|'leftFolds';
type MeshInputs=Record<InputKey,string>&{minimumEdgeLength:string;minimumEdgeLengths:string;baseFaces:string;rectangular:boolean;cornerAngles:string;samePtTolerance:string;addPlaneGraph:boolean;printSectorsOnFail:boolean};
type View='crease'|'folded';

const small=2*Math.atan(1/Math.sqrt(2))*180/Math.PI;
const large=2*Math.atan(Math.sqrt(2))*180/Math.PI;
const presets:{label:string;values:MeshInputs}[]=[
  {label:'原版 Miura 3×3',values:{
    bottomDirections:'90, 90',bottomFolds:`${-small}, ${small}`,
    leftDirections:'30, 30',leftFolds:`${large}, ${-large}`,minimumEdgeLength:'1',minimumEdgeLengths:'',baseFaces:'',rectangular:true,cornerAngles:'90',samePtTolerance:'0.000001',addPlaneGraph:true,printSectorsOnFail:false,
  }},
  {label:'原版四边网格 5×5',values:{
    bottomDirections:'90, 90, 90, 90',bottomFolds:'120, -120, -120, 120',
    leftDirections:'0, 0, 0, 0',leftFolds:'90, -90, -90, 90',minimumEdgeLength:'1',minimumEdgeLengths:'',baseFaces:'',rectangular:true,cornerAngles:'90',samePtTolerance:'0.000001',addPlaneGraph:true,printSectorsOnFail:false,
  }},
  {label:'原版背板＋三角面',values:{
    bottomDirections:'90, 90, 90, 90, 90',bottomFolds:'108, -72, -72, -72, 108',
    leftDirections:'0, 0, 0, 0',leftFolds:'132.5, -132.5, -132.5, 132.5',
    minimumEdgeLength:'1',minimumEdgeLengths:'1,6,2,0',baseFaces:'0,0; 5,0',rectangular:true,cornerAngles:'90',samePtTolerance:'0.000001',addPlaneGraph:true,printSectorsOnFail:false,
  }},
  {label:'非矩形 Miura',values:{
    bottomDirections:'90, 90',bottomFolds:`${-small}, ${small}`,
    leftDirections:'30, 30',leftFolds:`${large}, ${-large}`,
    minimumEdgeLength:'1',minimumEdgeLengths:'',baseFaces:'',rectangular:false,cornerAngles:'95, 85, 95, 85',samePtTolerance:'0.000001',addPlaneGraph:true,printSectorsOnFail:false,
  }},
];

function inputsFromQuery(initial?:Partial<RigidQuadMeshQuery>):MeshInputs{
  const values={...presets[0].values};
  if(!initial)return values;
  const lists:[keyof RigidQuadMeshQuery,InputKey][]=[
    ['bottomDirectionsDeg','bottomDirections'],
    ['bottomFoldAnglesDeg','bottomFolds'],
    ['leftDirectionsDeg','leftDirections'],
    ['leftFoldAnglesDeg','leftFolds'],
  ];
  for(const [queryKey,inputKey] of lists){
    const list=initial[queryKey];
    if(Array.isArray(list))values[inputKey]=list.join(', ');
  }
  if(initial.minimumEdgeLength!==undefined)values.minimumEdgeLength=String(initial.minimumEdgeLength);
  if(initial.minimumEdgeLengths)values.minimumEdgeLengths=initial.minimumEdgeLengths.map(row=>row.join(',')).join('; ');
  if(initial.baseFaces)values.baseFaces=initial.baseFaces.map(row=>row.join(',')).join('; ');
  if(initial.rectangular!==undefined)values.rectangular=initial.rectangular;
  if(initial.cornerAnglesDeg)values.cornerAngles=initial.cornerAnglesDeg.join(', ');
  if(initial.samePtTolerance!==undefined)values.samePtTolerance=initial.samePtTolerance===null?'None':String(initial.samePtTolerance);
  return values;
}

const fields:{key:InputKey;label:string;hint:string}[]=[
  {key:'bottomDirections',label:'底边方向 φb',hint:'从左往右 · °'},
  {key:'bottomFolds',label:'底边折角 γb',hint:'谷 + / 山 − · °'},
  {key:'leftDirections',label:'左边方向 φl',hint:'从下往上 · °'},
  {key:'leftFolds',label:'左边折角 γl',hint:'谷 + / 山 − · °'},
];

function parseList(value:string,label:string){
  const parts=value.trim().split(/[，,;；\s]+/).filter(Boolean);
  if(parts.length<1||parts.length>12)throw Error(`${label}须有 1–12 个角度。`);
  const numbers=parts.map(Number);
  if(numbers.some(number=>!Number.isFinite(number)))throw Error(`${label}须填写有限数值。`);
  return numbers;
}

function parseRows(value:string,width:number,label:string):number[][]{
  if(!value.trim())return [];
  const rows=value.trim().split(/[;；\n]+/).map(row=>row.trim()).filter(Boolean);
  if(rows.length>256)throw Error(`${label}最多填写 256 项。`);
  return rows.map(row=>{
    const numbers=row.split(/[，,\s]+/).filter(Boolean).map(Number);
    if(numbers.length!==width||numbers.some(number=>!Number.isFinite(number)))
      throw Error(`${label}每项须有 ${width} 个有限数值，以分号隔开。`);
    return numbers;
  });
}

function parseQuery(inputs:MeshInputs):RigidQuadMeshQuery{
  const bottomDirectionsDeg=parseList(inputs.bottomDirections,'底边方向');
  const bottomFoldAnglesDeg=parseList(inputs.bottomFolds,'底边折角');
  const leftDirectionsDeg=parseList(inputs.leftDirections,'左边方向');
  const leftFoldAnglesDeg=parseList(inputs.leftFolds,'左边折角');
  if(bottomDirectionsDeg.length!==bottomFoldAnglesDeg.length||leftDirectionsDeg.length!==leftFoldAnglesDeg.length)
    throw Error('同一边的方向和折角数量须相同。');
  if([...bottomFoldAnglesDeg,...leftFoldAnglesDeg].some(angle=>angle===0||Math.abs(angle)>=180))
    throw Error('折角须为非零值，严格位于 −180° 与 180° 之间。');
  if(bottomFoldAnglesDeg.some(bottom=>leftFoldAnglesDeg.some(left=>Math.abs(Math.abs(bottom)-Math.abs(left))<1e-9)))
    throw Error('底边与左边的折角绝对值不能相同，否则扇区退化。');
  const minimumEdgeLength=Number(inputs.minimumEdgeLength);
  if(!inputs.minimumEdgeLength.trim()||!Number.isFinite(minimumEdgeLength)||minimumEdgeLength<1e-5||minimumEdgeLength>1000)
    throw Error('最小边长须为 0.00001–1000 的有限数值。');
  const horizontalFaces=bottomDirectionsDeg.length+1,verticalFaces=leftDirectionsDeg.length+1;
  const baseFaces=parseRows(inputs.baseFaces,2,'背板面').map(row=>{
    const [i,j]=row;
    if(!Number.isInteger(i)||!Number.isInteger(j)||i<0||i>=horizontalFaces||j<0||j>=verticalFaces)
      throw Error(`背板面索引须落在 0–${horizontalFaces-1}、0–${verticalFaces-1} 范围内。`);
    return [i,j] as [number,number];
  });
  if(new Set(baseFaces.map(row=>row.join(','))).size!==baseFaces.length)throw Error('背板面索引不能重复。');
  const minimumEdgeLengths=parseRows(inputs.minimumEdgeLengths,4,'逐边最小长度').map(row=>{
    const [direction,i,j,length]=row;
    if(!Number.isInteger(direction)||!Number.isInteger(i)||!Number.isInteger(j)||![0,1].includes(direction)||i<0||j<0||length<0||length>1000||
      (direction===0?(i>=horizontalFaces||j>verticalFaces):(i>horizontalFaces||j>=verticalFaces)))
      throw Error('逐边索引须为有效的 [方向 0/1, i, j, 长度 ≥0]。');
    return [direction,i,j,length] as [number,number,number,number];
  });
  if(new Set(minimumEdgeLengths.map(row=>row.slice(0,3).join(','))).size!==minimumEdgeLengths.length)
    throw Error('逐边最小长度索引不能重复。');
  let cornerAnglesDeg:number[]|undefined;
  if(!inputs.rectangular){
    const enteredCorners=parseList(inputs.cornerAngles,'四角面角度');
    if(![1,4].includes(enteredCorners.length)||enteredCorners.some(angle=>angle<=0||angle>180))
      throw Error('四角面角度须为一个或四个 (0°, 180°] 的角度。');
    cornerAnglesDeg=enteredCorners.length===1?Array(4).fill(enteredCorners[0]) as number[]:enteredCorners;
  }
  const toleranceText=inputs.samePtTolerance.trim();
  const samePtTolerance=/^(none|null)$/i.test(toleranceText)?null:Number(toleranceText);
  if(!toleranceText||(samePtTolerance!==null&&(!Number.isFinite(samePtTolerance)||samePtTolerance<0)))
    throw Error('并点容差须为非负有限数值，或填写 None 表示不并点。');
  return {operation:'rigid-quad-mesh',bottomDirectionsDeg,bottomFoldAnglesDeg,
    leftDirectionsDeg,leftFoldAnglesDeg,minimumEdgeLength,
    ...(baseFaces.length?{baseFaces}:{}),...(minimumEdgeLengths.length?{minimumEdgeLengths}:{}),
    rectangular:inputs.rectangular,...(cornerAnglesDeg?{cornerAnglesDeg}:{}),
    samePtTolerance,addPlaneGraph:inputs.addPlaneGraph,printSectorsOnFail:inputs.printSectorsOnFail};
}

type Projection={points:[number,number][];viewBox:string;nodeRadius:number};
function project(result:RigidQuadMeshResult,view:View,azimuth:number,elevation:number):Projection{
  const flat=result.vertices_coords;
  const folded=result.vertices_coords3d;
  const center:[number,number,number]=[
    folded.reduce((sum,point)=>sum+point[0],0)/folded.length,
    folded.reduce((sum,point)=>sum+point[1],0)/folded.length,
    folded.reduce((sum,point)=>sum+point[2],0)/folded.length,
  ];
  const theta=azimuth*Math.PI/180,phi=elevation*Math.PI/180;
  const c=Math.cos(theta),s=Math.sin(theta),ce=Math.cos(phi),se=Math.sin(phi);
  const points:[number,number][]=view==='crease'
    ?flat.map(([x,y])=>[x,-y])
    :folded.map(([x,y,z])=>{
      const dx=x-center[0],dy=y-center[1],dz=z-center[2];
      const rotatedX=c*dx-s*dy,rotatedY=s*dx+c*dy;
      return [rotatedX,-(ce*rotatedY-se*dz)];
    });
  const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
  const left=Math.min(...xs),top=Math.min(...ys);
  const width=Math.max(...xs)-left,height=Math.max(...ys)-top;
  const padding=Math.max(width,height,1)*.07;
  return {points,viewBox:`${left-padding} ${top-padding} ${Math.max(width+2*padding,.01)} ${Math.max(height+2*padding,.01)}`,
    nodeRadius:Math.max(width,height,.1)*.006};
}

function MeshDrawing({result,view,azimuth,elevation,onPointerDown,onPointerMove,onPointerEnd}:{
  result:RigidQuadMeshResult;view:View;azimuth:number;elevation:number;
  onPointerDown:(event:PointerEvent<SVGSVGElement>)=>void;
  onPointerMove:(event:PointerEvent<SVGSVGElement>)=>void;
  onPointerEnd:()=>void;
}){
  const {points,viewBox,nodeRadius}=useMemo(()=>project(result,view,azimuth,elevation),[result,view,azimuth,elevation]);
  return <svg className="rigid-mesh-svg" role="img" aria-label={view==='crease'?'刚性四边网格折痕图':'由真实三维顶点投影的刚性四边网格线框'} viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
    {result.edges_vertices.map(([a,b],index)=>{
      const first=points[a],last=points[b];
      if(!first||!last)return null;
      return <line key={index} className={`rigid-mesh-edge rigid-mesh-edge-${result.edges_assignment[index]?.toLowerCase()??'u'}`}
        x1={first[0]} y1={first[1]} x2={last[0]} y2={last[1]} vectorEffect="non-scaling-stroke"/>;
    })}
    {points.map(([x,y],index)=><circle key={index} cx={x} cy={y} r={nodeRadius} className="rigid-mesh-node" vectorEffect="non-scaling-stroke"/>)}
  </svg>;
}

function measure(value:number){return Number.isFinite(value)?value.toExponential(2):'—';}

function waitForWorker(signal:AbortSignal){
  return new Promise<void>(resolve=>{
    const cancel=()=>{clearTimeout(timer);resolve();};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},900);
    signal.addEventListener('abort',cancel,{once:true});
  });
}

export default function RigidQuadMeshDialog({onClose,onUseResult,initial}:{
  onClose:()=>void;
  onUseResult?:(query:RigidQuadMeshQuery,result:RigidQuadMeshResult)=>void;
  initial?:Partial<RigidQuadMeshQuery>;
}){
  const [inputs,setInputs]=useState<MeshInputs>(()=>inputsFromQuery(initial));
  const [result,setResult]=useState<RigidQuadMeshResult|null>(null);
  const [submittedQuery,setSubmittedQuery]=useState<RigidQuadMeshQuery|null>(null);
  const [view,setView]=useState<View>('crease');
  const [azimuth,setAzimuth]=useState(-25),[elevation,setElevation]=useState(48);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const pending=useRef<AbortController|null>(null);
  const drag=useRef<{x:number;y:number;azimuth:number;elevation:number}|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const invalidate=()=>{pending.current?.abort();pending.current=null;setBusy(false);setResult(null);setSubmittedQuery(null);setError('');};
  const edit=<K extends keyof MeshInputs>(key:K,value:MeshInputs[K])=>{invalidate();setInputs(previous=>({...previous,[key]:value}));};
  const choosePreset=(index:number)=>{invalidate();setInputs({...presets[index].values});setView('crease');};
  const calculate=async(event?:FormEvent)=>{
    event?.preventDefault();
    pending.current?.abort();setResult(null);setSubmittedQuery(null);setError('');
    let query:RigidQuadMeshQuery;
    try{query=parseQuery(inputs);}catch(cause){setError((cause as Error).message);return;}
    const controller=new AbortController();pending.current=controller;setBusy(true);
    try{
      let next:RigidQuadMeshResult;
      for(let attempt=0;;attempt++){
        try{next=await api<RigidQuadMeshResult>('tessellation/rigid-quad-mesh',query,controller.signal);break;}
        catch(cause){
          if(controller.signal.aborted||attempt>=70||!(cause as Error).message.includes('已有镶嵌计算正在进行'))throw cause;
          await waitForWorker(controller.signal);
        }
      }
      if(!controller.signal.aborted){
        if(!['origamica-rigid-rectangular-quad-mesh','origamica-rigid-nonrectangular-quad-mesh'].includes(next.kind)||
          next.rectangular!==query.rectangular||!next.staticGlobalIsometryChecked)
          throw Error('网格尚未通过静态等距检查。');
        setResult(next);setSubmittedQuery(query);
      }
    }catch(cause){if(!controller.signal.aborted)setError((cause as Error).message);}
    finally{if(pending.current===controller){pending.current=null;setBusy(false);}}
  };
  const beginDrag=(event:PointerEvent<SVGSVGElement>)=>{
    if(view!=='folded')return;
    drag.current={x:event.clientX,y:event.clientY,azimuth,elevation};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag=(event:PointerEvent<SVGSVGElement>)=>{
    if(!drag.current)return;
    setAzimuth(drag.current.azimuth+(event.clientX-drag.current.x)*.45);
    setElevation(Math.max(5,Math.min(85,drag.current.elevation+(event.clientY-drag.current.y)*.4)));
  };
  const useResult=()=>{
    if(!result||!submittedQuery||!onUseResult)return;
    try{onUseResult(submittedQuery,result);}catch(cause){setError((cause as Error).message);}
  };
  return <TessDialog title="刚性四边网格" onClose={onClose}>
    <div className="rigid-mesh-dialog">
      <div className="rigid-mesh-intro">
        <p>给出底边与左边的方向和有向折角，构造纸张上的静态等距刚性网格。</p>
        <div className="rigid-mesh-presets" role="group" aria-label="刚性四边网格示例">
          {presets.map((preset,index)=><button type="button" key={preset.label} onClick={()=>choosePreset(index)}>{preset.label}</button>)}
        </div>
      </div>
      <form className="rigid-mesh-inputs" onSubmit={event=>void calculate(event)}>
        <div className="rigid-mesh-input-title"><strong>边界输入</strong><span>逗号分隔 · °</span></div>
        {fields.map(field=><label key={field.key}><span>{field.label}<small>{field.hint}</small></span>
          <input aria-label={field.label} value={inputs[field.key]} onChange={event=>edit(field.key,event.target.value)} spellCheck={false}/>
        </label>)}
        <label><span>最小边长<small>所有折痕段</small></span>
          <input type="number" step="any" min="0.00001" max="1000" aria-label="最小边长" value={inputs.minimumEdgeLength} onChange={event=>edit('minimumEdgeLength',event.target.value)}/>
        </label>
        <div className="rigid-mesh-pair">
          <label><span>纸张轮廓</span><select aria-label="纸张轮廓" value={inputs.rectangular?'rectangular':'irregular'} onChange={event=>edit('rectangular',event.target.value==='rectangular')}>
            <option value="rectangular">矩形</option><option value="irregular">非矩形</option>
          </select></label>
          <label><span>四角面角度<small>°</small></span><input aria-label="四角面角度" value={inputs.cornerAngles} onChange={event=>edit('cornerAngles',event.target.value)} disabled={inputs.rectangular} spellCheck={false}/></label>
        </div>
        <label><span>背板面 BaseFaces<small>i,j；可多项</small></span>
          <input aria-label="背板面 BaseFaces" placeholder="0,0; 5,0" value={inputs.baseFaces} onChange={event=>edit('baseFaces',event.target.value)} spellCheck={false}/>
        </label>
        <label><span>逐边最小长度<small>方向,i,j,长度；0 可并点</small></span>
          <input aria-label="逐边最小长度" placeholder="1,6,2,0" value={inputs.minimumEdgeLengths} onChange={event=>edit('minimumEdgeLengths',event.target.value)} spellCheck={false}/>
        </label>
        <details className="rigid-mesh-advanced"><summary>高级设置 · 并点与诊断</summary>
          <label><span>并点容差<small>None 不并点</small></span><input aria-label="并点容差" value={inputs.samePtTolerance} onChange={event=>edit('samePtTolerance',event.target.value)} spellCheck={false}/></label>
          <label className="rigid-mesh-check"><input type="checkbox" checked={inputs.addPlaneGraph} onChange={event=>edit('addPlaneGraph',event.target.checked)}/><span>构建平面图与面结构</span></label>
          <label className="rigid-mesh-check"><input type="checkbox" checked={inputs.printSectorsOnFail} onChange={event=>edit('printSectorsOnFail',event.target.checked)}/><span>求解失败时显示扇区角</span></label>
        </details>
        <button type="submit" className="primary rigid-mesh-calculate" disabled={busy}>{busy?'正在求解…':'计算网格'}</button>
        <div className="rigid-mesh-feedback" role={error?'alert':'status'}>{error|| (busy?'正在核对二维与三维闭合…':result&&!result.planeGraphBuilt?'未构建平面图：可查看线框，不能作为有面候选采用。':inputs.rectangular?'静态等距验证；连续折叠路径与碰撞尚未验证。':result?.unverifiedOrigamicaOptions?.length?'背板局部解，静态已验；原版无数值对照。':'非矩形：局部优化；静态等距已核验，全局最短、连续路径与碰撞未验证。')}</div>
      </form>
      <section className="rigid-mesh-preview" aria-label="刚性四边网格预览">
        <div className="rigid-mesh-preview-head">
          <div className="rigid-mesh-view-switch" role="group" aria-label="网格视图">
            <button type="button" aria-pressed={view==='crease'} onClick={()=>setView('crease')}>折痕图</button>
            <button type="button" aria-pressed={view==='folded'} onClick={()=>setView('folded')}>三维线框</button>
          </div>
          {result&&<span>{result.vertices_coords.length} 点 · {result.edges_vertices.length} 边 · {result.faces_vertices.length} 面</span>}
        </div>
        <div className="rigid-mesh-viewport">
          {result?<MeshDrawing result={result} view={view} azimuth={azimuth} elevation={elevation}
            onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerEnd={()=>{drag.current=null;}}/>
            :<div className="rigid-mesh-empty"><span className="rigid-mesh-empty-mark">◇</span><strong>等待构造</strong><small>选择示例并计算，查看折痕图和真实三维坐标。</small></div>}
          {result&&view==='folded'&&<span className="rigid-mesh-drag-hint">拖动旋转视角</span>}
        </div>
        <div className="rigid-mesh-preview-bottom">
          <div className="rigid-mesh-legend"><span><i className="boundary"/>边界</span><span><i className="mountain"/>山折</span><span><i className="valley"/>谷折</span></div>
          {view==='folded'&&<button type="button" className="rigid-mesh-reset" onClick={()=>{setAzimuth(-25);setElevation(48);}}>重置视角</button>}
        </div>
      </section>
      <footer className="rigid-mesh-footer">
        {result?<div className="rigid-mesh-metrics">
          <span>面内误差 <b>{measure(result.maximumFaceDistanceError)}</b></span>
          <span>网格闭合 <b>{measure(result.maximumGridClosureError)}</b></span>
          <span>折角误差 <b>{measure(result.maximumFoldAngleErrorRad)} rad</b></span>
        </div>:<span>{inputs.rectangular?'矩形纸 · 背板约束与零长边并点':'非矩形纸 · 四角面角度与最短边长约束'}</span>}
        {onUseResult&&result?.staticGlobalIsometryChecked&&result.planeGraphBuilt&&submittedQuery&&<button type="button" className="primary" onClick={useResult}>用于当前镶嵌画布</button>}
      </footer>
    </div>
  </TessDialog>;
}
