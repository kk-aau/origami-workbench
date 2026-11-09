import {useState} from 'react';
import saved from '../app/p36In3088DiagnosticData.json';
import {TessDialog} from './TessellationEditor';
import './P36In3088DiagnosticDialog.css';

type XY=[number,number];
type Diagnostic={notebookInput:number;sourceStationaryFace:number;graphStationaryFace:number;
  count:[number,number,number];closureError:number;geometryStatus:string;layerStatus:string;
  crease:{vertices:XY[];edges:[number,number][];assignment:string[];faces:number[][]};
  folded:{vertices:XY[]}};
const data=saved as Diagnostic;

function Diagram({kind}:{kind:'crease'|'folded'}){
  const points=kind==='crease'?data.crease.vertices:data.folded.vertices;
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
  const pad=Math.max(w,h)*.08;
  return <svg role="img" aria-label={kind==='crease'?'In[3088] 四块分裂折痕图':'In[3088] 整片几何平折候选和三面层序冲突'}
    viewBox={`${x-pad} ${y-pad} ${w+2*pad} ${h+2*pad}`}>
    {kind==='folded'&&[8,9,11].map((face,i)=><polygon key={face}
      className={`p36-in3088-face face-${i}`}
      points={data.crease.faces[face].map(vertex=>`${points[vertex][0]},${-points[vertex][1]}`).join(' ')} />)}
    {data.crease.edges.map(([a,b],i)=><line key={i}
      className={`p36-in3088-edge ${kind==='crease'?data.crease.assignment[i]:'folded'}`}
      x1={points[a][0]} y1={-points[a][1]} x2={points[b][0]} y2={-points[b][1]}
      vectorEffect="non-scaling-stroke"/>)}
  </svg>;
}

export default function P36In3088DiagnosticDialog({onClose,onLoad}:{onClose:()=>void;onLoad:()=>void}){
  const [active,setActive]=useState<'crease'|'folded'>('crease');
  return <TessDialog title="第 36 节 · In[3088] 四块偏置分裂" onClose={onClose}>
    <div className="p36-in3088">
      <div className="p36-in3088-head"><div><small>原版保存输入 · 本地重建</small>
        <h2>四块单位四边形偏置分裂</h2></div><strong>In[3088]</strong></div>
      <div className="p36-in3088-stats">
        <span>褶宽 0.18 · 偏置 +0.12 / −0.12 / −0.12 / +0.12</span>
        <span>分裂基点 1 / 2 / 4 / 3</span>
        <span>40 点 · 72 边 · 33 面</span>
      </div>
      <nav className="p36-in3088-tabs" aria-label="诊断图切换">
        <button type="button" aria-pressed={active==='crease'} onClick={()=>setActive('crease')}>折痕图</button>
        <button type="button" aria-pressed={active==='folded'} onClick={()=>setActive('folded')}>几何平折候选</button>
      </nav>
      <div className="p36-in3088-figures" data-active={active}>
        <figure className="p36-in3088-crease"><figcaption>整片折痕图 · M 山 / V 谷</figcaption><Diagram kind="crease"/></figure>
        <figure className="p36-in3088-folded"><figcaption>固定第 17 面后的几何候选 · 彩色为冲突三面</figcaption><Diagram kind="folded"/></figure>
      </div>
      <div className="p36-in3088-result"><span>逐面反射闭合误差 <strong>{data.closureError.toExponential(2)}</strong></span>
        <span>整片层序 <strong>无解</strong></span></div>
      <p className="p36-in3088-note">原笔记本的逐块 FoldedForm2D 是几何相似示意；这里绘制的是按保存参数重建的整片折痕及真实逐面反射几何。
        第 9、10、12 面在正面积区域重叠，现有山谷约束导出循环层序。原版未保存可逐点核验的数值平折结果；这张候选图不可作为已验证平折或可采用工程。</p>
      <footer className="p36-in3088-footer"><button type="button" className="outline" onClick={onLoad}>在画布查看候选</button>
        <button type="button" className="primary" onClick={onClose}>关闭</button></footer>
    </div>
  </TessDialog>;
}
