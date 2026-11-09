import {useMemo,useState} from 'react';
import {
  canonicalDirectrix,firstForm,flatCrossPoint,flatSavedPlotPoint,plotV,
  sampleSaved,savedPlotPoint,type Point2,type Point3,type SavedCase,
} from '../app/curvedCanonicalTangentGeneralIn3833';
import {TessDialog} from './TessellationEditor';
import './CurvedCanonicalTangentGeneralDialog.css';

type Sample=ReturnType<typeof sampleSaved>;
type View='source'|'canonical'|'flat';
const OPTIONS:{kind:SavedCase;label:string;short:string}[]=[
  {kind:'tangent-clipped-3833',label:'In[3833] · 螺旋切线面／单支',short:'切线面 · 单支'},
  {kind:'tangent-both-3834',label:'In[3834] · 螺旋切线面／双支',short:'切线面 · 双支'},
  {kind:'general-cylinder-3837',label:'In[3837] · 扰动柱面复原',short:'规范柱面'},
  {kind:'general-cone-3838',label:'In[3838] · 扰动圆锥复原',short:'规范圆锥'},
  {kind:'general-tangent-3839',label:'In[3839] · 扰动切线面复原',short:'规范切线面'},
];
const draw=(points:Point2[])=>points.map(([x,y],i)=>
  `${i?'L':'M'}${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ');
const project=(point:Point3,angle:number):Point2=>{
  const a=angle*Math.PI/180,e=Math.PI/7;
  const x=Math.cos(a)*point[0]-Math.sin(a)*point[1];
  const depth=Math.sin(a)*point[0]+Math.cos(a)*point[1];
  return [x,-Math.sin(e)*depth+Math.cos(e)*point[2]];
};
function bounds(groups:Point2[][]){
  const all=groups.flat(),xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const span=Math.max(x1-x0,y1-y0,.1),pad=.12*span;
  return {box:`${x0-pad} ${y0-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}`,
    marker:.012*span};
}
function Diagram({sample,kind,view,angle,active,t}:{sample:Sample;kind:SavedCase;
  view:View;angle:number;active:number;t:number}){
  const isFlat=view==='flat';
  const convert=(p:Point2|Point3)=>isFlat?p as Point2:project(p as Point3,angle);
  const base=(view==='source'?sample.sourceBase:view==='flat'?
    sample.flatGrid[0]:sample.plotGrid[0]).map(convert);
  const top=(view==='source'?sample.sourceTip:view==='flat'?
    sample.flatGrid.at(-1)!:sample.plotGrid.at(-1)!).map(convert);
  const cross=view==='source'?null:sample.uValues.map(u=>convert(isFlat?
    flatSavedPlotPoint(kind,u,plotV(kind,u,t)):
    savedPlotPoint(kind,u,plotV(kind,u,t))));
  const tangent=kind.includes('tangent');
  const regression=view==='source'||!tangent?null:sample.uValues.map(u=>convert(
    isFlat?flatCrossPoint(kind,u,u):canonicalDirectrix(kind,u)));
  const {box,marker}=bounds([base,top,...(cross?[cross]:[]),
    ...(regression?[regression]:[])]);
  const current=cross?cross[active]:base[active];
  return <svg role="img" data-testid={`canonical-tangent-${view}`}
    aria-label={view==='source'?'原函数输入直纹线':view==='canonical'?
      '规范可展面保存图':'本地推导二维等距展开'}
    viewBox={box} preserveAspectRatio="xMidYMid meet">
    <path className="ctg-area" d={draw([...base,...top.slice().reverse()])+' Z'}/>
    {base.map((p,i)=>i%8===0||i===base.length-1?<line key={i}
      className="ctg-ruling" x1={p[0]} y1={-p[1]} x2={top[i][0]} y2={-top[i][1]}
      vectorEffect="non-scaling-stroke"/>:null)}
    <path className="ctg-base" d={draw(base)}/>
    <path className="ctg-top" d={draw(top)}/>
    {regression&&<path className="ctg-regression" d={draw(regression)}/>}
    {cross&&<path className="ctg-cross" d={draw(cross)}/>}
    <circle className="ctg-marker" cx={current[0]} cy={-current[1]} r={marker}/>
  </svg>;
}

export default function CurvedCanonicalTangentGeneralDialog({onClose}:{onClose:()=>void}){
  const [kind,setKind]=useState<SavedCase>('tangent-clipped-3833');
  const [active,setActive]=useState(16),[t,setT]=useState(.5),[angle,setAngle]=useState(-35);
  const sample=useMemo(()=>sampleSaved(kind),[kind]);
  const u=sample.uValues[active],v=plotV(kind,u,t),form=firstForm(kind,u,v);
  const tangent=kind.includes('tangent'),clipped=kind==='tangent-clipped-3833'||
    kind==='general-tangent-3839',cone=kind==='general-cone-3838';
  const choose=(next:SavedCase)=>{setKind(next);setActive(16);setT(.5);};
  const range=kind==='general-cylinder-3837'?'[−1, 1]':
    cone?'[0, 1]':'[0, π]';
  const metric=tangent?'E=¾(v−u)²，F=0，G=1':
    cone?'E=v²/4，F=0，G=1':'E=1，F=0，G=1';
  const status=cone?'v=0 锥顶奇点；v>0 正则':
    tangent?clipped?'v=u 回归边；仅 v>u 显示面片':
      'v=u 回归边；v<u 与 v>u 两支均显示':'全显示区间正则';
  return <TessDialog title="第 45 节 · 规范切线与一般可展面" onClose={onClose}>
    <div className="canonical-tangent-dialog">
      <aside className="ctg-controls">
        <span className="ctg-eyebrow">01 / SAVED CANONICAL SYSTEMS</span>
        <h2>从扰动直纹线到规范面</h2>
        <p>五个固定保存例：两种螺旋切线面显示分支，及柱、锥、切线面的通用规范化。</p>
        <label className="ctg-select">保存调用
          <select aria-label="规范化保存例" value={kind}
            onChange={event=>choose(event.target.value as SavedCase)}>
            {OPTIONS.map(option=><option value={option.kind} key={option.kind}>
              {option.label}</option>)}
          </select></label>
        <dl className="ctg-readouts">
          <div><dt>源参数 u</dt><dd>{u.toFixed(3)}</dd></div>
          <div><dt>源绘图区间 v</dt><dd>{range}</dd></div>
          <div><dt>当前 v</dt><dd>{v.toFixed(3)}</dd></div>
          <div><dt>面积密度</dt><dd>{form.area.toFixed(3)}</dd></div>
          <div><dt>所在分支</dt><dd>{form.branch==='positive'?'正支':
            form.branch==='negative'?'负支':form.branch==='regression'?'回归边':
              form.branch==='apex'?'锥顶':'正则'}</dd></div>
        </dl>
        <label className="ctg-slider">沿基线位置
          <input type="range" min="0" max={sample.uValues.length-1} value={active}
            aria-label="规范化基线位置" onChange={e=>setActive(Number(e.target.value))}/>
        </label>
        <label className="ctg-slider">绘图母线位置
          <input type="range" min="0" max="1" step="0.01" value={t}
            aria-label="规范化母线位置" onChange={e=>setT(Number(e.target.value))}/>
        </label>
        <label className="ctg-slider">三维视角 <strong>{angle}°</strong>
          <input type="range" min="-180" max="180" value={angle}
            aria-label="规范化三维视角" onChange={e=>setAngle(Number(e.target.value))}/>
        </label>
        <p className="ctg-source">{kind.startsWith('general-')?
          '原输入直截线先沿母线增加 uD；原规范规则将该分量移回，保留每条无限母线。':
          '源螺旋速度为 1；CrossCurveSurface 使用 w=v−u 将回归边置于 v=u。'}</p>
      </aside>
      <main className="ctg-results">
        <div className="ctg-heading"><span>02 / 源输入、保存图与本地展开</span>
          <strong>{OPTIONS.find(o=>o.kind===kind)!.short}</strong></div>
        <div className="ctg-panels">
          <section className="ctg-panel"><header><span>INPUT / 3D</span>
            <strong>{kind.startsWith('general-')?'扰动后的原函数输入':'切线面基础母线'}</strong></header>
            <Diagram sample={sample} kind={kind} view="source" angle={angle}
              active={active} t={t}/>
            <small>展示输入直截线和单位母线 w∈[0,1]；非保存画图的有限片。</small></section>
          <section className="ctg-panel"><header><span>CANONICAL / 3D</span>
            <strong>保存调用的规范面</strong></header>
            <Diagram sample={sample} kind={kind} view="canonical" angle={angle}
              active={active} t={t}/>
            <small>{clipped?'源绘图裁掉 v<u；粗线为回归边。':
              kind==='tangent-both-3834'?'源绘图保留双支；粗线为 v=u 回归边。':
                cone?'v=0 的顶点不正则。':'v∈[−1,1] 的完整柱面带。'}</small></section>
          <section className="ctg-panel"><header><span>DEVELOPED / 2D</span>
            <strong>本地推导的等距展开</strong></header>
            <Diagram sample={sample} kind={kind} view="flat" angle={angle}
              active={active} t={t}/>
            <small>二维展开为本地度量核验视图，不是原函数输出。</small></section>
        </div>
        <div className="ctg-proof"><strong>{status}</strong><span>规范三维面与本地二维展开在正则域同第一基本形式：{metric}。</span></div>
        <div className="ctg-warning">裁剪域及奇点不宣称正则保距纸片；可见母线只作图示采样，
          不产生精确 FOLD、赋型、层序、运动或可采用工程。</div>
        <footer className="ctg-footer"><span>只读 · 无可机读 Wolfram 数值 Out</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
