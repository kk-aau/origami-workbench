import {useState} from 'react';
import {cutDistances,sampleSequence,stageSurface,type Point2,type Point3,
  type ReflectionSequenceCase} from '../app/curvedPlanarReflectionSequence';
import {TessDialog} from './TessellationEditor';
import './CurvedPlanarReflectionSequenceDialog.css';

const cases:Record<ReflectionSequenceCase,{name:string;subtitle:string;source:string;metric:string;
  description:string}>={
  'cone-symbolic':{name:'圆锥 · 四切平面',subtitle:'In[4039] / Compose=True',
    source:'z 轴圆锥 · θ=30°',metric:'E=v²/4 · F=0 · G=1',
    description:'四个平面高度 1/2/3/4；中间两个法向分别绕 x、y 轴倾斜 10°。后续平面随已完成的反射变换。'},
  'cylinder-symbolic':{name:'圆柱 · 两切平面',subtitle:'In[4040] / Compose=False',
    source:'单位半圆柱 · u∈[−π/4,π/4]',metric:'E=1 · F=0 · G=1',
    description:'两个平行平面过 (1,0,1)、(2,0,1)，法向均为 (−1,0,1)/√2；后续平面保持原空间位置。'},
  'cone-numeric-input':{name:'圆锥 · 数值保存输入',subtitle:'In[4043] / Compose=True',
    source:'z 轴圆锥 · θ=30°',metric:'E=v²/4 · F=0 · G=1',
    description:'与 In[4039] 同一几何输入。这里按原表达式连续闭式求值，不复现 Wolfram 的 FunctionInterpolation 数值输出。'},
};
const palette=['#70b8a6','#d7ae70','#7fa8cf','#b99acb'];
const path=(points:Point2[])=>points.map(([x,y],i)=>
  `${i?'L':'M'}${x.toPrecision(9)} ${y.toPrecision(9)}`).join(' ');
function projection([x,y,z]:Point3,azimuth:number):Point2{
  const a=azimuth*Math.PI/180,e=27*Math.PI/180;
  return [Math.cos(a)*x-Math.sin(a)*y,
    -(Math.sin(a)*Math.sin(e)*x+Math.cos(a)*Math.sin(e)*y+Math.cos(e)*z)];
}
function bounds(curves:Point2[][]){
  const points=curves.flat(),xs=points.map(([x])=>x),ys=points.map(([,y])=>y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const pad=Math.max(maxX-minX,maxY-minY,.1)*.12;
  return `${minX-pad} ${minY-pad} ${maxX-minX+2*pad} ${maxY-minY+2*pad}`;
}
function SequencePlot({curves,selected,title,testId}:{curves:Point2[][];selected:number;
  title:string;testId:string}){
  return <svg role="img" data-testid={testId} aria-label={title} viewBox={bounds(curves)}
    preserveAspectRatio="xMidYMid meet">
    {curves.slice(0,-1).map((curve,i)=><path key={`band-${i}`}
      data-testid={`${testId}-patch`} className="pr-seq-band"
      style={{fill:palette[i%palette.length]}}
      d={`${path([...curve,...curves[i+1].slice().reverse()])} Z`}/>)}
    {curves.map((curve,i)=><path key={`curve-${i}`} className="pr-seq-curve"
      d={path(curve)} vectorEffect="non-scaling-stroke"/>)}
    {curves.slice(0,-1).map((curve,i)=><line key={`ruling-${i}`}
      className="pr-seq-selected" vectorEffect="non-scaling-stroke"
      x1={curve[selected][0]} y1={curve[selected][1]}
      x2={curves[i+1][selected][0]} y2={curves[i+1][selected][1]}/>)}
    {curves.map((curve,i)=><circle key={`point-${i}`} className="pr-seq-point"
      cx={curve[selected][0]} cy={curve[selected][1]} r=".035"/>)}
  </svg>;
}

/** Fixed continuous reflected surfaces; no FOLD geometry or state mutation. */
export default function CurvedPlanarReflectionSequenceDialog({onClose}:{onClose:()=>void}){
  const [kind,setKind]=useState<ReflectionSequenceCase>('cone-symbolic');
  const [active,setActive]=useState(32),[azimuth,setAzimuth]=useState(-35);
  const sample=sampleSequence(kind,64),info=cases[kind];
  const u=sample.uValues[active],cuts=cutDistances(kind,u);
  const original=Array.from({length:sample.input.curveCount},(_,curve)=>
    sample.uValues.map((value,i)=>projection(
      stageSurface(kind,value,sample.distances[i][curve],0),azimuth)));
  const folded=sample.curves3D.map(curve=>curve.map(point=>projection(point,azimuth)));
  const flat=sample.curves2D.map(curve=>curve.map(([x,y])=>[x,-y] as Point2));
  const panels=[
    {key:'source',number:'01',title:'原始三维曲面',subtitle:info.source,curves:original},
    {key:'folded',number:'02',title:'平面镜像后 · 连续 3D',
      subtitle:`${sample.input.patchCount} 片直纹曲带`,curves:folded},
    {key:'flat',number:'03',title:'对应二维展开',subtitle:'同一 (u,v) 参数',curves:flat},
  ];
  return <TessDialog title="第 45 节 · 平面镜像曲折序列保存例" onClose={onClose}>
    <div className="planar-reflection-sequence-dialog">
      <aside className="pr-seq-controls">
        <span className="pr-seq-kicker">PLANAR MIRROR SEQUENCE / P45</span>
        <h2>一张曲面，连续反折</h2>
        <p>固定保存输入。每条切线由当前直纹面与指定镜面相交得到；相邻曲带在同一条空间曲线上接合。</p>
        <div className="pr-seq-presets" role="group" aria-label="镜像序列保存例">
          {(Object.keys(cases) as ReflectionSequenceCase[]).map(next=><button
            type="button" key={next} aria-pressed={next===kind}
            onClick={()=>{setKind(next);setActive(32);}}>
            <strong>{cases[next].name}</strong><small>{cases[next].subtitle}</small></button>)}
        </div>
        <p className="pr-seq-description">{info.description}</p>
        <label className="pr-seq-slider" htmlFor="pr-seq-u">母线位置 <strong>u={u.toFixed(3)}</strong>
          <input id="pr-seq-u" type="range" min="0" max="64" value={active}
            onChange={event=>setActive(Number(event.target.value))}/></label>
        <label className="pr-seq-slider" htmlFor="pr-seq-view">观察方位 <strong>{azimuth}°</strong>
          <input id="pr-seq-view" type="range" min="-80" max="80" value={azimuth}
            onChange={event=>setAzimuth(Number(event.target.value))}/></label>
        <div className="pr-seq-values"><span>切线母线距离 v</span>
          <strong>{cuts.map(value=>value.toFixed(3)).join(' / ')}</strong></div>
      </aside>
      <main className="pr-seq-main">
        <header className="pr-seq-heading"><div><span>IN[{kind==='cone-symbolic'?'4039':
          kind==='cylinder-symbolic'?'4040':'4043'}] / CONTINUOUS RECONSTRUCTION</span>
          <h3>{info.name}</h3></div><small>{sample.input.composeReflections?
          'ComposeReflections → True':'ComposeReflections → False'}</small></header>
        <div className="pr-seq-panels">{panels.map(panel=><section className="pr-seq-panel" key={panel.key}>
          <header><span>{panel.number} / {panel.title}</span><small>{panel.subtitle}</small></header>
          <SequencePlot curves={panel.curves} selected={active} title={panel.title}
            testId={`reflection-${panel.key}`}/>
          <footer>{panel.key==='flat'?'连续二维展开':'连续曲面'} · 非多面体折面</footer>
        </section>)}</div>
        <div className="pr-seq-proof"><strong>逐片连续等距 · {sample.input.patchCount} 片</strong>
          <span>二维与每片三维曲带同度量：{info.metric}。{kind!=='cylinder-symbolic'&&
            '圆锥顶点 v=0 奇异，仅 v>0 正则。'}{kind==='cone-numeric-input'&&
            '数值原函数的插值与 Wolfram 数值 Out 未复刻。'}</span></div>
        <p className="pr-seq-caution">反射得到的是静态连续曲面及展示采样；未验证连续折叠运动、自碰撞、全局层序或精确直折痕面。二维采样弦线不构成等距 FOLD，因此本视图只读、不可采用。</p>
        <footer className="pr-seq-footer"><span>当前画布和工程不会因预览而修改。</span>
          <button type="button" className="primary" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
