import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';
import {compileSimulationStepRigidMechanism} from './simStepRigid';
import {certifySimulationStepFlexPath} from './simStepFlexCollision';
import {evaluateSimulationContactStep} from './simContact';

export interface SimulationStepDynamicKeyframe {progress:number;positions:number[]}
/** A deterministic recording of the ordinary dynamic simulator. These are
 * numerical poses, not a rigid-foldability or non-intersection certificate. */
export interface SimulationStepDynamicMotion {
  version:1;
  method:'dynamic';
  keyframes:SimulationStepDynamicKeyframe[];
  /** The fold clock finishes here; the remaining interval reaches the
   * certified target pose. Relative crease timings retain the same clock. */
  settleStart?:number;
  maxEdgeStrain:number;
  maxAreaStrain:number;
  /** Degrees of circular error between actual hinges and requested targets. */
  maxAngleError:number;
  endAngleError:number;
  maxFixedDisplacement:number;
  /** Progress reached before collision protection stopped the real playback
   * path. The remaining timeline holds this safe pose; it is not completion. */
  contactStop?:{progress:number;reason:string};
}
export interface SimulationStepDynamicOptions {
  steps?:number;
  iterationsPerStep?:number;
  finalIterations?:number;
  /** Explicit caller limit only; omitted/Infinity keeps advancing until complete. */
  maxTimeMs?:number;
  onProgress?:(message:string)=>void;
}
type V=[number,number,number];
const point=(p:ArrayLike<number>,i:number):V=>[p[3*i],p[3*i+1],p[3*i+2]];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=(p:V)=>Math.hypot(...p);
const unit=(p:V):V=>{const n=length(p);return [p[0]/n,p[1]/n,p[2]/n];};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const edgeLimit=.12,areaLimit=.25,fixedLimit=2e-6;
const materialLimits=(animation:SimulationStepAnimation)=>animation.materialMode==='bendable'?{edge:.04,area:.08}:{edge:edgeLimit,area:areaLimit};
export class SimulationStepMaterialStrainError extends Error {}

/** Independent progress targets preserve windows and outward/return actions.
 * The dynamic solver must never infer a seek position from hinge angles. */
export function simulationStepDynamicAngles(animation:SimulationStepAnimation,progress:number,foldEnd=animation.dynamic?.settleStart??1):number[]{
  if(!Number.isFinite(progress))throw Error('数值步骤动画进度无效。');
  const p=clamp(progress/foldEnd),timings=new Map(animation.timings?.map(t=>[t.edge,t]));
  return animation.ranges.map(r=>{
    const t=timings.get(r.edge),local=t?clamp((p-t.start)/(t.end-t.start)):p;
    return r.viaAngle===undefined?r.fromAngle+(r.toAngle-r.fromAngle)*local:local<=.5?r.fromAngle+(r.viaAngle-r.fromAngle)*local*2:r.viaAngle+(r.toAngle-r.viaAngle)*(local-.5)*2;
  });
}

/** A valid target pose does not require the intervening numerical motion to
 * be rigid. Check it against the original material metric, all hinges and pins
 * before using it as the destination of the final pressing interval. */
function certifiedEndpoint(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation):Float32Array|null{
  try{return compileSimulationStepRigidMechanism(prepared,animation).validatePose(animation.ranges.map(r=>r.toAngle));}
  catch{return null;}
}

function material(prepared:PreparedOrigamiModel){
  const model=new OrigamiModel(prepared),rest=prepared.edgesVertices.map((_,e)=>model.edgeRestLength(e));
  const areas=prepared.facesVertices.map(([a,b,c])=>length(cross(sub(point(model.originalPositions,b),point(model.originalPositions,a)),sub(point(model.originalPositions,c),point(model.originalPositions,a)))));
  return {rest,areas};
}

/** Bound the whole straight pressing path. Squared edge lengths are quadratic;
 * quadratic Bezier controls bound the triangle area vector over the interval.
 * A far-away numerical branch must not be collapsed into a flat destination. */
function safePress(prepared:PreparedOrigamiModel,from:ArrayLike<number>,to:ArrayLike<number>,rest:number[],areas:number[],limits={edge:edgeLimit,area:areaLimit}):boolean{
  for(let e=0;e<prepared.edgesVertices.length;e++){
    const [a,b]=prepared.edgesVertices[e],start=sub(point(from,b),point(from,a)),end=sub(point(to,b),point(to,a)),delta=sub(end,start),denominator=dot(delta,delta);
    const t=denominator>0?clamp(-dot(start,delta)/denominator):0,min=length(start.map((v,k)=>v+t*delta[k]) as V),max=Math.max(length(start),length(end));
    if(min<rest[e]*(1-limits.edge)||max>rest[e]*(1+limits.edge))return false;
  }
  return prepared.facesVertices.every(([a,b,c],f)=>{
    const u=sub(point(from,b),point(from,a)),v=sub(point(from,c),point(from,a)),du=sub(sub(point(to,b),point(to,a)),u),dv=sub(sub(point(to,c),point(to,a)),v);
    const n0=cross(u,v),first=cross(du,v),second=cross(u,dv),n1=first.map((n,k)=>n+second[k]) as V,n2=cross(du,dv);
    const controls=[n0,n0.map((n,k)=>n+n1[k]/2) as V,n0.map((n,k)=>n+n1[k]+n2[k]) as V],axis=unit(controls[2]);
    return controls.every(n=>dot(n,axis)>=areas[f]*(1-limits.area)&&length(n)<=areas[f]*(1+limits.area));
  });
}

function inspect(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,positions:ArrayLike<number>,progress:number,rest:number[],areas:number[],foldEnd=1){
  if(positions.length!==prepared.vertexCount*3||Array.from(positions).some(v=>!Number.isFinite(v)||Math.abs(v)>1e4))throw Error('数值步骤动画发生发散，未播放无效纸面。');
  let maxEdgeStrain=0,maxAreaStrain=0,maxFixedDisplacement=0,maxAngleError=0;
  prepared.edgesVertices.forEach(([a,b],e)=>{maxEdgeStrain=Math.max(maxEdgeStrain,Math.abs(length(sub(point(positions,b),point(positions,a)))/rest[e]-1));});
  const normals=prepared.facesVertices.map(([a,b,c],i)=>{
    const n=cross(sub(point(positions,b),point(positions,a)),sub(point(positions,c),point(positions,a))),area=length(n);
    if(!Number.isFinite(area)||area<areas[i]*1e-4)throw Error('数值步骤动画出现退化纸面，未启动播放。');
    maxAreaStrain=Math.max(maxAreaStrain,Math.abs(area/areas[i]-1));return unit(n);
  });
  animation.fixedVertices.forEach(v=>{maxFixedDisplacement=Math.max(maxFixedDisplacement,length(sub(point(positions,v),point(animation.initialPositions,v))));});
  const target=simulationStepDynamicAngles(animation,progress,foldEnd);
  prepared.creaseParams.forEach((c,i)=>{
    // Flat material seams are a discretization of bending, not target creases.
    // Real mountain/valley hinges and active precreases retain their targets.
    const range=animation.ranges[i];
    if(animation.materialMode==='bendable'&&prepared.edgesAssignment[c.edge]==='F'&&range.fromAngle===0&&range.toAngle===0&&!range.viaAngle)return;
    const [a,b]=prepared.edgesVertices[c.edge],axis=unit(sub(point(positions,b),point(positions,a))),n1=normals[c.face1],n2=normals[c.face2];
    const actual=Math.atan2(dot(cross(n1,axis),n2),dot(n1,n2)),difference=actual-target[i]*Math.PI/180;
    maxAngleError=Math.max(maxAngleError,Math.abs(Math.atan2(Math.sin(difference),Math.cos(difference)))*180/Math.PI);
  });
  const limits=materialLimits(animation);
  if(maxEdgeStrain>limits.edge||maxAreaStrain>limits.area)throw new SimulationStepMaterialStrainError(`数值步骤动画纸面变形过大（边长变化 ${(maxEdgeStrain*100).toFixed(1)}%，面积变化 ${(maxAreaStrain*100).toFixed(1)}%），未把发散结果作为成功动画。`);
  if(maxFixedDisplacement>fixedLimit)throw Error('数值步骤动画未保持固定纸层，未启动播放。');
  return {maxEdgeStrain,maxAreaStrain,maxFixedDisplacement,maxAngleError};
}

function interpolate(a:SimulationStepDynamicKeyframe,b:SimulationStepDynamicKeyframe,p:number):Float32Array{
  if(p<=a.progress)return Float32Array.from(a.positions);
  if(p>=b.progress)return Float32Array.from(b.positions);
  const t=(p-a.progress)/(b.progress-a.progress);
  return Float32Array.from(a.positions,(v,i)=>v+(b.positions[i]-v)*t);
}

/** Recompute diagnostics from the actual serialized poses, including the
 * interpolation used by seeking. Reported numbers are never trusted input. */
export function validateSimulationStepDynamicMotion(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,value:unknown):SimulationStepDynamicMotion{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('数值步骤动画数据无效。');
  const input=value as Partial<SimulationStepDynamicMotion>;
  if(input.version!==1||input.method!=='dynamic'||!Array.isArray(input.keyframes)||input.keyframes.length<2||input.keyframes.length>513||prepared.vertexCount>1200||prepared.faceCount>2400)throw Error('数值步骤动画关键帧无效。');
  if(input.settleStart!==undefined&&(!Number.isFinite(input.settleStart)||input.settleStart<.5||input.settleStart>=1))throw Error('数值步骤动画压平时段无效。');
  const keyframes:SimulationStepDynamicKeyframe[]=input.keyframes.map((frame,i)=>{
    if(!frame||typeof frame!=='object'||!Number.isFinite(frame.progress)||frame.progress<0||frame.progress>1||i>0&&frame.progress<=input.keyframes![i-1].progress||!Array.isArray(frame.positions)||frame.positions.length!==prepared.vertexCount*3)throw Error('数值步骤动画关键帧与材料网格不匹配。');
    return {progress:frame.progress,positions:[...frame.positions]};
  });
  if(keyframes[0].progress!==0||keyframes.at(-1)!.progress!==1||keyframes[0].positions.some((n,i)=>Math.abs(n-animation.initialPositions[i])>2e-7))throw Error('数值步骤动画没有保留真实操作前姿态。');
  if(input.contactStop!==undefined){
    const stop=input.contactStop;
    if(animation.collisionPolicy!=='contact'||!stop||!Number.isFinite(stop.progress)||stop.progress<0||stop.progress>=1||typeof stop.reason!=='string'||!stop.reason.trim()||stop.reason.length>1000)throw Error('步骤动画碰撞停止位置无效。');
    const anchor=keyframes.find(frame=>frame.progress===stop.progress);
    if(!anchor||keyframes.some(frame=>frame.progress>stop.progress&&frame.positions.some((n,i)=>n!==anchor.positions[i])))throw Error('步骤动画在碰撞停止后仍改变纸面，未启动播放。');
  }
  if(input.settleStart!==undefined){
    const target=certifiedEndpoint(prepared,animation);
    if(!target||keyframes.at(-1)!.positions.some((n,i)=>Math.abs(n-target[i])>2e-6)||!keyframes.some(frame=>frame.progress===input.settleStart))throw Error('数值步骤动画尚未达到本步通过校验的目标姿态。');
  }
  const {rest,areas}=material(prepared);
  let maxEdgeStrain=0,maxAreaStrain=0,maxAngleError=0,maxFixedDisplacement=0,endAngleError=0;
  const visit=(positions:ArrayLike<number>,p:number)=>{
    const m=inspect(prepared,animation,positions,p,rest,areas,input.settleStart??1);
    maxEdgeStrain=Math.max(maxEdgeStrain,m.maxEdgeStrain);maxAreaStrain=Math.max(maxAreaStrain,m.maxAreaStrain);maxAngleError=Math.max(maxAngleError,m.maxAngleError);maxFixedDisplacement=Math.max(maxFixedDisplacement,m.maxFixedDisplacement);if(p===1)endAngleError=m.maxAngleError;
  };
  keyframes.forEach((frame,i)=>{
    visit(frame.positions,frame.progress);
    if(i&&animation.materialMode==='bendable'&&!safePress(prepared,keyframes[i-1].positions,frame.positions,rest,areas,materialLimits(animation)))throw Error('曲面动画的连续过渡会过度拉伸或压缩纸面，请减少本步同时变化的折角。');
    if(i)for(const t of [.25,.5,.75]){const p=keyframes[i-1].progress+(frame.progress-keyframes[i-1].progress)*t;visit(interpolate(keyframes[i-1],frame,p),p);}
  });
  if(animation.collisionPolicy==='contact'){
    const proof=certifySimulationStepFlexPath({indices:prepared.indices,triangleSourceFaces:prepared.triangleSourceFaces},keyframes,{contactMode:'nonpenetration',maxTimeMs:8000,maxPairs:2_000_000,maxSegments:4096});
    if(proof.status!=='clear')throw Error(`纸面碰撞保护未确认回放路径安全：${proof.reason??'存在穿透或尚未明确的接触方向。'}`);
  }
  return {version:1,method:'dynamic',keyframes,...(input.settleStart!==undefined?{settleStart:input.settleStart}:{}),...(input.contactStop?{contactStop:{...input.contactStop}}:{}),maxEdgeStrain,maxAreaStrain,maxAngleError,endAngleError,maxFixedDisplacement};
}

/** Record the same CPU spring solver available in the three-dimensional
 * workspace. The rest mesh, material topology and all user pins stay intact. */
export function planSimulationStepDynamic(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,options:SimulationStepDynamicOptions={}):SimulationStepDynamicMotion{
  const started=Date.now(),budget=Math.max(100,options.maxTimeMs??Infinity);
  for(const strength of [1,4,16]){
    try{return planSimulationStepDynamicAttempt(prepared,animation,{...options,maxTimeMs:Math.max(0,budget-(Date.now()-started))},strength);}
    catch(error){
      if(!(error instanceof SimulationStepMaterialStrainError)||animation.materialMode!=='bendable'||strength===16||Date.now()-started>=budget)throw error;
      options.onProgress?.('纸面变形超出容差，正在从初始姿态加强材料约束后重新求解…');
    }
  }
  throw Error('数值步骤动画未取得有效材料姿态。');
}

function planSimulationStepDynamicAttempt(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,options:SimulationStepDynamicOptions,strength:number):SimulationStepDynamicMotion{
  if(animation.motionPolicy!=='allow-dynamic'||!['allow','contact'].includes(animation.collisionPolicy??'')||animation.flexRequest||animation.flex)throw Error('数值动画只用于明确允许纸面弯曲的步骤演示。');
  const bendable=animation.materialMode==='bendable';
  const steps=Math.max(16,Math.min(256,Math.trunc(options.steps??96))),iterations=Math.max(80,Math.min(4000,Math.trunc(options.iterationsPerStep??(bendable?160:640)))),finalIterations=Math.max(iterations,Math.min(24000,Math.trunc(options.finalIterations??(bendable?6400:12800))));
  const deadline=Date.now()+Math.max(100,options.maxTimeMs??Infinity);
  const model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,{axialStiffness:bendable?150*strength:40,creaseStiffness:bendable?.5:.7,panelStiffness:bendable?.01:.7,faceStiffness:bendable&&strength>1?.5*strength:.2,timeStepScale:bendable?.5:.35,damping:.5,integrationType:'euler'}),{rest,areas}=material(prepared);
  const contact=animation.collisionPolicy==='contact',contactMesh={indices:prepared.indices,triangleSourceFaces:prepared.triangleSourceFaces};
  // Protected playback follows only the continuously checked numerical path;
  // never append a separate unverified squeeze to a flat target.
  const destination=contact?null:certifiedEndpoint(prepared,animation),foldEnd=destination ? 0.9 : 1;
  const keyframes:SimulationStepDynamicKeyframe[]=[{progress:0,positions:[...animation.initialPositions]}];
  let contactStop:SimulationStepDynamicMotion['contactStop'];
  const source=animation.ranges.map(r=>r.fromAngle);
  const run=(count:number)=>{
    for(let left=count;left>0;left-=80){
      if(Date.now()>deadline)throw Error('数值步骤动画求解超时，请减少同时参与的折痕或拆分步骤。');
      solver.step(Math.min(80,left));
      if(!Number.isFinite(solver.maxVelocity()))throw Error('数值步骤动画发生发散，未启动播放。');
    }
  };
  try{
    if(contact){
      const initial=evaluateSimulationContactStep(contactMesh,animation.initialPositions,animation.initialPositions,{maxTimeMs:800,maxPairs:1_000_000});
      if(initial.status!=='clear')throw Error(`操作前纸面未通过碰撞保护检查：${initial.reason??'纸面已经穿插或接触关系尚未确定。'}`);
    }
    solver.setInitialPositions(Float32Array.from(animation.initialPositions),source);
    for(const v of animation.fixedVertices)solver.setVertexConstraint(v,point(animation.initialPositions,v));
    progression:for(let i=1;i<=steps;i++){
      const progress=i/steps,angles=simulationStepDynamicAngles(animation,progress,1);
      // The solver distinguishes driven creases from bendable panel seams by
      // the complete profile, not just the instantaneous target. Retain a
      // nonzero authored endpoint when unfolding a real crease to zero;
      // otherwise its motor becomes the weak panel spring at the endpoint.
      solver.setFoldProfile({ranges:prepared.creaseParams.map((c,j)=>({edge:c.edge,
        fromAngle:animation.ranges[j].fromAngle||animation.ranges[j].viaAngle||animation.ranges[j].toAngle,
        toAngle:angles[j]}))});
      solver.setFoldPercent(100);
      const count=i===steps?finalIterations:iterations;
      // A long terminal relaxation may cross a configuration branch. Record
      // its real intermediate poses too; a single final jump would make
      // linear seeking compress the sheet even though both ends are valid.
      const parts=i===steps?Math.min(128,Math.ceil(count/160)):Math.max(1,Math.min(Math.ceil(count/320),Math.floor(384/steps)));
      let completed=0;
      for(let part=1;part<=parts;part++){
        const next=Math.round(count*part/parts);run(next-completed);completed=next;
        const at=(i-1+part/parts)/steps,positions=Array.from(model.positions);
        if(contact){
          // The spring iterations produce a candidate, not displayed motion.
          // Playback is exactly the line segment between recorded poses. CCD
          // certifies every time on that actual segment before it is stored.
          const previous=keyframes.at(-1)!,checked=evaluateSimulationContactStep(contactMesh,previous.positions,positions,{maxTimeMs:250,maxPairs:500_000});
          if(checked.failure==='invalid')throw Error(`曲面动画的候选姿态无效：${checked.reason??'无法进行碰撞检查。'}`);
          if(checked.status!=='clear'){
            const reached=previous.progress+(at-previous.progress)*checked.fraction,safe=Array.from(checked.positions);
            inspect(prepared,animation,safe,reached,rest,areas);
            if(reached>previous.progress)keyframes.push({progress:reached,positions:safe});
            contactStop={progress:reached,reason:checked.reason??'已到达纸面接触位置，继续运动可能穿透。'};
            keyframes.push({progress:1,positions:[...keyframes.at(-1)!.positions]});
            options.onProgress?.(`纸面碰撞保护已在 ${(reached*100).toFixed(1)}% 处限制运动。`);
            break progression;
          }
        }
        inspect(prepared,animation,positions,at,rest,areas);keyframes.push({progress:at*foldEnd,positions});
      }
      if(i===1||i%8===0||i===steps)options.onProgress?.(`正在生成${bendable?'曲面':'数值'}折叠动画 · ${Math.round(progress*100)}%…`);
    }
  }finally{solver.dispose();}
  const pressed=destination&&safePress(prepared,keyframes.at(-1)!.positions,destination,rest,areas,materialLimits(animation));
  if(destination&&pressed){
    options.onProgress?.('正在收敛到本步目标姿态…');
    const before=keyframes.at(-1)!.positions;
    for(let i=1;i<=24;i++){
      const t=i/24,amount=t*t*(3-2*t),positions=Array.from(destination,(n,j)=>before[j]+(n-before[j])*amount);
      keyframes.push({progress:foldEnd+(1-foldEnd)*t,positions});
    }
  }else if(destination){
    // Retain numerical playback when the destination belongs to a distant
    // branch; its warning must continue to describe an approximate endpoint.
    for(const frame of keyframes)frame.progress/=foldEnd;
  }
  return validateSimulationStepDynamicMotion(prepared,animation,{version:1,method:'dynamic',keyframes,...(pressed?{settleStart:foldEnd}:{}),...(contactStop?{contactStop}:{})});
}

export function createSimulationStepDynamicEvaluator(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,value:SimulationStepDynamicMotion):{evaluate(progress:number):Float32Array}{
  const motion=validateSimulationStepDynamicMotion(prepared,animation,value),frames=motion.keyframes;
  return {evaluate(progress:number):Float32Array{
    if(!Number.isFinite(progress))throw Error('数值步骤动画进度无效。');
    const p=clamp(progress);let low=0,high=frames.length-1;
    while(low+1<high){const middle=(low+high)>>1;if(frames[middle].progress<=p)low=middle;else high=middle;}
    return interpolate(frames[low],frames[high],p);
  }};
}
