import {useEffect,useRef,useState} from 'react';
import {api,download} from '../app/api';
import type {XY} from '../app/tessellation';
import {TessDialog} from './TessellationEditor';
import './FlagstoneTiltedStarDialog.css';

export type TiltedStarInput={points:XY[];direction:1|-1};
type TiltedStarResult={
  kind:'origamica-tilted-pleat-degree3-local';points:XY[];direction:1|-1;
  centralTriangle:XY[];reflectedCorners:XY[];inwardDistances:number[];
  reflectedDoubleArea:number;reflectedCornerMaxGap:number;
  geometricConditionSatisfied:boolean;creaseAssignmentsKnown:false;wholeTessellationConstructed:false;
};

const STORE_KEY='zhezhi-flagstone-tilted-star-v1';
// Origamica In[450]/In[451]: p2=(0,0), p4=(1.4,1), p6=(-.3,1.4),
// with isosceles tip heights 1.5, 1.2 and 1.4 times their opposite bases.
export const ORIGINAL_TILTED_STAR:TiltedStarInput={
  points:[[-2.25,.25],[0,0],[1.9,-1.18],[1.4,1],[1.11,3.58],[-.3,1.4]],
  direction:1,
};

function readInput(value:unknown):TiltedStarInput{
  const data=value as Partial<TiltedStarInput>|null;
  if(!data||!Array.isArray(data.points)||data.points.length!==6||data.points.some(p=>
    !Array.isArray(p)||p.length!==2||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1000))||
    data.direction!==1&&data.direction!==-1)throw Error('需要六个有限二维坐标和旋向 +1 或 -1。');
  return {points:structuredClone(data.points),direction:data.direction};
}
function savedInput():TiltedStarInput{
  try{return readInput(JSON.parse(localStorage.getItem(STORE_KEY)??''));}
  catch{return structuredClone(ORIGINAL_TILTED_STAR);}
}
function readPoints(text:string):XY[]{
  let parsed:unknown;
  try{parsed=JSON.parse(text);}catch{throw Error('六点坐标须为 JSON 数组。');}
  return readInput({points:parsed,direction:1}).points;
}
const shown=(x:number)=>Number(x.toPrecision(7)).toString();

function Preview({result}:{result:TiltedStarResult}){
  const outline=result.points,triangle=result.centralTriangle,reflected=result.reflectedCorners;
  const all=[...outline,...triangle,...reflected];
  const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const unit=Math.max(maxX-minX,maxY-minY,.01),pad=unit*.12;
  const marker=unit*.009,labelOffset=unit*.015,labelSize=unit*.034;
  const pos=(p:XY):[number,number]=>[p[0],-p[1]];
  const path=(points:XY[])=>points.map((p,i)=>`${i?'L':'M'}${pos(p).join(' ')}`).join(' ')+' Z';
  const s:XY=[reflected.reduce((sum,p)=>sum+p[0],0)/3,reflected.reduce((sum,p)=>sum+p[1],0)/3];
  return <svg className="flagstone-tilted-star-preview" aria-label="倾斜褶三度交汇局部几何" data-testid="flagstone-tilted-star-preview"
    viewBox={`${minX-pad} ${-maxY-pad} ${maxX-minX+2*pad} ${maxY-minY+2*pad}`} preserveAspectRatio="xMidYMid meet">
    <path d={path(outline)} fill="none" stroke="#253632" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>
    {[0,1,2].map((i)=><line key={'b'+i} x1={pos(outline[i*2])[0]} y1={pos(outline[i*2])[1]}
      x2={pos(triangle[i])[0]} y2={pos(triangle[i])[1]} stroke="#8050b8" strokeWidth="1.7" vectorEffect="non-scaling-stroke"/>)}
    <path d={path(triangle)} fill="rgba(29,170,175,.08)" stroke="#00a5ae" strokeWidth="2.4" vectorEffect="non-scaling-stroke"/>
    {triangle.map((point,i)=><line key={'w'+i} x1={pos(point)[0]} y1={pos(point)[1]} x2={pos(s)[0]} y2={pos(s)[1]}
      stroke="#8050b8" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke"/>)}
    {outline.map((point,i)=><g key={'p'+i}><circle cx={pos(point)[0]} cy={pos(point)[1]} r={marker} fill="#253632"/><text x={pos(point)[0]} y={pos(point)[1]} dx={labelOffset} dy={-labelOffset} fontSize={labelSize} fill="#253632">p{i+1}</text></g>)}
    {triangle.map((point,i)=><g key={'q'+i}><circle cx={pos(point)[0]} cy={pos(point)[1]} r={marker*1.2} fill="#00a5ae"/><text x={pos(point)[0]} y={pos(point)[1]} dx={labelOffset} dy={-labelOffset} fontSize={labelSize} fill="#007980">q{i*2+1}</text></g>)}
    <circle cx={pos(s)[0]} cy={pos(s)[1]} r={marker*1.2} fill="#8050b8"/>
    <text x={pos(s)[0]} y={pos(s)[1]} dx={labelOffset} dy={-labelOffset} fontSize={labelSize} fill="#8050b8">s</text>
  </svg>;
}

/** Local Origamica TriangleStarTwistTriangle experiment; never mutates CP/FF. */
export default function FlagstoneTiltedStarDialog({onClose,initial}:{onClose:()=>void;initial?:TiltedStarInput}){
  const [start]=useState(()=>initial?readInput(initial):savedInput());
  const [pointsText,setPointsText]=useState(()=>JSON.stringify(start.points));
  const [direction,setDirection]=useState<1|-1>(start.direction);
  const [result,setResult]=useState<{key:string;value:TiltedStarResult}|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null);
  let query:TiltedStarInput|null=null;
  try{query={points:readPoints(pointsText),direction};}catch{/* Keep unfinished JSON editable. */}
  const key=query?JSON.stringify(query):'';
  const current=result?.key===key?result.value:null;

  useEffect(()=>{
    let input:TiltedStarInput;
    try{input={points:readPoints(pointsText),direction};}
    catch(cause){setError((cause as Error).message);setBusy(false);return;}
    const controller=new AbortController();
    let retry:ReturnType<typeof setTimeout>|undefined;
    const run=()=>{
      setBusy(true);setError('');
      void api<TiltedStarResult>('tessellation/flagstone-tilted-star',input,controller.signal)
        .then(value=>{if(controller.signal.aborted)return;setResult({key:JSON.stringify(input),value});setBusy(false);
          try{localStorage.setItem(STORE_KEY,JSON.stringify(input));}catch{/* Private mode can deny storage; the current result remains valid. */}})
        .catch(cause=>{if(controller.signal.aborted)return;
          const message=(cause as Error).message;
          if(message.includes('已有镶嵌计算正在进行'))retry=setTimeout(run,750);
          else{setError(message);setBusy(false);}
        });
    };
    const timer=setTimeout(run,130);
    return()=>{clearTimeout(timer);if(retry)clearTimeout(retry);controller.abort();};
  },[pointsText,direction]);

  const importFile=async(file:File|undefined)=>{
    if(!file)return;
    try{if(file.size>20000)throw Error('局部参数文件过大。');
      const input=readInput(JSON.parse(await file.text()));
      setPointsText(JSON.stringify(input.points));setDirection(input.direction);setError('');}
    catch(cause){setError(`导入失败：${(cause as Error).message}`);}
    if(fileInput.current)fileInput.current.value='';
  };

  return <TessDialog title="原版倾斜褶 · 三度交汇局部实验" onClose={onClose}>
    <div className="flagstone-tilted-star-layout">
      <div className="flagstone-tilted-star-controls">
        <div className="flagstone-tilted-star-actions"><button onClick={()=>{setPointsText(JSON.stringify(ORIGINAL_TILTED_STAR.points));setDirection(1);}}>原版六点例</button>
          <button onClick={()=>fileInput.current?.click()}>导入参数</button>
          <button disabled={!query} onClick={()=>{if(query)download(JSON.stringify(query,null,2),'倾斜褶三度交汇-局部参数.json');}}>保存参数</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden aria-label="导入倾斜褶局部参数文件" onChange={event=>void importFile(event.target.files?.[0])}/>
        </div>
        <label className="flagstone-tilted-star-vertices">六点坐标 p1…p6 · 逆时针，奇数点为等腰尖角
          <textarea aria-label="倾斜褶六点坐标" value={pointsText} spellCheck={false} onChange={event=>setPointsText(event.target.value)}/>
        </label>
        <label className="flagstone-tilted-star-direction">局部旋向
          <select aria-label="倾斜褶局部旋向" value={direction} onChange={event=>setDirection(Number(event.target.value) as 1|-1)}>
            <option value={1}>逆时针 +1</option><option value={-1}>顺时针 -1</option>
          </select>
        </label>
        <p className="note">黑：原有星形边　紫：构造辅助线　青：求得中心三角形。</p>
        <p className="note">参数在此设备自动记忆，也可导出 JSON；这项局部实验不会改动当前折痕图或平折结果。</p>
      </div>
      <div className="flagstone-tilted-star-output">
        {current?<Preview result={current}/>:<div className="flagstone-tilted-star-empty" role="status">{busy?'计算局部中心三角形…':error?'当前输入不可预览':'准备局部构造…'}</div>}
        {current&&<div className="flagstone-tilted-star-result">
          <strong>q1 {current.centralTriangle[0].map(shown).join(', ')}　q3 {current.centralTriangle[1].map(shown).join(', ')}　q5 {current.centralTriangle[2].map(shown).join(', ')}</strong>
          <span>三处反射凹角汇聚误差 {current.reflectedCornerMaxGap.toExponential(2)}</span>
        </div>}
        {error&&<p className="tess-editor-error" role="alert">{error}</p>}
      </div>
    </div>
    <footer><span>原版仅给出三度交汇局部解；整张倾斜褶铺石的拼接与山谷赋型未定义。</span>
      <button onClick={onClose}>关闭</button></footer>
  </TessDialog>;
}
