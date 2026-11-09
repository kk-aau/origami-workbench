import {useEffect,useRef,useState} from 'react';
import {api} from '../app/api';
import {NumberField} from './Fields';
import {TessDialog} from './TessellationEditor';

type Bounds={sectorAnglesDeg:number[];maximumDihedralsDeg:number[];kind:'local-degree4-dihedral-bound';selfCollisionChecked:boolean;foldedForm3D:boolean};
type Pair={minorCreases:number[];majorCreases:number[];straightMinor:boolean;straightMajor:boolean};
type Branches={sectorAnglesDeg:number[];kind:'local-degree4-branch-geometry';flatFoldable:boolean;flatFoldabilityExcessDeg:number;minorFirst:Pair;majorFirst:Pair;assignmentChosen:boolean;selfCollisionChecked:boolean;foldedForm3D:boolean};
type Consistency={sectorAnglesDeg:number[];foldAnglesDeg:number[];kind:'local-degree4-fold-consistency';closureErrorDeg:number;compatible:boolean;toleranceDeg:number;selfCollisionChecked:boolean;foldedForm3D:boolean};
type Fan3D={kind:'local-single-vertex-fan3d';foldRays:[number,number,number][];faces:number[][];closureErrorRad:number;maxSectorErrorRad:number;maxFoldErrorRad:number;selfCollisionChecked:boolean;globalFoldabilityChecked:boolean};
type FoldVectorVertex={kind:'origamica-single-vertex-from-fold-vectors';foldVectors:[number,number,number][];sectorVectors:[number,number,number][];midfoldVectors:[number,number,number][];sectorAnglesDeg:number[];foldAnglesDeg:number[];sectorSumDeg:number;developable:boolean;globalRigidFoldingChecked:boolean;selfCollisionChecked:boolean};
type FoldAngleScale={kind:'origamica-rigid-fold-angle-scale';inputAnglesDeg:number[];scaledAnglesDeg:number[];multiplier:number;halfTangentScaleCommon:boolean;globalRigidFoldingChecked:boolean;selfCollisionChecked:boolean};
type RigidQuadVertex={kind:'origamica-rigid-single-vertex-quad-mesh';vertices_coords:[number,number][];vertices_coords3d:[number,number,number][];edges_vertices:[number,number][];edges_assignment:string[];sectorAnglesDeg:number[];foldAnglesDeg:number[];minimumTotalEdgeLength:number;maximumFaceDistanceError:number;localClosureErrorRad:number;continuousRigidPathChecked:boolean;selfCollisionChecked:boolean};
type Angles=[number,number,number,number];
type Analysis='maximum'|'branches'|'consistency'|'fan3d'|'vectors'|'scale'|'rigid-quad';
const originalFoldVectors=[
  [Math.cos(-Math.PI/18),Math.sin(-Math.PI/18),0],
  [-Math.sin(-Math.PI/18),Math.cos(-Math.PI/18),0],
  [0,0,1],
].map(ray=>ray.map(String));

function RigidQuadDrawing({result,folded}:{result:RigidQuadVertex;folded:boolean}){
  const coords=result.vertices_coords.map((point,i)=>folded?[result.vertices_coords3d[i][0]+.45*result.vertices_coords3d[i][2],result.vertices_coords3d[i][1]-.45*result.vertices_coords3d[i][2]]:point);
  const xs=coords.map(point=>point[0]),ys=coords.map(point=>point[1]);
  const left=Math.min(...xs),top=Math.min(...ys),span=Math.max(Math.max(...xs)-left,Math.max(...ys)-top,.01),pad=span*.05;
  return <svg className="rigid-quad-drawing" aria-label={folded?'单顶点四面三维投影':'单顶点四边网格折痕图'} viewBox={`${left-pad} ${top-pad} ${Math.max(...xs)-left+pad*2} ${Math.max(...ys)-top+pad*2}`} preserveAspectRatio="xMidYMid meet">
    {result.edges_vertices.map(([a,b],i)=><line key={i} x1={coords[a][0]} y1={coords[a][1]} x2={coords[b][0]} y2={coords[b][1]} stroke={result.edges_assignment[i]==='M'?'#c44049':result.edges_assignment[i]==='V'?'#315fca':'#263d36'} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>)}
  </svg>;
}

export default function SphericalVertexDialog({onClose}:{onClose:()=>void}){
  const [angles,setAngles]=useState<Angles>([90,45,135,90]);
  const [folds,setFolds]=useState<Angles>([0,0,0,0]);
  const [vectors,setVectors]=useState<string[][]>(()=>originalFoldVectors.map(ray=>[...ray]));
  const [scaleAngles,setScaleAngles]=useState('90, 120'),[scaleMode,setScaleMode]=useState<'multiplier'|'anchor'>('anchor');
  const [scaleMultiplier,setScaleMultiplier]=useState('0.5773502691896258'),[scaleOld,setScaleOld]=useState('120'),[scaleNew,setScaleNew]=useState('90');
  const [quadBottom,setQuadBottom]=useState<[string,string]>(['90','60']),[quadLeft,setQuadLeft]=useState<[string,string]>(['0','135']);
  const [quadMinEdge,setQuadMinEdge]=useState('1');
  const [analysis,setAnalysis]=useState<Analysis>('maximum');
  const [result,setResult]=useState<Bounds|Branches|Consistency|Fan3D|FoldVectorVertex|FoldAngleScale|RigidQuadVertex|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef<AbortController|null>(null);
  const fields=useRef<HTMLDivElement|null>(null);
  const foldFields=useRef<HTMLDivElement|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  const invalidate=()=>{request.current?.abort();setBusy(false);setResult(null);setError('');};
  const change=(index:number,value:number)=>{
    if(angles[index]===value)return;
    invalidate();
    setAngles(previous=>previous.map((a,i)=>i===index?value:a) as Angles);
  };
  const changeFold=(index:number,value:number)=>{
    if(folds[index]===value)return;
    invalidate();
    setFolds(previous=>previous.map((a,i)=>i===index?value:a) as Angles);
  };
  const changeVector=(row:number,column:number,value:string)=>{
    invalidate();setVectors(previous=>previous.map((ray,i)=>i===row?ray.map((coordinate,j)=>j===column?value:coordinate):ray));
  };
  const selectAnalysis=(next:Analysis)=>{if(next!==analysis){invalidate();setAnalysis(next);}};
  const calculate=async()=>{
    request.current?.abort();setBusy(false);setResult(null);setError('');
    let route:string,payload:Record<string,unknown>;
    if(analysis==='rigid-quad'){
      const values=[...quadBottom,...quadLeft,quadMinEdge].map(Number);
      if([...quadBottom,...quadLeft,quadMinEdge].some(value=>!value.trim())||values.some(value=>!Number.isFinite(value))||values[4]<=0||values[4]>1000||Math.abs(values[1])>=180||Math.abs(values[3])>=180){
        setError('方向角与折角须为有限数值；折角严格位于 ±180° 内，最短边长须大于 0。');return;
      }
      route='tessellation/rigid-single-vertex-quad-mesh';
      payload={bottom:values.slice(0,2),left:values.slice(2,4),minimumEdgeLength:values[4]};
    }else if(analysis==='scale'){
      const chunks=scaleAngles.split(/[，,;；\s]+/).filter(Boolean),values=chunks.map(Number);
      if(values.length<1||values.length>256||values.some(value=>!Number.isFinite(value)||Math.abs(value)>=180)){
        setError('折角需为 −180° 至 180° 之间的有限数字，最多 256 个。');return;
      }
      if(scaleMode==='multiplier'){
        const value=Number(scaleMultiplier);
        if(!scaleMultiplier.trim()||!Number.isFinite(value)){setError('半角正切倍率须为有限数字。');return;}
        payload={anglesDeg:values,multiplier:value};
      }else{
        const oldValue=Number(scaleOld),newValue=Number(scaleNew);
        if(!scaleOld.trim()||!scaleNew.trim()||!Number.isFinite(oldValue)||!Number.isFinite(newValue)||oldValue===0||Math.abs(oldValue)>=180||Math.abs(newValue)>=180){
          setError('锚定原折角不能为 0°；两个锚定角须在 −180° 至 180° 之间。');return;
        }
        payload={anglesDeg:values,mapAngleDeg:[oldValue,newValue]};
      }
      route='tessellation/rigid-fold-angle-scale';
    }else if(analysis==='vectors'){
      const values=vectors.map(ray=>ray.map(Number));
      if(vectors.some((ray,i)=>ray.length!==3||ray.some((value,j)=>!value.trim()||!Number.isFinite(values[i][j])))
         ||values.some(ray=>Math.hypot(...ray)===0)){
        setError('每条折线须填写三个有限坐标，且不能是零向量。');return;
      }
      route='tessellation/vertex-from-fold-vectors';
      payload={foldVectors:values};
    }else{
      const inputs=Array.from(fields.current?.querySelectorAll<HTMLInputElement>('input[type="number"]')??[]);
      const values=inputs.map(input=>Number(input.value));
      if(inputs.length!==4||inputs.some((input,i)=>!input.value.trim()||!Number.isFinite(values[i])||values[i]<.001||values[i]>179.999)){
        setError('四个扇区角都须在 0.001° 至 179.999° 之间。');return;
      }
      if(Math.abs(values.reduce((sum,angle)=>sum+angle,0)-360)>1e-7){
        setError('可展四度顶点的四个扇区角之和须为 360°。');return;
      }
      const needsFolds=analysis==='consistency'||analysis==='fan3d';
      const foldInputs=needsFolds?Array.from(foldFields.current?.querySelectorAll<HTMLInputElement>('input[type="number"]')??[]):[];
      const foldValues=foldInputs.map(input=>Number(input.value));
      if(needsFolds&&(foldInputs.length!==4||foldInputs.some((input,i)=>!input.value.trim()||!Number.isFinite(foldValues[i])||foldValues[i]<-180||foldValues[i]>180))){
        setError('四个有向折角都须在 −180° 至 180° 之间。');return;
      }
      setAngles(values as Angles);
      if(needsFolds)setFolds(foldValues as Angles);
      route=analysis==='maximum'?'tessellation/spherical-vertex':analysis==='branches'?'tessellation/degree4-branches':analysis==='consistency'?'tessellation/degree4-fold-consistency':'tessellation/degree4-vertex-fan3d';
      payload={sectorAnglesDeg:values,...(needsFolds?{foldAnglesDeg:foldValues}:{})};
    }
    const controller=new AbortController();request.current=controller;
    setBusy(true);
    try{
      const next=await api<Bounds|Branches|Consistency|Fan3D|FoldVectorVertex|FoldAngleScale|RigidQuadVertex>(route,payload,controller.signal);
      if(!controller.signal.aborted)setResult(next);
    }catch(cause){
      if(!controller.signal.aborted)setError((cause as Error).message);
    }finally{if(request.current===controller){request.current=null;setBusy(false);}}
  };
  return <TessDialog title={analysis==='rigid-quad'?'刚性单顶点四边网格':analysis==='vectors'?'三维折线向量局部分析':analysis==='scale'?'刚性折角状态缩放':'四度球面顶点局部分析'} onClose={onClose}>
    <div className="spherical-vertex-tabs" role="group" aria-label="顶点分析类型"><button aria-pressed={analysis==='maximum'} onClick={()=>selectAnalysis('maximum')}>最大折角</button><button aria-pressed={analysis==='branches'} onClick={()=>selectAnalysis('branches')}>分支关系</button><button aria-pressed={analysis==='consistency'} onClick={()=>selectAnalysis('consistency')}>折角相容</button><button aria-pressed={analysis==='fan3d'} onClick={()=>selectAnalysis('fan3d')}>局部三维</button><button aria-pressed={analysis==='vectors'} onClick={()=>selectAnalysis('vectors')}>折线向量</button><button aria-pressed={analysis==='scale'} onClick={()=>selectAnalysis('scale')}>折角缩放</button><button aria-pressed={analysis==='rigid-quad'} onClick={()=>selectAnalysis('rigid-quad')}>四边网格</button></div>
    {analysis==='rigid-quad'?<p className="note">原版底边／左边输入方向角和有向折角，求矩形纸上的单内部顶点；结果含四面等距三维坐标。未检碰撞或连续刚性折叠路径。</p>:analysis==='scale'?<p className="note">原版按共同半角正切倍率改变既有刚性折角状态；仅变换输入数值，不构造网格，也不证明整体刚性可折。</p>:analysis==='vectors'?<p className="note">三维折线按环向排列，长度自动归一化。默认是原版立方角示例，允许非可展顶点。仅分析单顶点；未求整片网格、纸张展开或自碰撞。</p>:<p className="note">四个扇区角按环向输入，合计须为 360°。{analysis==='maximum'?'折角是各折线的局部几何上限。':analysis==='branches'?'主／次配对是两种假设；共线指展开态折痕。':'有向折角按同一环向输入；零为展开态，正为谷、负为山。'} 未检自碰撞与整体折叠，非整片三维折后图。</p>}
    {analysis==='rigid-quad'&&<div className="spherical-scale-inputs"><div className="spherical-scale-pair">{(['底边','左边'] as const).map((name,row)=>{
      const values=row===0?quadBottom:quadLeft,commit=row===0?setQuadBottom:setQuadLeft;
      return <div key={name} className="spherical-scale-pair"><label>{name}方向角 <input type="number" step="any" aria-label={`${name}方向角`} value={values[0]} onChange={event=>{invalidate();commit([event.target.value,values[1]]);}}/></label><label>{name}折角 <input type="number" step="any" aria-label={`${name}折角`} value={values[1]} onChange={event=>{invalidate();commit([values[0],event.target.value]);}}/></label></div>;
    })}</div><label>最短边长 <input type="number" step="any" min="0.001" aria-label="四边网格最短边长" value={quadMinEdge} onChange={event=>{invalidate();setQuadMinEdge(event.target.value);}}/></label></div>}
    {analysis==='scale'&&<div className="spherical-scale-inputs">
      <label>有向折角（度，逗号分隔）<input aria-label="待缩放折角" value={scaleAngles} onChange={event=>{invalidate();setScaleAngles(event.target.value);}}/></label>
      <div className="spherical-scale-mode" role="group" aria-label="折角缩放方式"><button aria-pressed={scaleMode==='anchor'} onClick={()=>{invalidate();setScaleMode('anchor');}}>锚定折角</button><button aria-pressed={scaleMode==='multiplier'} onClick={()=>{invalidate();setScaleMode('multiplier');}}>直接倍率</button></div>
      {scaleMode==='anchor'?<div className="spherical-scale-pair"><label>原锚定角 <input type="number" step="any" aria-label="原锚定折角" value={scaleOld} onChange={event=>{invalidate();setScaleOld(event.target.value);}}/></label><label>目标角 <input type="number" step="any" aria-label="目标锚定折角" value={scaleNew} onChange={event=>{invalidate();setScaleNew(event.target.value);}}/></label></div>:<label>半角正切倍率 <input type="number" step="any" aria-label="半角正切倍率" value={scaleMultiplier} onChange={event=>{invalidate();setScaleMultiplier(event.target.value);}}/></label>}
    </div>}
    {analysis==='vectors'&&<div aria-label="三维折线向量" className="spherical-branch-results">
      <table><thead><tr><th>折线</th><th>x</th><th>y</th><th>z</th></tr></thead><tbody>{vectors.map((ray,i)=><tr key={i}><th>g{i+1}</th>{ray.map((value,j)=><td key={j}><input type="number" step="any" aria-label={`折线 ${i+1} ${'xyz'[j]}`} value={value} onChange={event=>changeVector(i,j,event.target.value)} style={{width:'100%',minWidth:0,height:25,boxSizing:'border-box'}}/></td>)}</tr>)}</tbody></table>
      <div style={{display:'flex',gap:8,marginTop:7}}><button type="button" className="text-button" disabled={vectors.length>=8} onClick={()=>{invalidate();setVectors(previous=>[...previous,['0',previous.length%2?'1':'-1',previous.length%2?'-1':'0']]);}}>添加折线</button><button type="button" className="text-button" disabled={vectors.length<=3} onClick={()=>{invalidate();setVectors(previous=>previous.slice(0,-1));}}>移除末条</button><button type="button" className="text-button" onClick={()=>{invalidate();setVectors(originalFoldVectors.map(ray=>[...ray]));}}>原版示例</button></div>
    </div>}
    {analysis!=='vectors'&&analysis!=='scale'&&analysis!=='rigid-quad'&&<div ref={fields} className="spherical-vertex-inputs" aria-label="四度顶点扇区角">
      {angles.map((angle,i)=><NumberField key={i} label={`扇区角 α${i+1}`} suffix="°" value={angle} min={.001} max={179.999} step={.1} onDraftChange={invalidate} onChange={value=>change(i,value)}/>)}
    </div>}
    {(analysis==='consistency'||analysis==='fan3d')&&<div ref={foldFields} className="spherical-vertex-inputs" aria-label="四度顶点有向折角">
      {folds.map((angle,i)=><NumberField key={i} label={`折角 γ${i+1}`} suffix="°" value={angle} min={-180} max={180} step={.1} onDraftChange={invalidate} onChange={value=>changeFold(i,value)}/>)}
    </div>}
    {result?.kind==='local-degree4-dihedral-bound'&&<div className="twist-analysis-ranges spherical-vertex-results" aria-label="局部最大折角">
      {result.maximumDihedralsDeg.map((value,i)=><div key={i}><b>折线 γ{i+1}</b><span data-testid={`maximum-dihedral-${i+1}`}>{value.toFixed(3)}°</span></div>)}
    </div>}
    {result?.kind==='local-degree4-branch-geometry'&&<div className="spherical-branch-results" aria-label="局部分支关系">
      <p>原版局部平折容差：<strong>{result.flatFoldable?'范围内':'范围外'}</strong> · 交替角差 {result.flatFoldabilityExcessDeg.toFixed(6)}°</p>
      <table><thead><tr><th>配对假设</th><th>次折线共线</th><th>主折线共线</th></tr></thead><tbody>
        <tr><th>γ1、γ3 为次</th><td>{result.minorFirst.straightMinor?'是':'否'}</td><td>{result.minorFirst.straightMajor?'是':'否'}</td></tr>
        <tr><th>γ1、γ3 为主</th><td>{result.majorFirst.straightMinor?'是':'否'}</td><td>{result.majorFirst.straightMajor?'是':'否'}</td></tr>
      </tbody></table>
    </div>}
    {result?.kind==='local-degree4-fold-consistency'&&<div className="spherical-branch-results" aria-label="折角闭合检验">
      <p>旋转闭合误差：<strong data-testid="fold-closure-error">{result.closureErrorDeg.toFixed(6)}°</strong> · <strong>{result.compatible?'局部相容':'局部不相容'}</strong></p>
      <p className="note">容差 {result.toleranceDeg.toFixed(6)}°；相容仅表示此顶点的三维旋转闭合，不保证整片网格、层序或无碰撞折叠。</p>
    </div>}
    {result?.kind==='local-single-vertex-fan3d'&&<div className="spherical-branch-results" aria-label="局部三维折面坐标">
      <p>单位半径单顶点扇面：<strong>{result.faces.length} 个三角面</strong> · 角度反算最大偏差 {(Math.max(result.maxSectorErrorRad,result.maxFoldErrorRad)*180/Math.PI).toExponential(2)}°</p>
      <table><thead><tr><th>折线端点</th><th>x</th><th>y</th><th>z</th></tr></thead><tbody>
        {result.foldRays.map((ray,i)=><tr key={i}><th>γ{i+1}</th>{ray.map((value,j)=><td key={j}>{value.toFixed(4)}</td>)}</tr>)}
      </tbody></table>
      <p className="note">以中心为原点、首条折线为 +x、首片扇面为 xy 平面；这是一个顶点的数值折面，未验证全图连接或自碰撞。</p>
    </div>}
    {result?.kind==='origamica-single-vertex-from-fold-vectors'&&<div className="spherical-branch-results" aria-label="折线向量局部结果">
      <p>扇区角合计 <strong>{result.sectorSumDeg.toFixed(6)}°</strong> · <strong>{result.developable?'局部可展':'非可展'}</strong></p>
      <table><thead><tr><th>折线</th><th>扇区角 α</th><th>有向折角 γ</th><th>扇面法向</th><th>中折向量</th></tr></thead><tbody>{result.foldVectors.map((_,i)=><tr key={i}><th>g{i+1}</th><td>{result.sectorAnglesDeg[i].toFixed(3)}°</td><td>{result.foldAnglesDeg[i].toFixed(3)}°</td><td>{result.sectorVectors[i].map(value=>value.toFixed(3)).join(', ')}</td><td>{result.midfoldVectors[i].map(value=>value.toFixed(3)).join(', ')}</td></tr>)}</tbody></table>
      <p className="note">法向和中折向量是单位向量；此结果不验证连续刚性折叠或整片平折。</p>
    </div>}
    {result?.kind==='origamica-rigid-fold-angle-scale'&&<div className="spherical-branch-results" aria-label="刚性折角缩放结果">
      <p>共同倍率 <strong>{result.multiplier.toPrecision(8)}</strong></p>
      <table><thead><tr><th>折线</th><th>原角</th><th>缩放后</th></tr></thead><tbody>{result.scaledAnglesDeg.map((value,i)=><tr key={i}><th>γ{i+1}</th><td>{result.inputAnglesDeg[i].toFixed(3)}°</td><td>{value.toFixed(3)}°</td></tr>)}</tbody></table>
    </div>}
    {result?.kind==='origamica-rigid-single-vertex-quad-mesh'&&<div className="spherical-branch-results rigid-quad-results" aria-label="刚性单顶点四边网格结果">
      <p>四扇区 {result.sectorAnglesDeg.map(value=>value.toFixed(3)+'°').join(' / ')} · 面内距离最大误差 {result.maximumFaceDistanceError.toExponential(2)}</p>
      <div className="rigid-quad-previews"><div><b>折痕图 · 9 点 / 4 面</b><RigidQuadDrawing result={result} folded={false}/></div><div><b>四面三维投影</b><RigidQuadDrawing result={result} folded/></div></div>
      <p className="note">最小总边长 {result.minimumTotalEdgeLength.toFixed(3)}；三维图为线框投影，不表示层序或纸厚。</p>
    </div>}
    {error&&<p role="alert" className="tess-editor-error">{error}</p>}
    <footer><span>{busy?'正在计算局部关系':'独立分析 · 不修改当前折痕'}</span><button className="primary" disabled={busy} onPointerDown={event=>event.preventDefault()} onClick={()=>void calculate()}>{busy?'计算中…':analysis==='maximum'?'计算上限':analysis==='branches'?'检查分支':analysis==='consistency'?'检验折角':analysis==='fan3d'?'生成局部扇面':analysis==='scale'?'缩放折角':analysis==='rigid-quad'?'构造四边网格':'分析向量'}</button></footer>
  </TessDialog>;
}
