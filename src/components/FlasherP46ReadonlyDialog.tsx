import {useState} from 'react';
import saved from '../app/flasherP46ReadonlyData.json';
import {TessDialog} from './TessellationEditor';
import FlasherAllLabelsView from './FlasherAllLabelsView';
import type {FlasherParams} from '../app/flasherParams';
import './FlasherP46ReadonlyDialog.css';

type Point2=[number,number];
type Point3=[number,number,number];
type Variant='Y'|'Z'|'highF'|'current';
type Sector={input:{rings:number;heightOrder:number;rotationalOrder:number;
  sector:number;radialOrder:number;diagonal:string};foldedLinesCount:number;
  diagonalCount:number;lines:{a:Point2;b:Point2;kind:string;labels:number[][]}[];
  labels:{ijk:number[];point:Point2}[]};
type HighF={input:{rings:number;heightOrder:number;rotationalOrder:number;
  focalLength:number;radialIncrement:number;diagonal:string;minimumAngleDeg:number};
  deployed:Point3[];folded:Point3[];edges:[number,number][];
  faces:number[][];maxDPFFFaceEdgeError:number;projectedDPEdgeGap:number;
  hasTruePlanarDevelopment:boolean};
const data=saved as unknown as {sectors:{Y:Sector;Z:Sector};highF:HighF};

function box(points:Point2[],fraction=.09){
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
  const pad=Math.max(w,h)*fraction;
  return {viewBox:`${x-pad} ${y-pad} ${w+2*pad} ${h+2*pad}`,size:Math.max(w,h)};
}

function SeedDiagram({sector,variant,selected}:{sector:Sector;variant:'Y'|'Z';selected:number}){
  const bounds=box(sector.labels.map(item=>item.point),.17);
  return <svg role="img" aria-label={`In[${variant==='Y'?'4131':'4132'}] ${variant} 首扇区标签与折线种子`}
    data-testid="p46-seed-diagram" data-variant={variant} viewBox={bounds.viewBox}>
    {sector.lines.map((item,index)=><line key={index} data-testid={item.kind==='light'?'p46-seed-diagonal':undefined}
      className={`p46-seed-line ${item.kind}`} vectorEffect="non-scaling-stroke"
      x1={item.a[0]} y1={-item.a[1]} x2={item.b[0]} y2={-item.b[1]}/>)}
    {sector.labels.map((item,index)=><text key={index} data-testid="p46-seed-label"
      className={`p46-seed-label ${selected===index?'active':''}`}
      x={item.point[0]+bounds.size*.008} y={-item.point[1]-bounds.size*.006}
      fontSize={bounds.size*.026} strokeWidth={bounds.size*.004}>
      {`p(${item.ijk.join(',')})`}</text>)}
    <circle className="p46-selected-point" cx={sector.labels[selected].point[0]}
      cy={-sector.labels[selected].point[1]} r={bounds.size*.013}/>
  </svg>;
}

const project=([x,y,z]:Point3):Point2=>[x-.5*y,.28*(x+y)-1.25*z];
function SpatialDiagram({vertices,edges,faces,title}:{vertices:Point3[];
  edges:[number,number][];faces:number[][];title:string}){
  const points=vertices.map(project),bounds=box(points.map(([x,y])=>[x,-y]));
  return <svg role="img" aria-label={title} data-testid="p46-uncut-spatial"
    viewBox={bounds.viewBox} preserveAspectRatio="xMidYMid meet">
    {faces.map((face,index)=><polygon key={index} className="p46-spatial-face"
      points={face.map(vertex=>points[vertex].join(',')).join(' ')}/>)}
    {edges.map(([a,b],index)=><line key={index} className="p46-spatial-edge"
      vectorEffect="non-scaling-stroke" x1={points[a][0]} y1={points[a][1]}
      x2={points[b][0]} y2={points[b][1]}/>)}
  </svg>;
}

export default function FlasherP46ReadonlyDialog({onClose,initialVariant='Y',currentParams}:{
  onClose:()=>void;initialVariant?:Variant;currentParams?:FlasherParams}){
  const [variant,setVariant]=useState<Variant>(initialVariant);
  const [selected,setSelected]=useState(0);
  const sector=variant==='highF'||variant==='current'?null:data.sectors[variant];
  return <TessDialog title={variant==='current'?'第 46 节 Flasher 完整首扇区标签':'第 46 节 Flasher 固定保存输入 · 只读'} onClose={onClose}>
    <div className="flasher-p46-readonly">
      <nav className="p46-readonly-tabs" aria-label="Flasher 只读保存例">
        {([['current','当前参数 · 完整标签'],['Y','In[4131] · Y 标签'],['Z','In[4132] · Z 标签'],
          ['highF','In[4206] · 高焦距 DP/FF']] as const).map(([key,label])=><button
          key={key} type="button" aria-pressed={variant===key}
          onClick={()=>{setVariant(key);setSelected(0);}}>{label}</button>)}
      </nav>
      {variant==='current'?<FlasherAllLabelsView params={currentParams}/>:sector?<>
        <div className="p46-readonly-heading"><div><span>原版首扇区初始二维图</span>
          <h2>In[{variant==='Y'?'4131':'4132'}] · {variant} 对角线与顶点标签</h2></div>
          <strong>r=4 · h=1 · m=5 · k=0</strong></div>
        <div className="p46-readonly-stats"><span>{sector.foldedLinesCount} 条基础折线</span>
          <span>{sector.diagonalCount} 条 {variant} 对角线</span>
          <span>{sector.labels.length} 个原网格标签</span></div>
        <div className="p46-seed-figure"><SeedDiagram sector={sector} variant={variant as 'Y'|'Z'} selected={selected}/></div>
        <div className="p46-label-inspector"><label>查看顶点标签
          <input aria-label="查看 Flasher 种子顶点标签" type="range" min="0" max={sector.labels.length-1}
            value={selected} onChange={event=>setSelected(Number(event.target.value))}/></label>
          <code>p({sector.labels[selected].ijk.join(', ')}) · {sector.labels[selected].point.map(x=>x.toFixed(5)).join(', ')}</code></div>
        <p className="p46-readonly-note">仅复现 In[4131]/In[4132] 的首扇区标签、基础折线与理想 CP 种子。
          这里没有求解 CP／FF、山谷赋型、等距或平折层序；可回到构造区使用四环 CP/FF 示例重新求解。
          此图不可采用，不能称为精确 FOLD。</p>
      </>:<>
        <div className="p46-readonly-heading"><div><span>原版未剪裁 DP／FF 示意</span>
          <h2>In[4206] · 焦距 10⁶ 极限</h2></div>
          <strong>r=2 · h=2 · m=4 · dr=.05</strong></div>
        <div className="p46-readonly-stats"><span>{data.highF.deployed.length} 点</span>
          <span>{data.highF.edges.length} 边</span><span>{data.highF.faces.length} 面</span></div>
        <div className="p46-spatial-grid">
          <figure><figcaption>部署形 DP · 未剪裁</figcaption><SpatialDiagram title="In[4206] 未剪裁部署形 DP"
            vertices={data.highF.deployed} edges={data.highF.edges} faces={data.highF.faces}/></figure>
          <figure><figcaption>折后形 FF · 未剪裁</figcaption><SpatialDiagram title="In[4206] 未剪裁折后形 FF"
            vertices={data.highF.folded} edges={data.highF.edges} faces={data.highF.faces}/></figure>
        </div>
        <div className="p46-readonly-metric">本地 DP↔FF 逐面最大边长差：
          <strong>{data.highF.maxDPFFFaceEdgeError.toExponential(2)}</strong></div>
        <p className="p46-readonly-note">固定输入来自 In[4206]，图中的数值由本地原式重新求解，并非 Wolfram 保存 Out。
          原所谓 CP 只是 DP 的竖直投影；此处没有真正的平面展开。现有剪裁路由因近乎重合的切边被几何门禁拒绝。
          这两张未剪三维图只读，不是可采用纸张，也没有平折层序或连续运动证书。</p>
      </>}
      <footer className="p46-readonly-footer"><span>关闭后当前作品与工程参数保持不变。</span>
        <button type="button" className="primary" onClick={onClose}>关闭</button></footer>
    </div>
  </TessDialog>;
}
