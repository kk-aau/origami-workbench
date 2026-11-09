import {useEffect,useMemo,useRef,useState} from 'react';
import {ALT_MOSELY_SAVED,fetchAltMoselyReference,validateAltMoselyQuery,
  type AltMoselyQuery,type AltMoselyResult,type PotFace,type PotLine,
  type PotPoint2,type PotPoint3} from '../app/altMoselyPotReference';
import {TessDialog} from './TessellationEditor';
import './AltMoselyPotDialog.css';

function bounds(points:PotPoint2[]){
  const xs=points.map(point=>point[0]),ys=points.map(point=>-point[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const span=Math.max(x1-x0,y1-y0,.1),pad=span*.075;
  return `${x0-pad} ${y0-pad} ${Math.max(x1-x0,.1)+2*pad} ${Math.max(y1-y0,.1)+2*pad}`;
}
function orthographic(point:PotPoint3,azimuth:number):[PotPoint2,number]{
  const az=azimuth*Math.PI/180,elev=24*Math.PI/180;
  const x=Math.cos(az)*point[0]-Math.sin(az)*point[1];
  const depth=Math.sin(az)*point[0]+Math.cos(az)*point[1];
  return [[x,Math.cos(elev)*point[2]-Math.sin(elev)*depth],
    Math.sin(elev)*point[2]+Math.cos(elev)*depth];
}
function profileDrawing(points:PotPoint2[]){
  const radius=Math.max(...points.map(point=>point[0]),.1);
  const heights=points.map(point=>point[1]);
  const z0=Math.min(...heights),z1=Math.max(...heights),span=Math.max(z1-z0,.1);
  const line=(side:1|-1)=>points.map(([x,z],i)=>
    `${i?'L':'M'}${(side*x).toFixed(7)} ${(-z).toFixed(7)}`).join(' ');
  return <svg data-testid="alt-mosely-profile" role="img"
    aria-label="原版轴对称壶体剖面" viewBox={`${-radius*1.2} ${-z1-span*.1} ${radius*2.4} ${span*1.2}`}>
    <line x1="0" x2="0" y1={-z0} y2={-z1} className="amp-profile-axis"/>
    <path d={line(1)} className="amp-profile-line"/>
    <path d={line(-1)} className="amp-profile-mirror"/>
  </svg>;
}
function flatDrawing(lines:PotLine[],split:boolean){
  if(!lines.length)return null;
  const box=bounds(lines.flatMap(line=>line.points));
  return <svg data-testid="alt-mosely-flat" role="img"
    aria-label={split?'交替双楔片二维折线':'完整交替壶体二维来源折线'}
    viewBox={box} preserveAspectRatio="xMidYMid meet">
    {lines.map((line,i)=><line key={i} className={`amp-line amp-${line.role}`}
      vectorEffect="non-scaling-stroke" x1={line.points[0][0]} y1={-line.points[0][1]}
      x2={line.points[1][0]} y2={-line.points[1][1]}/>)}
  </svg>;
}
function foldedDrawing(faces:PotFace[],azimuth:number,split:boolean){
  if(!faces.length)return null;
  const projected=faces.map((face,i)=>{
    const values=face.vertices.map(point=>orthographic(point,azimuth));
    return {face,points:values.map(value=>value[0]),
      depth:values.reduce((sum,value)=>sum+value[1],0)/4,index:i};
  }).sort((a,b)=>a.depth-b.depth||a.index-b.index);
  const box=bounds(projected.flatMap(face=>face.points));
  return <svg data-testid="alt-mosely-folded" role="img"
    aria-label={split?'交替双楔片三维正交投影':'完整交替壶体三维正交投影'}
    viewBox={box} preserveAspectRatio="xMidYMid meet">
    {projected.map(({face,points,index})=><path key={index}
      className={`amp-face amp-${face.role} amp-${face.part}`}
      vectorEffect="non-scaling-stroke"
      d={`${points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(8)} ${(-y).toFixed(8)}`).join(' ')} Z`}/>)}
  </svg>;
}

export default function AltMoselyPotDialog({onClose}:{onClose:()=>void}){
  const [example,setExample]=useState<3557|3558>(3557);
  const [sectors,setSectors]=useState('8');
  const [azimuth,setAzimuth]=useState(-40);
  const [split,setSplit]=useState(false);
  const [result,setResult]=useState<AltMoselyResult|null>(null);
  const [error,setError]=useState('');
  const generation=useRef(0);
  const validation=useMemo(()=>{
    try{return {query:validateAltMoselyQuery({family:'alt-mosely-pot-reference',
      example,sectors:Number(sectors)}),error:''};}
    catch(cause){return {query:null,error:(cause as Error).message};}
  },[example,sectors]);
  useEffect(()=>{
    if(!validation.query){setResult(null);setError(validation.error);return;}
    const query=validation.query,id=++generation.current,controller=new AbortController();
    setResult(null);setError('');
    const timer=window.setTimeout(()=>fetchAltMoselyReference(query,controller.signal)
      .then(next=>{if(id===generation.current&&!controller.signal.aborted)setResult(next);})
      .catch(cause=>{if(id===generation.current&&!controller.signal.aborted)
        setError((cause as Error).message||'保存例查询失败。');}),90);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[validation]);
  const changeExample=(value:3557|3558)=>{
    ++generation.current;setExample(value);
    setSectors(String(ALT_MOSELY_SAVED.find(saved=>saved.example===value)!.sectors));
  };
  const query:AltMoselyQuery|undefined=result?.query;
  const lines=result?(split?result.splitWedge.flatLines:result.display.flatLines):[];
  const faces=result?(split?result.splitWedge.foldedFaces:result.display.foldedFaces):[];
  return <TessDialog title="第 43 节 · 交替 Mosely 壶体历史例" onClose={onClose}>
    <div className="alt-mosely-pot-dialog">
      <aside className="amp-controls">
        <div className="amp-eyebrow">ORIGAMICA / IN[3556–3558]</div>
        <h3>交替壶体<br/>双楔片构造</h3>
        <p>原版 <code>TRotationalPot</code> 类标为 deprecated。这里按保存输入重绘二维折线与三维显示面。</p>
        <label>保存示例<select aria-label="Mosely 保存示例" value={example}
          onChange={event=>changeExample(Number(event.target.value) as 3557|3558)}>
          <option value={3557}>In[3557] · 四级剖面</option>
          <option value={3558}>In[3558] · √3 对称剖面</option>
        </select></label>
        <label>旋转阶数 m<input aria-label="Mosely 旋转阶数" type="number"
          min="4" max="16" step="2" value={sectors}
          onChange={event=>{++generation.current;setSectors(event.target.value);}}/></label>
        <div className="amp-switch" role="group" aria-label="Mosely 构造视图">
          <button type="button" aria-pressed={!split} className={!split?'active':''}
            onClick={()=>setSplit(false)}>完整拼接</button>
          <button type="button" aria-pressed={split} className={split?'active':''}
            onClick={()=>setSplit(true)}>双楔片</button></div>
        <div className={`amp-status ${error?'error':result?'ready':'busy'}`}
          role={error?'alert':'status'}>{error||
          (result?`${query?.sectors} 阶 · ${lines.length} 条显示折线 · ${faces.length} 个显示面`:
            '正在按原式生成交替楔片…')}</div>
        <div className="amp-facts">
          <span>边界 <b>Default</b></span><span>最小折角 <b>10°</b></span>
          <span>三维显示间隙 <b>0.05</b></span>
          {result&&<span>轴点补齐 <b>{result.profile.axisPointAdded?'末端 +0.0001':'未添加'}</b></span>}
        </div>
        {result&&<div className="amp-profile"><span>原版剖面 · 轴对称</span>
          {profileDrawing(result.profile.original)}</div>}
        <p className="amp-warning">保存例只有图形输出，未保存可机读的 Wolfram 数值 Out。三维面带展示间隙，未检验自交与可制造性。</p>
      </aside>
      <main className="amp-results">
        <header className="amp-head"><div><small>HISTORICAL DISPLAY GEOMETRY</small>
          <strong>正向＋反向 SplitWedge 交替排布</strong></div>
          <span>只读 · 非 FOLD</span></header>
        <div className="amp-panels">
          <section className="amp-panel"><header><span>01 / FLAT</span><strong>二维折线</strong></header>
            {result?flatDrawing(lines,split):<div className="amp-empty">等待二维线图</div>}
            <footer><i className="mountain"/>山折 <i className="valley"/>谷折
              <i className="boundary"/>边界</footer></section>
          <section className="amp-panel"><header><span>02 / FOLDED DISPLAY</span>
            <strong>三维显示面 · 正交投影</strong></header>
            {result?foldedDrawing(faces,azimuth,split):<div className="amp-empty">等待三维面</div>}
            <label className="amp-azimuth">视角 <input aria-label="Mosely 三维视角"
              type="range" min="-180" max="180" value={azimuth}
              onChange={event=>setAzimuth(Number(event.target.value))}/><b>{azimuth}°</b></label>
          </section>
        </div>
        <div className="amp-note">完整图按原式将双楔片重复 m/2 次。线和面是原版显示几何；
          不会写入当前镶嵌工程，也不能当作已验证的单张纸折痕。</div>
        <footer className="amp-footer"><span>原版定义 In[3556] · 保存例 In[3557] / In[3558]</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
