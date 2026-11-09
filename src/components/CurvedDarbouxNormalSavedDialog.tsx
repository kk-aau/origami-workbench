import {useMemo,useState} from 'react';
import {
  analyticDarboux,hyperboloidArea,hyperboloidBase,hyperboloidNormal,
  hyperboloidPoint,numericDarboux,sampleDiagnostics,sinusoidCurve,
  sinusoidFrame,sinusoidSurface,
  type DarbouxFrame,type Point3,
} from '../app/curvedDarbouxNormalSavedIn3812';
import {earlyCurve,earlyFrame,earlyIntersectionTangency,earlySurface,
  type EarlyCell} from '../app/curvedEarlyDarbouxSavedIn3793';
import {TessDialog} from './TessellationEditor';
import './CurvedDarbouxNormalSavedDialog.css';

type Point2=[number,number];
const project=(p:Point3,angle:number):Point2=>{
  const a=angle*Math.PI/180,e=Math.PI/6;
  const depth=Math.sin(a)*p[0]+Math.cos(a)*p[1];
  return [Math.cos(a)*p[0]-Math.sin(a)*p[1],
    -Math.sin(e)*depth+Math.cos(e)*p[2]];
};
const add=(a:Point3,b:Point3,k:number):Point3=>
  [a[0]+k*b[0],a[1]+k*b[1],a[2]+k*b[2]];
const dist=(a:Point3,b:Point3)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const draw=(pts:Point2[])=>pts.map(([x,y],i)=>
  `${i?'L':'M'}${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ');
function canvasBounds(groups:Point2[][]){
  const all=groups.flat(),xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),
    span=Math.max(x1-x0,y1-y0,.1),pad=.13*span;
  return {box:`${x0-pad} ${y0-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}`,
    marker:.012*span};
}
function RecoverDiagram({numeric,u,angle}:{numeric:boolean;u:number;angle:number}){
  const frames=useMemo(()=>Array.from({length:81},(_,i)=>numeric?
    numericDarboux(Math.PI*i/80):analyticDarboux(Math.PI*i/80)),[numeric]);
  const frame=numeric?numericDarboux(u):analyticDarboux(u),
    curve=frames.map(f=>project(f.c,angle)),base=project(frame.c,angle);
  const vectors:{name:string;tip:Point2}[]=[
    {name:'t',tip:project(add(frame.c,frame.t,.5),angle)},
    {name:'l',tip:project(add(frame.c,frame.l,.5),angle)},
    {name:'n',tip:project(add(frame.c,frame.n,.5),angle)},
  ];
  const {box,marker}=canvasBounds([curve,[base,...vectors.map(v=>v.tip)]]);
  return <svg role="img" data-testid={`darboux-saved-${numeric?'numeric':'analytic'}`}
    aria-label={numeric?'本地数值 Darboux 重演':'解析 Darboux 轨迹'} viewBox={box}>
    <path className="cdn-curve" d={draw(curve)}/>
    {vectors.map(vector=><path key={vector.name} className={`cdn-vector cdn-${vector.name}`}
      d={draw([base,vector.tip])}/>)}
    <circle className="cdn-marker" cx={base[0]} cy={-base[1]} r={marker}/>
    <text className="cdn-vector-label" x={vectors[0].tip[0]} y={-vectors[0].tip[1]}>T</text>
    <text className="cdn-vector-label" x={vectors[1].tip[0]} y={-vectors[1].tip[1]}>L</text>
    <text className="cdn-vector-label" x={vectors[2].tip[0]} y={-vectors[2].tip[1]}>U</text>
  </svg>;
}
function NormalDiagram({sigma,u,v,angle}:{sigma:1|-1;u:number;v:number;angle:number}){
  const sample=useMemo(()=>sampleDiagnostics('3818',80),[]);
  if(!sample.base||!sample.bottom||!sample.top)
    throw Error('固定法向图示缺少源曲线。');
  const base=sample.base.map(p=>project(p,angle)),
    bottom=sample.bottom.map(p=>project(p,angle)),
    top=sample.top.map(p=>project(p,angle));
  const arrows=Array.from({length:11},(_,i)=>{
    const at=-Math.PI/2+(1.9*Math.PI)*i/10,p=hyperboloidBase(at),
      n=hyperboloidNormal(at,0,sigma);
    return [project(p,angle),project(add(p,n,.5),angle)] as [Point2,Point2];
  });
  const current=hyperboloidPoint(u,v),normal=hyperboloidNormal(u,v,sigma),
    selected=[project(current,angle),project(add(current,normal,.5),angle)] as [Point2,Point2];
  const {box,marker}=canvasBounds([base,bottom,top,...arrows,selected]);
  return <svg role="img" data-testid={`ruled-normal-${sigma===1?'positive':'negative'}`}
    aria-label={sigma===1?'直纹双曲面正朝向法向':'直纹双曲面负朝向法向'} viewBox={box}>
    <path className="cdn-area" d={draw([...bottom,...top.slice().reverse()])+' Z'}/>
    {base.map((p,i)=>i%8===0?<path key={i} className="cdn-ruling"
      d={draw([bottom[i],top[i]])}/>:null)}
    <path className="cdn-base" d={draw(base)}/>
    <path className="cdn-boundary" d={draw(bottom)}/>
    <path className="cdn-boundary" d={draw(top)}/>
    {arrows.map((pair,i)=><path key={i} className="cdn-normal" d={draw(pair)}/>)}
    <path className="cdn-selected-normal" d={draw(selected)}/>
    <circle className="cdn-marker" cx={selected[0][0]} cy={-selected[0][1]} r={marker}/>
  </svg>;
}
function SinusoidDiagram({system,t,angle}:{system:'frenet'|'darboux';t:number;angle:number}){
  const frame=sinusoidFrame(t),base=project(frame.point,angle);
  const curve=Array.from({length:101},(_,i)=>project(sinusoidCurve(-1+i/50),angle));
  const mesh:Point2[][]=[
    ...Array.from({length:9},(_,i)=>{
      const y=-1+i/4;
      return Array.from({length:13},(_,j)=>project(sinusoidSurface(-1+j/8,y),angle));
    }),
    ...Array.from({length:7},(_,i)=>{
      const x=-1+i/4;
      return Array.from({length:33},(_,j)=>project(sinusoidSurface(x,-1+j/16),angle));
    }),
  ];
  const vectors:{name:string;direction:Point3}[]=[
    {name:'T',direction:frame.tangent},
    {name:system==='frenet'?'N':'L',direction:system==='frenet'?
      frame.normal:frame.tangentNormal},
    {name:system==='frenet'?'B':'U',direction:system==='frenet'?
      frame.binormal:frame.surfaceNormal},
  ];
  const tips=vectors.map(vector=>project(add(frame.point,vector.direction,.3),angle));
  const {box,marker}=canvasBounds([curve,...mesh,[base,...tips]]);
  return <svg role="img" data-testid={`sinusoid-${system}`}
    aria-label={system==='frenet'?'正弦曲线 Frenet 标架':'正弦曲线 Darboux 标架'}
    viewBox={box}>
    {mesh.map((line,i)=><path key={i} className="cdn-surface-mesh" d={draw(line)}/>)}
    <path className="cdn-curve" d={draw(curve)}/>
    {vectors.map((vector,i)=><path key={vector.name}
      className={`cdn-vector cdn-${i===0?'t':i===1?'l':'n'}`}
      d={draw([base,tips[i]])}/>)}
    <circle className="cdn-marker" cx={base[0]} cy={-base[1]} r={marker}/>
    {vectors.map((vector,i)=><text key={vector.name} className="cdn-vector-label"
      x={tips[i][0]} y={-tips[i][1]}>{vector.name}</text>)}
  </svg>;
}
function EarlyDiagram({cell,t,angle,side=1,system}:{cell:EarlyCell;t:number;angle:number;
  side?:1|2;system?:'frenet'|'darboux'}){
  const cylinder=cell==='3794',lo=cylinder?-Math.PI/2:-.3,
    hi=cylinder?Math.PI/2:.3,frame=earlyFrame(cell,t),
    curve=Array.from({length:101},(_,i)=>project(earlyCurve(cell,lo+(hi-lo)*i/100),angle));
  const mesh:Point2[][]=[];
  if(cylinder){
    const xlo=side===1?-1:-.5;
    for(let i=0;i<=8;i++){
      const phi=lo+(hi-lo)*i/8;
      mesh.push(Array.from({length:17},(_,j)=>project(earlySurface(cell,
        xlo+(1.5-xlo)*j/16,phi,side),angle)));
    }
    for(let i=0;i<=8;i++){
      const x=xlo+(1.5-xlo)*i/8;
      mesh.push(Array.from({length:33},(_,j)=>project(earlySurface(cell,x,
        lo+(hi-lo)*j/32,side),angle)));
    }
  }else{
    for(let i=0;i<=6;i++){
      const y=-.3+.6*i/6;
      mesh.push(Array.from({length:17},(_,j)=>project(earlySurface(cell,
        -.3+.6*j/16,y),angle)));
    }
    for(let i=0;i<=6;i++){
      const x=-.3+.6*i/6;
      mesh.push(Array.from({length:17},(_,j)=>project(earlySurface(cell,x,
        -.3+.6*j/16),angle)));
    }
  }
  const principal=cylinder?[]:[
    Array.from({length:41},(_,i)=>project(earlySurface(cell,-.3+.6*i/40,0),angle)),
    Array.from({length:41},(_,i)=>project(earlySurface(cell,0,-.3+.6*i/40),angle)),
  ];
  const base=project(frame.point,angle);
  const vectors=cell==='3793'&&system?[
    {name:'T',direction:frame.tangent},
    {name:system==='frenet'?'N':'L',direction:system==='frenet'?
      frame.frenetNormal:frame.tangentNormal},
    {name:system==='frenet'?'B':'U',direction:system==='frenet'?
      frame.binormal:frame.surfaceNormal},
  ]:[];
  const tips=vectors.map(vector=>project(add(frame.point,vector.direction,.1),angle));
  const {box,marker}=canvasBounds([curve,...mesh,...principal,[base,...tips]]);
  return <svg role="img" data-testid={`early-${cell}-${cylinder?`surface${side}`:system??'curve'}`}
    aria-label={`In[${cell}] ${cylinder?`圆柱 ${side}`:system??'二次曲面'} 只读几何`}
    viewBox={box}>
    {mesh.map((line,i)=><path key={i} className="cdn-surface-mesh" d={draw(line)}/>)}
    {principal.map((line,i)=><path key={i} className="cdn-principal" d={draw(line)}/>)}
    <path className="cdn-curve" d={draw(curve)}/>
    {vectors.map((vector,i)=><path key={vector.name}
      className={`cdn-vector cdn-${i===0?'t':i===1?'l':'n'}`}
      d={draw([base,tips[i]])}/>)}
    <circle className="cdn-marker" cx={base[0]} cy={-base[1]} r={marker}/>
    {vectors.map((vector,i)=><text key={vector.name} className="cdn-vector-label"
      x={tips[i][0]} y={-tips[i][1]}>{vector.name}</text>)}
  </svg>;
}
export default function CurvedDarbouxNormalSavedDialog({onClose}:{onClose:()=>void}){
  const [kind,setKind]=useState<'recover'|'normal'|'sinusoid'|
    'paraboloid-frame'|'intersection'|'paraboloid-paths'>('recover');
  const [t,setT]=useState(.5),[v,setV]=useState(0),[angle,setAngle]=useState(-38);
  const earlyKind=kind==='paraboloid-frame'||kind==='intersection'||kind==='paraboloid-paths';
  const u=kind==='recover'?t*Math.PI:kind==='normal'?
    -Math.PI/2+t*(1.9*Math.PI):kind==='sinusoid'?2*t-1:
      kind==='intersection'?-Math.PI/2+t*Math.PI:-.3+.6*t;
  const exact=kind==='recover'?analyticDarboux(u):null,
    numeric=kind==='recover'?numericDarboux(u):null;
  const error=exact&&numeric?Math.max(...(['c','t','l','n'] as const)
    .map(key=>dist(exact[key],numeric[key]))):0;
  const normalPlus=kind==='normal'?hyperboloidNormal(u,v,1):null,
    normalMinus=kind==='normal'?hyperboloidNormal(u,v,-1):null;
  const sinusoid=kind==='sinusoid'?sinusoidFrame(u):null;
  const early=earlyKind?earlyFrame(kind==='paraboloid-frame'?'3793':
    kind==='intersection'?'3794':'3796',u):null;
  const earlyBent=kind==='paraboloid-paths'?earlyFrame('3797',u):null;
  return <TessDialog title="第 45 节 · 曲线标架与直纹法向保存诊断" onClose={onClose}>
    <div className="curved-darboux-normal-dialog">
      <aside className="cdn-controls">
        <span className="cdn-eyebrow">01 / FIXED SOURCE DIAGNOSTICS</span>
        <h2>曲线标架与曲面法向</h2>
        <p>按原保存输入复现连续标架与曲面；数值轨迹仅为本地重演。</p>
        <div className="cdn-switch" role="group" aria-label="第45节前段诊断例">
          <button type="button" aria-pressed={kind==='recover'}
            onClick={()=>{setKind('recover');setT(.5);}}>Darboux · In[3812/3816]</button>
          <button type="button" aria-pressed={kind==='normal'}
            onClick={()=>{setKind('normal');setT(.5);}}>双朝向法向 · In[3818]</button>
          <button type="button" aria-pressed={kind==='sinusoid'}
            onClick={()=>{setKind('sinusoid');setT(.75);}}>曲面曲线标架 · In[3795]</button>
          <button type="button" aria-pressed={kind==='paraboloid-frame'}
            onClick={()=>{setKind('paraboloid-frame');setT(.75);}}>二次面双标架 · In[3793]</button>
          <button type="button" aria-pressed={kind==='intersection'}
            onClick={()=>{setKind('intersection');setT(.5);}}>双圆柱交线 · In[3794]</button>
          <button type="button" aria-pressed={kind==='paraboloid-paths'}
            onClick={()=>{setKind('paraboloid-paths');setT(.5);}}>二次面双路径 · In[3796/3797]</button>
        </div>
        <dl className="cdn-readouts">
          <div><dt>当前 {kind==='recover'||kind==='normal'?'u':'t'}</dt><dd>{u.toFixed(3)}</dd></div>
          {kind==='recover'?<>
            <div><dt>源 ds, κn, κg, τg</dt><dd>1, 1, 0, 0</dd></div>
            <div><dt>本地 RK4 最大误差</dt><dd>{error.toExponential(2)}</dd></div>
            <div><dt>三向量长度</dt><dd>1.000</dd></div>
          </>:kind==='normal'?<>
            <div><dt>当前 v</dt><dd>{v.toFixed(2)}</dd></div>
            <div><dt>θ</dt><dd>45°</dd></div>
            <div><dt>面积因子</dt><dd>{hyperboloidArea(u,v).toFixed(3)}</dd></div>
            <div><dt>两法向点积</dt><dd>{normalPlus&&normalMinus?
              normalPlus.reduce((sum,x,i)=>sum+x*normalMinus[i],0).toFixed(3):''}</dd></div>
          </>:kind==='sinusoid'?<>
            <div><dt>κg, κn</dt><dd>{sinusoid?.geodesicCurvature.toFixed(6)}, {sinusoid?.normalCurvature.toFixed(6)}</dd></div>
            <div><dt>κ, τ</dt><dd>{sinusoid?.curvature.toFixed(6)}, {sinusoid?.torsion.toFixed(0)}</dd></div>
            <div><dt>τg</dt><dd>{sinusoid?.geodesicTorsion.toFixed(6)}</dd></div>
            <div><dt>曲面面积因子</dt><dd>{Math.sqrt(1+Math.sin(u)**2).toFixed(3)}</dd></div>
          </>:kind==='paraboloid-paths'?<>
            <div><dt>直线 κg, κn, τg</dt><dd>{early?.geodesicCurvature.toFixed(3)}, {early?.normalCurvature.toFixed(3)}, {early?.geodesicTorsion.toFixed(3)}</dd></div>
            <div><dt>弯线 κg, κn, τg</dt><dd>{earlyBent?.geodesicCurvature.toFixed(3)}, {earlyBent?.normalCurvature.toFixed(3)}, {earlyBent?.geodesicTorsion.toFixed(3)}</dd></div>
            <div><dt>固定绘图参数</dt><dd>α=30°, k₁=1, k₂=2</dd></div>
          </>:<>
            <div><dt>κg, κn, τg</dt><dd>{early?.geodesicCurvature.toFixed(3)}, {early?.normalCurvature.toFixed(3)}, {early?.geodesicTorsion.toFixed(3)}</dd></div>
            <div><dt>κ, τ</dt><dd>{early?.curvature.toFixed(3)}, {early?.torsion.toFixed(3)}</dd></div>
            <div><dt>{kind==='intersection'?'双圆柱法向叉积':'曲面面积因子'}</dt><dd>{kind==='intersection'?
              earlyIntersectionTangency(u).normalCrossMagnitude.toFixed(3):early?.surfaceArea.toFixed(3)}</dd></div>
          </>}
        </dl>
        <label className="cdn-slider">沿源区间位置
          <input type="range" min="0" max="1" step="0.01" value={t}
            aria-label="诊断参数位置" onChange={e=>setT(Number(e.target.value))}/>
        </label>
        {kind==='normal'&&<label className="cdn-slider">直纹面 v
          <input type="range" min="-1" max="1" step="0.01" value={v}
            aria-label="诊断直纹参数" onChange={e=>setV(Number(e.target.value))}/>
        </label>}
        <label className="cdn-slider">三维视角 <strong>{angle}°</strong>
          <input type="range" min="-180" max="180" value={angle}
            aria-label="诊断三维视角" onChange={e=>setAngle(Number(e.target.value))}/>
        </label>
        <p className="cdn-source">{kind==='recover'?
          '源初值 C=(0,0,0)，T=(1,0,0)，L=(0,1,0)，U=(0,0,1)；保存帧在 u=π/2。':
          kind==='normal'?'源将 z 轴绕径向内轴旋转 45° 生成母线；σ=±1 只翻转曲面法向。':
          kind==='sinusoid'?'源曲面 S(x,y)=(x,y,1−cos y)，曲线 F(t)=S(cos t−1,t)，标架位于 t=0.5。':
          kind==='paraboloid-frame'?'源 S=(x,y,x²+3y²)、α=30°，t∈[−.3,.3]；两套标架原图叠画于 t=.15，向量长 .1。':
          kind==='intersection'?'源 S₁=(x,sin φ,1−cos φ)、S₂=(1−cos ψ,sin ψ,z)；交线 F=(1−cos t,sin t,1−cos t)。':
          '源 S=(x,y,(x²+2y²)/2)；两例固定绘图参数同为 α=30°、k₁=1、k₂=2、r=.3。'}</p>
      </aside>
      <main className="cdn-results">
        <div className="cdn-heading"><span>02 / 源例并排核验</span>
          <strong>{kind==='recover'?'解析与本地数值重演':kind==='normal'?
            '同一双曲面的相反朝向':kind==='sinusoid'?
            '同一广义柱面的两种曲线标架':kind==='paraboloid-frame'?
            '同一二次曲面的 Frenet 与 Darboux 标架':kind==='intersection'?
            '两单位圆柱的共同交线':'同一二次曲面的直线与弯曲参数路径'}</strong></div>
        <div className="cdn-panels">
          {kind==='recover'?<>
            <section className="cdn-panel"><header><span>In[3812] / ANALYTIC</span>
              <strong>闭式 Darboux 帧</strong></header>
              <RecoverDiagram numeric={false} u={u} angle={angle}/>
              <small>C=(sin u,0,1−cos u)，T′=U，U′=−T，L′=0。</small></section>
            <section className="cdn-panel"><header><span>In[3816] / LOCAL RK4</span>
              <strong>相同初值与微分方程</strong></header>
              <RecoverDiagram numeric u={u} angle={angle}/>
              <small>512 步独立 RK4；不是 Wolfram 插值坐标。</small></section>
          </>:kind==='normal'?<>
            <section className="cdn-panel"><header><span>In[3818] / σ=+1</span>
              <strong>外向法向</strong></header>
              <NormalDiagram sigma={1} u={u} v={v} angle={angle}/>
              <small>同一正则直纹双曲面；法向为 +Sᵤ×Sᵥ/‖Sᵤ×Sᵥ‖。</small></section>
            <section className="cdn-panel"><header><span>In[3818] / σ=−1</span>
              <strong>内向法向</strong></header>
              <NormalDiagram sigma={-1} u={u} v={v} angle={angle}/>
              <small>仅法向和显示面朝向相反；几何曲面保持相同。</small></section>
          </>:kind==='sinusoid'?<>
            <section className="cdn-panel"><header><span>In[3795] / FRENET</span>
              <strong>曲线内禀标架</strong></header>
              <SinusoidDiagram system="frenet" t={u} angle={angle}/>
              <small>F、T、N、B；空间曲线在 x+z=0 平面内，τ=0。</small></section>
            <section className="cdn-panel"><header><span>In[3795] / DARBOUX</span>
              <strong>相对于曲面的标架</strong></header>
              <SinusoidDiagram system="darboux" t={u} angle={angle}/>
              <small>同一 F、T；U 为曲面单位法向，L=U×T。</small></section>
          </>:kind==='paraboloid-frame'?<>
            <section className="cdn-panel"><header><span>In[3793] / FRENET</span>
              <strong>源双标架拆分：Frenet</strong></header>
              <EarlyDiagram cell="3793" t={u} angle={angle} system="frenet"/>
              <small>S=(x,y,x²+3y²)，F=S(t cos30°,t sin30°)。</small></section>
            <section className="cdn-panel"><header><span>In[3793] / DARBOUX</span>
              <strong>源双标架拆分：Darboux</strong></header>
              <EarlyDiagram cell="3793" t={u} angle={angle} system="darboux"/>
              <small>原图将两标架叠画；此处拆分以辨认 T、L、U。</small></section>
          </>:kind==='intersection'?<>
            <section className="cdn-panel"><header><span>In[3794] / CYLINDER 1</span>
              <strong>沿 x 方向的圆柱</strong></header>
              <EarlyDiagram cell="3794" t={u} angle={angle} side={1}/>
              <small>S₁(x,φ)=(x,sinφ,1−cosφ)；F 严格在其上。</small></section>
            <section className="cdn-panel"><header><span>In[3794] / CYLINDER 2</span>
              <strong>沿 z 方向的圆柱</strong></header>
              <EarlyDiagram cell="3794" t={u} angle={angle} side={2}/>
              <small>S₂(z,ψ)=(1−cosψ,sinψ,z)；与左图共享 F。</small></section>
          </>:<>
            <section className="cdn-panel"><header><span>In[3796] / STRAIGHT</span>
              <strong>参数平面直线</strong></header>
              <EarlyDiagram cell="3796" t={u} angle={angle}/>
              <small>q(t)=(t cos30°,t sin30°)，κg(0)=0。</small></section>
            <section className="cdn-panel"><header><span>In[3797] / BENT</span>
              <strong>旋转的参数抛物线</strong></header>
              <EarlyDiagram cell="3797" t={u} angle={angle}/>
              <small>q(t)=(at−bt²,bt+at²)，κg(0)=2。</small></section>
          </>}
        </div>
        <div className="cdn-proof"><strong>{kind==='recover'?'源 ODE 与初值一致':kind==='normal'?
          '双朝向严格相反 · 全显示域正则':kind==='sinusoid'?
          '源曲线／曲面与 Frenet、Darboux 定义一致':kind==='intersection'?
          '交线严格属于两个圆柱':'保存源式与 Darboux 微分定义一致'}</strong><span>{kind==='recover'?
          '闭式帧正交单位；本地数值误差按当前参数与闭式逐向量比较。':
          kind==='normal'?'法向均单位且垂直 Sᵤ、Sᵥ，面积因子 √(½+v²/2)≥1/√2。':
          kind==='sinusoid'?'曲线全域速度≥1、曲面面积因子≥1，κ²=κg²+κn²；所有标架向量正交单位。':
          kind==='intersection'?'S₁ 与 S₂ 均为单位圆柱；源曲线在两者上，端点两曲面相切而曲线仍正则。':
          '两二次曲面全域正则；曲线标架正交单位，κ²=κg²+κn²，Darboux 微分方程成立。'}</span></div>
        <div className="cdn-warning">{kind==='recover'?
          '原保存图只画曲线和标架，没有返回周围纸面；本地 RK4 不等于 Wolfram NDSolve 的插值输出。':
          kind==='normal'?'此直纹双曲面不可展，属于法向诊断，不是可折纸面。':
          kind==='sinusoid'?'原图只比较曲线的 Frenet 与 Darboux 标架；虽显示可展广义柱面，却没有返回纸张展开、折痕赋型或层序。':
          kind==='paraboloid-frame'?'原图将两套标架叠画；此处分屏可视化同一公式，二次曲面具有正高斯曲率，不能当成平纸。':
          kind==='intersection'?'圆柱交线是几何诊断；端点处两曲面相切，原调用没有生成两侧纸张展开、赋型或层序。':
          'In[3796]/[3797] 先符号打印 t=0 曲率，后赋值 k₁=1、k₂=2、α=30° 作图；界面读数是后者的源式推导值，并非原打印数值。'}
          {' '}此入口无精确 FOLD 或可采用纸张证书。</div>
        <footer className="cdn-footer"><span>只读 · 无可机读 Wolfram 数值 Out</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
