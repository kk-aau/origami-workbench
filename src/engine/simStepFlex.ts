import type {FoldProfile,PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import type {SimulationStepAnimation} from './simStepAnimation';

/** A playback-only material mesh. One means an unchanged rigid panel edge;
 * values below one are permitted only on uncreased F supports. */
export interface SimulationStepFlexRequest {version:1;bendingStiffness:number[]}
export interface SimulationStepFlexKeyframe {progress:number;positions:number[]}
export interface SimulationStepFlexBatch {start:number;end:number;edges:number[]}
export interface SimulationStepFlexMotion extends SimulationStepFlexRequest {
  method:'local-flex';
  /** The peak compression is shortened, never either saved endpoint. */
  foldLimit:number;
  keyframes:SimulationStepFlexKeyframe[];
  /** Each group makes its own outward-and-return excursion. */
  batches?:SimulationStepFlexBatch[];
  maxEdgeStrain:number;
  maxAreaStrain:number;
  /** Certified radians of error on actual geometry, not spring targets. */
  maxAngleError:number;
}
export interface SimulationStepFlexOptions {
  foldLimit?:number;
  /** Number of outward continuation steps; the return follows the same mesh. */
  steps?:number;
  maxIterations?:number;
  maxTimeMs?:number;
  /** For grouped instructions, prevent other groups' future soft corridors
   * from introducing unrelated near-zero bending modes in this solve. */
  localizeBending?:boolean;
  /** Candidate-only span fraction; it never widens the requested soft set. */
  bendingRadiusScale?:number;
}
export interface SimulationStepFlexEvaluator {
  keyframes:readonly SimulationStepFlexKeyframe[];
  initialPositions:Float32Array;
  initialAngles:number[];
  fixedVertices:number[];
  foldLimit:number;
  evaluate(progress:number):Float32Array;
  angles(progress:number):number[];
  profile(progress:number):FoldProfile;
  driver(angles:readonly number[]):Float32Array;
  motionBound(start:number,end:number):number[];
}
export interface SimulationStepFlexTipInspection {vertex:number;curved:boolean;offAxisHinges:number;maxOffAxisAngle:number;relaxedExtension:boolean}
export interface SimulationStepFlexCurvatureInspection {curved:boolean;offAxisHinges:number;maxOffAxisAngle:number;relaxedExtension:boolean;tips:SimulationStepFlexTipInspection[]}

type V=[number,number,number];
type Row={indices:number[];gradient:number[];value:number};
const point=(p:ArrayLike<number>,i:number):V=>[p[3*i],p[3*i+1],p[3*i+2]];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a:V,b:V):V=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(v:V,k:number):V=>[v[0]*k,v[1]*k,v[2]*k];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(v:V)=>Math.hypot(...v);
const unit=(v:V)=>mul(v,1/norm(v));
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const rad=Math.PI/180;
const circular=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
const edgeTolerance=2e-4,areaTolerance=8e-4,angleTolerance=.006;
// On slender triangles, near-equal edge lengths can still leave appreciable
// relative area error. A narrow dead zone avoids adding dependent area rows to
// an already well-conditioned metric solve; the final interval proof is strict.
const areaCorrectionThreshold=1e-4;
// A soft region is uncreased sheet material, rather than a weak seam on the
// support line. Similar positive bending costs let curvature spread over its
// neighbouring supports; least-squares weights are square roots of energy.
const panelBendingWeight=(stiffness:number)=>Math.sqrt(.25+.75*stiffness);
const unavailable=(detail='')=>Error(`局部柔性压痕尚未得到满足边长、面积和固定侧约束的连续曲面，未播放拉伸或断开的纸面。${detail}`);

function instructions(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,request:SimulationStepFlexRequest,foldLimit:number){
  if(request.version!==1||!Array.isArray(request.bendingStiffness)||request.bendingStiffness.length!==prepared.edgeCount||request.bendingStiffness.some((v,i)=>!Number.isFinite(v)||v<=0||v>1||v<1&&prepared.edgesAssignment[i]!=='F'))throw Error('局部柔性材料参数无效，已有折痕不能作为临时软边，抗弯刚度必须大于零。');
  if(!Number.isFinite(foldLimit)||foldLimit<=0||foldLimit>1)throw Error('局部压痕峰值比例无效。');
  const ranges=new Map(animation.ranges.map(r=>[r.edge,r]));
  if(ranges.size!==prepared.creaseParams.length||animation.initialPositions.length!==prepared.vertexCount*3||animation.initialPositions.some(v=>!Number.isFinite(v)))throw Error('局部柔性动画与材料网格不匹配。');
  const restModel=new OrigamiModel(prepared);
  prepared.edgesVertices.forEach(([a,b],e)=>{const actual=norm(sub(point(animation.initialPositions,b),point(animation.initialPositions,a))),rest=restModel.edgeRestLength(e);if(!Number.isFinite(actual)||Math.abs(actual/rest-1)>edgeTolerance)throw Error('局部柔性初态已存在材料拉伸，不能重定义纸张的面内尺寸。');});
  const from:number[]=[],peak:number[]=[],active:number[]=[];
  prepared.creaseParams.forEach((c,i)=>{
    const r=ranges.get(c.edge);if(!r||![r.fromAngle,r.toAngle,r.viaAngle??0].every(v=>Number.isFinite(v)&&Math.abs(v)<=180)||r.fromAngle!==r.toAngle)throw Error('局部柔性目前仅支持压痕后返回原姿态的预折动作。');
    from.push(r.fromAngle);peak.push(r.fromAngle+(r.viaAngle===undefined?0:(r.viaAngle-r.fromAngle)*foldLimit));
    if(peak[i]!==from[i]){if(request.bendingStiffness[c.edge]!==1)throw Error('需要压出的折痕必须保持独立铰链。');active.push(i);}
  });
  if(!active.length||!request.bendingStiffness.some(v=>v<1))throw Error('局部柔性动画缺少有限压痕或临时弯曲区域。');
  if(animation.fixedVertices.length<3||animation.fixedVertices.some(v=>!Number.isInteger(v)||v<0||v>=prepared.vertexCount))throw Error('局部柔性动画的固定侧无效。');
  return {from,peak,active};
}

function motionBatches(animation:SimulationStepAnimation,motion:SimulationStepFlexMotion):SimulationStepFlexBatch[]{
  const active=new Set(animation.ranges.filter(r=>r.viaAngle!==undefined&&r.viaAngle!==r.fromAngle).map(r=>r.edge)),seen=new Set<number>();
  const input=motion.batches??[{start:0,end:1,edges:[...active]}];
  if(!Array.isArray(input)||!input.length||input.length>64)throw Error('局部柔性压痕批次无效。');
  const customTiming=!!animation.timings?.length,timingByEdge=new Map(animation.timings?.map(t=>[t.edge,t]));
  const batches=input.map((batch,i)=>{
    if(!batch||!Number.isFinite(batch.start)||!Number.isFinite(batch.end)||batch.start<0||batch.end>1||batch.end-batch.start<1e-8||!customTiming&&(i===0&&batch.start!==0||i>0&&batch.start!==input[i-1].end)||!Array.isArray(batch.edges)||!batch.edges.length||batch.edges.length>active.size||new Set(batch.edges).size!==batch.edges.length||batch.edges.some(e=>!Number.isInteger(e)||!active.has(e)||seen.has(e)))throw Error('局部柔性压痕批次不连续或重复执行折痕。');
    if(customTiming&&batch.edges.some(edge=>{const timing=timingByEdge.get(edge);return batch.start!==(timing?.start??0)||batch.end!==(timing?.end??1);}))throw Error('局部柔性压痕未遵循指定的折痕启动时段。');
    batch.edges.forEach(e=>seen.add(e));return {start:batch.start,end:batch.end,edges:[...batch.edges]};
  });
  if(!customTiming&&batches.at(-1)!.end!==1||seen.size!==active.size)throw Error('局部柔性压痕批次未完整覆盖每条短折痕。');
  return batches;
}

function batchAmount(batch:SimulationStepFlexBatch|undefined,progress:number):number{
  if(!batch||progress<=batch.start||progress>=batch.end)return 0;
  const p=(progress-batch.start)/(batch.end-batch.start);return p<=.5?p*2:(1-p)*2;
}

/** Serialized profiles use the actual accepted peak and batch schedule. */
export function simulationStepFlexMotionAngles(animation:SimulationStepAnimation,motion:SimulationStepFlexMotion,progress:number):number[]{
  if(!Number.isFinite(progress))throw Error('局部柔性动画进度无效。');
  const batches=motionBatches(animation,motion),byEdge=new Map(batches.flatMap(b=>b.edges.map(e=>[e,b] as const))),p=clamp(progress);
  return animation.ranges.map(r=>r.fromAngle+((r.viaAngle??r.fromAngle)-r.fromAngle)*motion.foldLimit*batchAmount(byEdge.get(r.edge),p));
}

function geometry(prepared:PreparedOrigamiModel,positions:ArrayLike<number>){
  const normals=prepared.facesVertices.map(([a,b,c])=>unit(cross(sub(point(positions,b),point(positions,a)),sub(point(positions,c),point(positions,a)))));
  const angles=prepared.creaseParams.map(c=>{
    const [a,b]=prepared.edgesVertices[c.edge],axis=unit(sub(point(positions,b),point(positions,a))),n1=normals[c.face1],n2=normals[c.face2];
    return Math.atan2(dot(cross(n1,axis),n2),dot(n1,n2));
  });
  return {normals,angles};
}

/** A temporary full-line hinge is an initialization, not a curved partial
 * crease. Require genuine neighbouring bends and relaxation of its extension
 * before the analytic branch may be offered as a local-flex preview. */
export function inspectSimulationStepFlexCurvature(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,motion:SimulationStepFlexMotion):SimulationStepFlexCurvatureInspection {
  const batches=motionBatches(animation,motion),material=prepared.originalPositions,from=new Map(animation.ranges.map(r=>[r.edge,r.fromAngle*rad]));
  const materialPoints=Array.from({length:prepared.vertexCount},(_,v)=>point(material,v)),span=Math.max(...[0,1,2].map(k=>Math.max(...materialPoints.map(p=>p[k]))-Math.min(...materialPoints.map(p=>p[k])))),radius=span*.2,epsilon=span*1e-7,boundary=new Set(prepared.edgesVertices.flatMap((edge,e)=>prepared.edgesAssignment[e]==='B'?edge:[])),tips:SimulationStepFlexTipInspection[]=[];
  const segmentDistance=(p:V,a:V,b:V)=>{const d=sub(b,a),t=clamp(dot(sub(p,a),d)/dot(d,d));return norm(sub(p,add(a,mul(d,t))));};
  for(const batch of batches){
    const active=new Set(batch.edges),neighbors=new Map<number,number[]>(),frame=motion.keyframes.find(k=>Math.abs(k.progress-(batch.start+batch.end)/2)<1e-12)!;
    for(const edge of active){const [a,b]=prepared.edgesVertices[edge];neighbors.set(a,[...(neighbors.get(a)??[]),b]);neighbors.set(b,[...(neighbors.get(b)??[]),a]);}
    const actual=geometry(prepared,frame.positions),peak=Math.max(...animation.ranges.filter(r=>active.has(r.edge)).map(r=>Math.abs((r.viaAngle!-r.fromAngle)*motion.foldLimit*rad))),threshold=Math.min(.01,peak*.03);
    for(const [vertex,adjacent] of neighbors){
      if(adjacent.length!==1||boundary.has(vertex))continue;
      const origin=materialPoints[vertex],outward=unit(sub(origin,materialPoints[adjacent[0]]));let count=0,extension=false,maximum=0;
      prepared.creaseParams.forEach((c,i)=>{
        if(active.has(c.edge))return;
        const [a,b]=prepared.edgesVertices[c.edge],pa=materialPoints[a],pb=materialPoints[b];if(segmentDistance(origin,pa,pb)>radius+epsilon)return;
        const onAxis=[pa,pb].every(p=>norm(cross(sub(p,origin),outward))<epsilon),angle=Math.abs(circular(actual.angles[i]-from.get(c.edge)!));
        if(onAxis){if([pa,pb].every(p=>dot(sub(p,origin),outward)>=-epsilon)&&[pa,pb].some(p=>dot(sub(p,origin),outward)>epsilon)&&angle<peak*.9)extension=true;return;}
        if(motion.bendingStiffness[c.edge]===1)return;
        maximum=Math.max(maximum,angle);if(angle>threshold)count++;
      });
      if(!extension){
        // A cone deliberately omits the reverse ray. If its virtual
        // continuation lies strictly inside an actual material triangle,
        // both sides share that triangle's plane and its bend is exactly zero.
        const incident=prepared.edgesVertices.flatMap(([a,b])=>a===vertex?[norm(sub(materialPoints[b],origin))]:b===vertex?[norm(sub(materialPoints[a],origin))]:[]),distance=Math.min(radius*.05,...incident.map(v=>v*.1)),sample=add(origin,mul(outward,distance));
        extension=prepared.facesVertices.some(([a,b,c])=>{
          const pa=materialPoints[a],ab=sub(materialPoints[b],pa),ac=sub(materialPoints[c],pa),ap=sub(sample,pa),aa=dot(ab,ab),bb=dot(ac,ac),abac=dot(ab,ac),denominator=aa*bb-abac*abac;
          if(denominator<=0)return false;const u=(bb*dot(ap,ab)-abac*dot(ap,ac))/denominator,v=(aa*dot(ap,ac)-abac*dot(ap,ab))/denominator;
          return u>1e-8&&v>1e-8&&1-u-v>1e-8;
        });
      }
      tips.push({vertex,curved:count>=2&&extension,offAxisHinges:count,maxOffAxisAngle:maximum,relaxedExtension:extension});
    }
  }
  return {curved:tips.length>0&&tips.every(t=>t.curved),offAxisHinges:tips.reduce((sum,t)=>sum+t.offAxisHinges,0),maxOffAxisAngle:Math.max(0,...tips.map(t=>t.maxOffAxisAngle)),relaxedExtension:tips.length>0&&tips.every(t=>t.relaxedExtension),tips};
}

/** Sparse damped Gauss--Newton. Distance and preserved-hinge constraints stay
 * hard; only explicitly marked temporary F hinges receive a bending energy.
 * The solver is an offline candidate generator, never a success certificate. */
function solvePose(prepared:PreparedOrigamiModel,seed:Float64Array,previous:Float64Array,target:number[],stiffness:number[],fixed:Set<number>,rest:number[],areas:number[],maxIterations:number,deadline:number,correctAreas=false,continuityWeight=0,predicted?:Float64Array,warmGuide=false):Float64Array {
  let positions=predicted?.slice()??previous.slice(),damping=1e-5;
  const coordinate:number[]=Array.from({length:positions.length},(_,i)=>fixed.has(Math.floor(i/3))?-1:0);let count=0;
  for(let i=0;i<coordinate.length;i++)if(coordinate[i]===0)coordinate[i]=count++;
  const continuitySquared=continuityWeight*continuityWeight;
  const continuityEnergy=(p:Float64Array)=>{let sum=0;if(continuitySquared)for(let i=0;i<p.length;i++)if(coordinate[i]>=0)sum+=(p[i]-previous[i])**2*continuitySquared;return sum;};
  const rows=(p:Float64Array,softScale:number):Row[]=>{
    const result:Row[]=[],g=geometry(prepared,p);
    const row=(vertices:number[],gradients:V[],value:number,weight:number)=>{
      const indices:number[]=[],gradient:number[]=[];
      vertices.forEach((v,i)=>{for(let k=0;k<3;k++){const j=coordinate[v*3+k];if(j>=0){indices.push(j);gradient.push(gradients[i][k]*weight);}}});
      result.push({indices,gradient,value:value*weight});
    };
    prepared.edgesVertices.forEach(([a,b],i)=>{const d=sub(point(p,b),point(p,a)),length=norm(d);row([a,b],[mul(d,-1/length),mul(d,1/length)],length-rest[i],1/rest[i]);});
    if(correctAreas)prepared.facesVertices.forEach(([a,b,c],i)=>{
      const ab=sub(point(p,b),point(p,a)),ac=sub(point(p,c),point(p,a)),raw=cross(ab,ac),area=norm(raw),n=mul(raw,1/area),qb=cross(ac,n),qc=cross(n,ab),qa=mul(add(qb,qc),-1);
      const relative=area/areas[i]-1;if(Math.abs(relative)<=areaCorrectionThreshold)return;
      row([a,b,c],[qa,qb,qc],(relative-Math.sign(relative)*areaCorrectionThreshold)*areas[i],1/areas[i]);
    });
    prepared.creaseParams.forEach((c,i)=>{
      const [a,b]=prepared.edgesVertices[c.edge],pa=point(p,a),axis=sub(point(p,b),pa),length=norm(axis),u=mul(axis,1/length),d1=sub(point(p,c.vertex1),pa),d2=sub(point(p,c.vertex2),pa),n1=g.normals[c.face1],n2=g.normals[c.face2];
      const t1=dot(d1,u)/length,t2=dot(d2,u)/length,h1=norm(cross(d1,u)),h2=norm(cross(d2,u)),sign=Math.sign(dot(cross(n1,u),d1));
      const q1=mul(n1,sign/h1),q2=mul(n2,sign/h2),qa=mul(add(mul(q1,1-t1),mul(q2,1-t2)),-1),qb=mul(add(mul(q1,t1),mul(q2,t2)),-1);
      const soft=stiffness[c.edge]<1,weight=soft?softScale*panelBendingWeight(stiffness[c.edge]):1;
      row([c.vertex1,c.vertex2,a,b],[q1,q2,qa,qb],circular(g.angles[i]-target[i]),weight);
    });
    return result;
  };
  const energy=(rs:Row[])=>rs.reduce((sum,r)=>sum+r.value*r.value,0);
  const assess=(p:Float64Array,softScale:number)=>{
    const g=geometry(prepared,p);let value=0,hardMaximum=0;
    prepared.edgesVertices.forEach(([a,b],i)=>{const residual=(norm(sub(point(p,b),point(p,a)))-rest[i])/rest[i];value+=residual*residual;hardMaximum=Math.max(hardMaximum,Math.abs(residual));});
    if(correctAreas)prepared.facesVertices.forEach(([a,b,c],i)=>{const area=norm(cross(sub(point(p,b),point(p,a)),sub(point(p,c),point(p,a)))),residual=Math.max(0,Math.abs(area/areas[i]-1)-areaCorrectionThreshold);value+=residual*residual;hardMaximum=Math.max(hardMaximum,residual);});
    prepared.creaseParams.forEach((c,i)=>{const soft=stiffness[c.edge]<1,weight=soft?softScale*panelBendingWeight(stiffness[c.edge]):1,residual=circular(g.angles[i]-target[i]),weighted=residual*weight;value+=weighted*weighted;if(!soft)hardMaximum=Math.max(hardMaximum,Math.abs(residual));});
    return {value:value+continuityEnergy(p),hardMaximum};
  };
  const multiply=(rs:Row[],v:Float64Array,lambda:number)=>{
    const out=Float64Array.from(v,x=>x*lambda);
    for(const r of rs){let projection=0;for(let i=0;i<r.indices.length;i++)projection+=r.gradient[i]*v[r.indices[i]];for(let i=0;i<r.indices.length;i++)out[r.indices[i]]+=r.gradient[i]*projection;}
    return out;
  };
  for(let iteration=0;iteration<maxIterations;iteration++){
    if(performance.now()>deadline)throw Error('局部柔性求解超过预算，未把未收敛曲面作为成功动画。');
    const softScale=iteration<8 ? warmGuide ? .01 : .001 : .00001,rs=rows(positions,softScale),before=energy(rs)+continuityEnergy(positions),rhs=new Float64Array(count),diagonal=new Float64Array(count).fill(damping+continuitySquared);
    for(const r of rs)for(let i=0;i<r.indices.length;i++){const j=r.indices[i],v=r.gradient[i];rhs[j]-=v*r.value;diagonal[j]+=v*v;}
    if(continuitySquared)for(let i=0;i<positions.length;i++)if(coordinate[i]>=0)rhs[coordinate[i]]-=continuitySquared*(positions[i]-previous[i]);
    const delta=new Float64Array(count),residual=rhs.slice(),z=Float64Array.from(residual,(v,i)=>v/diagonal[i]);let direction=z.slice(),rz=residual.reduce((sum,v,i)=>sum+v*z[i],0);
    const rhsNorm=Math.hypot(...rhs);
    for(let cg=0;cg<Math.min(count,180)&&Math.sqrt(Math.max(0,rz))>1e-11;cg++){
      const product=multiply(rs,direction,damping+continuitySquared),denominator=direction.reduce((sum,v,i)=>sum+v*product[i],0);if(denominator<1e-30)break;
      const alpha=rz/denominator;
      for(let i=0;i<count;i++){delta[i]+=alpha*direction[i];residual[i]-=alpha*product[i];z[i]=residual[i]/diagonal[i];}
      const next=residual.reduce((sum,v,i)=>sum+v*z[i],0),beta=next/rz;
      for(let i=0;i<count;i++)direction[i]=z[i]+beta*direction[i];rz=next;
      if(Math.hypot(...residual)<Math.max(1e-12,rhsNorm*1e-5))break;
    }
    let accepted=false,hardMaximum=Infinity;
    for(const scale of [1,.5,.25,.125,.0625]){
      const candidate=positions.slice();for(let i=0;i<candidate.length;i++)if(coordinate[i]>=0)candidate[i]+=scale*delta[coordinate[i]];else candidate[i]=seed[i];
      const after=assess(candidate,softScale);
      if(Number.isFinite(after.value)&&after.value<before){positions=candidate;damping=Math.max(1e-10,damping*.5);accepted=true;hardMaximum=after.hardMaximum;break;}
    }
    if(!accepted){damping=Math.min(1e8,damping*10);if(damping>=1e8)break;}
    if(iteration>=8&&hardMaximum<(continuitySquared?2e-5:2e-6))break;
  }
  return positions;
}

/** Exact full-support fold used only to choose a stable continuation branch.
 * The continuation edges remain F material supports. Their bending energy is
 * subsequently relaxed; this seed is never accepted as a finished curve. */
function analyticSupportFoldSeed(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,seed:Float64Array,active:readonly number[]):(target:readonly number[])=>Float64Array {
  if(animation.ranges.some(r=>Math.abs(r.fromAngle)>1e-8))throw Error('局部柔性解析初值暂只支持展开纸面，已有立体折态请拆分动作。');
  const first=active[0],[a,b]=prepared.edgesVertices[prepared.creaseParams[first].edge],origin=point(seed,a),axis=unit(sub(point(seed,b),origin)),face=prepared.facesVertices[0],normal=unit(cross(sub(point(seed,face[1]),point(seed,face[0])),sub(point(seed,face[2]),point(seed,face[0])))),sides=Array.from({length:prepared.vertexCount},(_,v)=>dot(cross(axis,sub(point(seed,v),origin)),normal));
  const pinSides=animation.fixedVertices.map(v=>sides[v]),epsilon=1e-8;
  if(pinSides.some(v=>v>epsilon)&&pinSides.some(v=>v< -epsilon)||pinSides.every(v=>Math.abs(v)<=epsilon))throw Error('固定纸面横跨当前压痕支撑线，无法建立保持固定点的局部曲面初值。');
  const sign=pinSides.reduce((sum,v)=>sum+v,0)>0?1:-1,moving=sides.map(s=>s*sign< -epsilon);
  const rotate=(angle:number)=>{
    const result=seed.slice(),c=Math.cos(angle),s=Math.sin(angle);
    for(let v=0;v<prepared.vertexCount;v++)if(moving[v]){const p=sub(point(seed,v),origin),rotated=add(add(mul(p,c),mul(cross(axis,p),s)),mul(axis,dot(axis,p)*(1-c)));result.set(add(origin,rotated),v*3);}
    return result;
  };
  const probeAngle=Math.PI/180,probe=geometry(prepared,rotate(probeAngle)),directions=active.map(i=>probe.angles[i]/probeAngle);
  if(directions.some(v=>!Number.isFinite(v)||Math.abs(Math.abs(v)-1)>1e-5))throw Error('短痕网格未完整连接支撑线，无法建立解析初值。');
  return target=>{
    const angle=target[first]/directions[0];
    if(active.some((i,k)=>Math.abs(target[i]-angle*directions[k])>1e-6))throw Error('同组短痕的指定方向或角度不一致，请拆分压痕动作。');
    return rotate(angle);
  };
}

/** Remove numerical metric drift after a continuation correction. This only
 * generates a candidate: preserved hinges and whole-interval geometry must
 * still pass the independent verifier, including any old mountain/valley. */
function projectMaterialMetric(prepared:PreparedOrigamiModel,positions:Float64Array,rest:number[],areas:number[],fixed:Set<number>):Float64Array {
  const result=positions.slice();
  for(let iteration=0;iteration<48;iteration++){
    let maximum=0;
    for(let k=0;k<prepared.edgeCount;k++){
      const e=iteration%2?k:prepared.edgeCount-1-k,[a,b]=prepared.edgesVertices[e],d=sub(point(result,b),point(result,a)),length=norm(d),error=length-rest[e],wa=fixed.has(a)?0:1,wb=fixed.has(b)?0:1;
      maximum=Math.max(maximum,Math.abs(error/rest[e]));if(!wa&&!wb)continue;
      const correction=error/length/(wa+wb)*.9;
      for(let j=0;j<3;j++){result[a*3+j]+=wa*correction*d[j];result[b*3+j]-=wb*correction*d[j];}
    }
    for(let f=0;f<prepared.faceCount;f++){
      const [a,b,c]=prepared.facesVertices[f],ab=sub(point(result,b),point(result,a)),ac=sub(point(result,c),point(result,a)),raw=cross(ab,ac),area=norm(raw),error=area-areas[f];
      if(Math.abs(error/areas[f])<=areaTolerance*.2)continue;
      const n=mul(raw,1/area),gb=cross(ac,n),gc=cross(n,ab),ga=mul(add(gb,gc),-1),vertices=[a,b,c],gradients=[ga,gb,gc],denominator=vertices.reduce((sum,v,i)=>sum+(fixed.has(v)?0:dot(gradients[i],gradients[i])),0);
      if(denominator<=1e-24)continue;
      vertices.forEach((v,i)=>{if(!fixed.has(v))for(let j=0;j<3;j++)result[v*3+j]-=error/denominator*gradients[i][j]*.5;});
    }
    if(maximum<edgeTolerance*.15)break;
  }
  return result;
}

function polynomialValue(coefficients:number[],t:number):number {return coefficients.reduceRight((v,c)=>v*t+c,0);}
function rootsInUnit(coefficients:number[]):number[]{
  const magnitude=Math.max(...coefficients.map(Math.abs));if(magnitude===0)return [];
  const c=coefficients.map(v=>v/magnitude);while(c.length>1&&Math.abs(c.at(-1)!)<1e-15)c.pop();
  if(c.length<=1)return [];
  if(c.length===2){const t=-c[0]/c[1];return t>0&&t<1?[t]:[];}
  const derivative=c.slice(1).map((v,i)=>v*(i+1)),cuts=[0,...rootsInUnit(derivative),1],roots:number[]=[];
  for(let i=0;i<cuts.length-1;i++){
    let a=cuts[i],b=cuts[i+1],fa=polynomialValue(c,a),fb=polynomialValue(c,b);
    if(Math.abs(fa)<1e-14&&a>0)roots.push(a);
    if(fa*fb>=0)continue;
    for(let k=0;k<55;k++){const mid=(a+b)/2,f=polynomialValue(c,mid);if(f*fa>0){a=mid;fa=f;}else{b=mid;fb=f;}}
    roots.push((a+b)/2);
  }
  return roots;
}
function extrema(coefficients:number[]):{min:number;max:number}{
  const ts=[0,1,...rootsInUnit(coefficients.slice(1).map((v,i)=>v*(i+1)))],values=ts.map(t=>polynomialValue(coefficients,t));
  return {min:Math.min(...values),max:Math.max(...values)};
}
function facePolynomial(a:ArrayLike<number>,b:ArrayLike<number>,face:number[]):V[]{
  const [i,j,k]=face,e1=sub(point(a,j),point(a,i)),e2=sub(point(a,k),point(a,i)),d1=sub(sub(point(b,j),point(b,i)),e1),d2=sub(sub(point(b,k),point(b,i)),e2);
  return [cross(e1,e2),add(cross(e1,d2),cross(d1,e2)),cross(d1,d2)];
}
function squaredPolynomial([a,b,c]:V[]):number[]{return [dot(a,a),2*dot(a,b),dot(b,b)+2*dot(a,c),2*dot(b,c),dot(c,c)];}
function interpolation(a:ArrayLike<number>,b:ArrayLike<number>,t:number):Float32Array{return Float32Array.from(a,(v,i)=>v+(b[i]-v)*t);}
function interpolation64(a:ArrayLike<number>,b:ArrayLike<number>,t:number):Float64Array{return Float64Array.from(a,(v,i)=>v+(b[i]-v)*t);}

/** A complete-interval preserved-hinge certificate. Raw triangle normals are
 * quadratic polynomials. Their norm extrema bound the first and second
 * derivatives of unit normals. Since the two unit normals are perpendicular
 * to their common unit edge, atan2(x,y) lies on the unit circle and its second
 * derivative is x*y''-y*x''. The linear interpolation error is at most M/8.
 * Subdivision here tightens a proof; it never modifies playback geometry. */
interface HingeCertificateBudget {remaining:number;deadline:number}
function certifyHingeInterval(prepared:PreparedOrigamiModel,a:ArrayLike<number>,b:ArrayLike<number>,from:number[],to:number[],stiffness:number[],budget:HingeCertificateBudget,depth=0):number {
  budget.remaining-=prepared.faceCount+2*prepared.creaseParams.length;
  if(budget.remaining<0||performance.now()>budget.deadline)throw Error('局部柔性折角连续验证超过计算预算，未加载未经完整验证的动画。');
  const ga=geometry(prepared,a),gb=geometry(prepared,b);
  const rates=prepared.facesVertices.map(face=>{
    const polynomial=facePolynomial(a,b,face),minimum=Math.sqrt(Math.max(0,extrema(squaredPolynomial(polynomial)).min)),first=norm(polynomial[1])+2*norm(polynomial[2]),second=2*norm(polynomial[2]);
    return {first:first/minimum,second:2*second/minimum+5*(first/minimum)**2};
  });
  let maximum=0,needsSubdivision=false;
  prepared.creaseParams.forEach((c,i)=>{
    if(stiffness[c.edge]<1)return;
    const [v,w]=prepared.edgesVertices[c.edge],edge=sub(point(a,w),point(a,v)),delta=sub(sub(point(b,w),point(b,v)),edge),minimum=Math.sqrt(Math.max(0,extrema([dot(edge,edge),2*dot(edge,delta),dot(delta,delta)]).min)),axisRate=norm(delta)/minimum,axisSecond=5*axisRate**2,n1=rates[c.face1],n2=rates[c.face2];
    const curvature=2*(n1.second+n2.second)+axisSecond+4*n1.first*n2.first+2*axisRate*(n1.first+n2.first),velocity=2*(n1.first+n2.first)+axisRate;
    const endpoints=Math.max(Math.abs(circular(ga.angles[i]-from[i])),Math.abs(circular(gb.angles[i]-to[i]))),bound=endpoints+curvature/8;
    if(!Number.isFinite(bound)||endpoints>angleTolerance)throw unavailable('指定折痕未达到真实压痕角度。');
    if(bound>angleTolerance||velocity>=Math.PI)needsSubdivision=true;
    maximum=Math.max(maximum,bound);
  });
  if(!needsSubdivision)return maximum;
  if(depth>=10)throw unavailable('无法证明关键帧之间的折角连续满足要求。');
  const middle=interpolation64(a,b,.5),angles=from.map((v,i)=>(v+to[i])/2);
  return Math.max(certifyHingeInterval(prepared,a,middle,from,angles,stiffness,budget,depth+1),certifyHingeInterval(prepared,middle,b,angles,to,stiffness,budget,depth+1));
}

/** Recompute all geometric evidence. Linear interpolation permits exact
 * extrema of edge length and triangle area over every complete interval.
 * Stored residuals and successful solver exits are deliberately ignored. */
export function validateSimulationStepFlexMotion(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,value:unknown):SimulationStepFlexMotion {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('局部柔性运动路径无效。');
  const raw=value as SimulationStepFlexMotion;
  if(raw.method!=='local-flex'||!Array.isArray(raw.keyframes)||raw.keyframes.length<3||raw.keyframes.length>4097||raw.keyframes.length*prepared.vertexCount*3>3_000_000)throw Error('局部柔性运动关键帧无效或超过内存预算。');
  const expected=instructions(prepared,animation,raw,raw.foldLimit),batches=motionBatches(animation,raw),byEdge=new Map(batches.flatMap(b=>b.edges.map(e=>[e,b] as const))),seed=Float32Array.from(animation.initialPositions),fixed=new Set(animation.fixedVertices);
  const targets=(progress:number)=>prepared.creaseParams.map((c,i)=>(expected.from[i]+(expected.peak[i]-expected.from[i])*batchAmount(byEdge.get(c.edge),progress))*rad);
  const rest=prepared.edgesVertices.map(([a,b])=>norm(sub(point(seed,b),point(seed,a)))),areas=prepared.facesVertices.map(f=>norm(facePolynomial(seed,seed,f)[0]));
  if(rest.some(v=>!Number.isFinite(v)||v<=1e-10)||areas.some(v=>!Number.isFinite(v)||v<=1e-12))throw Error('局部柔性初态包含退化纸面。');
  const keyframes:SimulationStepFlexKeyframe[]=raw.keyframes.map((frame,i)=>{
    if(!frame||typeof frame!=='object'||!Number.isFinite(frame.progress)||frame.progress<0||frame.progress>1||i>0&&frame.progress<=raw.keyframes[i-1].progress||!Array.isArray(frame.positions)||frame.positions.length!==seed.length||frame.positions.some(v=>!Number.isFinite(v)||Math.abs(v)>1e4))throw Error('局部柔性运动关键帧坐标无效。');
    const positions=Array.from(Float32Array.from(frame.positions));
    for(const v of fixed)for(let k=0;k<3;k++)if(positions[v*3+k]!==seed[v*3+k])throw Error('局部柔性运动移动了固定侧。');
    return {progress:frame.progress,positions};
  });
  if(keyframes[0].progress!==0||keyframes.at(-1)!.progress!==1||keyframes[0].positions.some((v,i)=>v!==seed[i])||keyframes.at(-1)!.positions.some((v,i)=>v!==seed[i]))throw Error('局部柔性运动必须精确返回原纸面姿态。');
  for(const batch of batches){
    for(const p of [batch.start,(batch.start+batch.end)/2,batch.end])if(!keyframes.some(k=>Math.abs(k.progress-p)<1e-12))throw Error('局部柔性压痕关键帧缺少批次起点、峰值或终点。');
    // Explicit windows may overlap: another short crease can still be active
    // at this batch's boundary. Its material geometry is checked below instead.
    if(!animation.timings?.length)for(const p of [batch.start,batch.end])if(keyframes.find(k=>Math.abs(k.progress-p)<1e-12)!.positions.some((v,i)=>v!==seed[i]))throw Error('局部柔性压痕批次之间必须精确展平至原姿态。');
  }
  let maxEdgeStrain=0,maxAreaStrain=0,maxAngleError=0;
  const hingeBudget:HingeCertificateBudget={remaining:2_000_000,deadline:Infinity};
  for(let n=0;n<keyframes.length;n++){
    const frame=keyframes[n],g=geometry(prepared,frame.positions),target=targets(frame.progress);
    prepared.creaseParams.forEach((c,i)=>{
      if(raw.bendingStiffness[c.edge]<1)return;
      const error=Math.abs(circular(g.angles[i]-target[i]));
      if(!Number.isFinite(error)||error>angleTolerance)throw unavailable();maxAngleError=Math.max(maxAngleError,error);
    });
    if(n===0)continue;
    const a=keyframes[n-1].positions,b=frame.positions;
    prepared.edgesVertices.forEach(([v,w],e)=>{
      const x=sub(point(a,w),point(a,v)),d=sub(sub(point(b,w),point(b,v)),x),bounds=extrema([dot(x,x),2*dot(x,d),dot(d,d)]),strain=Math.max(Math.abs(Math.sqrt(Math.max(0,bounds.min))/rest[e]-1),Math.abs(Math.sqrt(Math.max(0,bounds.max))/rest[e]-1));
      if(!Number.isFinite(strain)||strain>edgeTolerance)throw unavailable(`区间 ${keyframes[n-1].progress.toFixed(4)}–${frame.progress.toFixed(4)} 的边长误差 ${(strain*100).toFixed(4)}%。`);maxEdgeStrain=Math.max(maxEdgeStrain,strain);
    });
    prepared.facesVertices.forEach((face,f)=>{
      const bounds=extrema(squaredPolynomial(facePolynomial(a,b,face))),strain=Math.max(Math.abs(Math.sqrt(Math.max(0,bounds.min))/areas[f]-1),Math.abs(Math.sqrt(Math.max(0,bounds.max))/areas[f]-1));
      if(!Number.isFinite(strain)||strain>areaTolerance)throw unavailable();maxAreaStrain=Math.max(maxAreaStrain,strain);
    });
    const previous=keyframes[n-1].progress;
    maxAngleError=Math.max(maxAngleError,certifyHingeInterval(prepared,a,b,targets(previous),target,raw.bendingStiffness,hingeBudget));
  }
  return {version:1,method:'local-flex',foldLimit:raw.foldLimit,bendingStiffness:[...raw.bendingStiffness],keyframes,...raw.batches?{batches}:{},maxEdgeStrain,maxAreaStrain,maxAngleError};
}

export function planSimulationStepFlex(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,request:SimulationStepFlexRequest,options:SimulationStepFlexOptions={}):SimulationStepFlexMotion {
  const foldLimit=options.foldLimit??1,expected=instructions(prepared,animation,request,foldLimit),steps=Math.max(8,Math.min(256,Math.round(options.steps??64))),maxIterations=options.maxIterations??80,deadline=performance.now()+(options.maxTimeMs??Infinity);
  if(prepared.vertexCount>1200||prepared.faceCount>2400)throw Error('局部柔性动画网格超过 CPU 求解预算。');
  let solverStiffness=request.bendingStiffness;
  if(options.localizeBending){
    const material=prepared.originalPositions,points=Array.from({length:prepared.vertexCount},(_,v)=>point(material,v)),span=Math.max(...[0,1,2].map(k=>Math.max(...points.map(p=>p[k]))-Math.min(...points.map(p=>p[k])))),edges=expected.active.map(i=>prepared.edgesVertices[prepared.creaseParams[i].edge]),vertices=[...new Set(edges.flat())],length=Math.max(...vertices.flatMap(a=>vertices.map(b=>norm(sub(points[a],points[b]))))),radius=Math.max(span*(options.bendingRadiusScale??.2),length*.45),minimum=Math.min(...request.bendingStiffness);
    solverStiffness=request.bendingStiffness.map((value,e)=>{
      if(value===1)return 1;const [a,b]=prepared.edgesVertices[e],mid=mul(add(points[a],points[b]),.5),perpendicular=Math.min(...edges.map(([v,w])=>{const axis=sub(points[w],points[v]);return norm(cross(sub(mid,points[v]),axis))/norm(axis);})),t=Math.min(1,perpendicular/radius),smooth=t*t*(3-2*t);
      return Math.max(value,minimum+(1-minimum)*smooth);
    });
  }
  const seed=Float64Array.from(Float32Array.from(animation.initialPositions)),rest=prepared.edgesVertices.map(([a,b])=>norm(sub(point(seed,b),point(seed,a)))),fixed=new Set(animation.fixedVertices),outward:SimulationStepFlexKeyframe[]=[{progress:0,positions:Array.from(seed)}];
  const analyticSeed=options.localizeBending?analyticSupportFoldSeed(prepared,animation,seed,expected.active):null;
  let previous:Float64Array=seed,previousProgress=0;
  const areas=prepared.facesVertices.map(f=>norm(facePolynomial(seed,seed,f)[0]));
  const intervalFits=(a:ArrayLike<number>,b:ArrayLike<number>)=>{
    for(let e=0;e<prepared.edgeCount;e++){
      const [v,w]=prepared.edgesVertices[e],x=sub(point(a,w),point(a,v)),d=sub(sub(point(b,w),point(b,v)),x),bounds=extrema([dot(x,x),2*dot(x,d),dot(d,d)]);
      if(Math.max(Math.abs(Math.sqrt(Math.max(0,bounds.min))/rest[e]-1),Math.abs(Math.sqrt(Math.max(0,bounds.max))/rest[e]-1))>edgeTolerance*.98)return false;
    }
    for(let f=0;f<prepared.faceCount;f++){
      const bounds=extrema(squaredPolynomial(facePolynomial(a,b,prepared.facesVertices[f])));
      if(Math.max(Math.abs(Math.sqrt(Math.max(0,bounds.min))/areas[f]-1),Math.abs(Math.sqrt(Math.max(0,bounds.max))/areas[f]-1))>areaTolerance*.98)return false;
    }
    return true;
  };
  const advance=(progress:number,depth=0)=>{
    if(outward.length>=512)throw Error('局部柔性运动需要过多关键帧，未播放不满足材料误差界的曲面。');
    const target=expected.from.map((a,i)=>(a+(expected.peak[i]-a)*progress*2)*rad);
    let solved:Float64Array;
    try{
      const angleIncrement=Math.max(...expected.from.map((a,i)=>Math.abs(expected.peak[i]-a)))*(progress-previousProgress)*2*rad,continuityWeight=options.localizeBending ? .0005/Math.max(.001,angleIncrement) : 0;
      let predicted:Float64Array|undefined;
      if(options.localizeBending&&outward.length>1){const earlier=outward[outward.length-2],ratio=Math.min(2,(progress-previousProgress)/(previousProgress-earlier.progress));predicted=Float64Array.from(previous,(v,i)=>fixed.has(Math.floor(i/3))?seed[i]:v+(v-earlier.positions[i])*ratio);}else if(analyticSeed)predicted=analyticSeed(target);
      solved=solvePose(prepared,seed,previous,target,solverStiffness,fixed,rest,areas,maxIterations,deadline,false,continuityWeight,predicted,!!analyticSeed&&outward.length===1);
      const areaError=Math.max(...prepared.facesVertices.map((f,i)=>Math.abs(norm(facePolynomial(solved,solved,f)[0])/areas[i]-1)));
      if(areaError>areaTolerance*.4)solved=solvePose(prepared,seed,solved,target,solverStiffness,fixed,rest,areas,Math.min(32,maxIterations),deadline,true,continuityWeight);
      if(options.localizeBending){const drift=Math.max(...prepared.edgesVertices.map(([a,b],e)=>Math.abs(norm(sub(point(solved,b),point(solved,a)))/rest[e]-1)));if(drift>edgeTolerance*.25)solved=projectMaterialMetric(prepared,solved,rest,areas,fixed);}
    }catch(error){throw Object.assign(error instanceof Error?error:Error(String(error)),{progress,previousProgress,frames:outward.length});}
    const candidate=Float64Array.from(Float32Array.from(solved));
    if(!intervalFits(previous,candidate)){
      if(depth>=9){
        const maxCandidateEdgeStrain=Math.max(...prepared.edgesVertices.map(([a,b],e)=>Math.abs(norm(sub(point(candidate,b),point(candidate,a)))/rest[e]-1))),maxCandidateAreaStrain=Math.max(...prepared.facesVertices.map((f,i)=>Math.abs(norm(facePolynomial(candidate,candidate,f)[0])/areas[i]-1))),maxDisplacement=Math.max(...Array.from({length:prepared.vertexCount},(_,v)=>norm(sub(point(candidate,v),point(previous,v))))),g=geometry(prepared,candidate),maxCandidateAngleError=Math.max(...prepared.creaseParams.map((c,i)=>request.bendingStiffness[c.edge]===1?Math.abs(circular(g.angles[i]-target[i])):0));
        throw Object.assign(unavailable('局部曲面无法在当前误差界内平滑延续。'),{progress,previousProgress,frames:outward.length,maxCandidateEdgeStrain,maxCandidateAreaStrain,maxCandidateAngleError,maxDisplacement});
      }
      advance((previousProgress+progress)/2,depth+1);advance(progress,depth+1);return;
    }
    previous=candidate;previousProgress=progress;
    outward.push({progress,positions:Array.from(candidate)});
  };
  for(let s=1;s<=steps;s++)advance(s/(steps*2));
  const keyframes=[...outward,...outward.slice(0,-1).reverse().map(k=>({progress:1-k.progress,positions:[...k.positions]}))];
  const motion=validateSimulationStepFlexMotion(prepared,animation,{...request,method:'local-flex',foldLimit,keyframes,maxEdgeStrain:0,maxAreaStrain:0,maxAngleError:0});
  if(options.localizeBending&&!inspectSimulationStepFlexCurvature(prepared,animation,motion).curved)throw Error('本步仅形成整条支撑线折叠，尚未得到短痕端点附近的真实曲面过渡，未作为局部柔性动画播放。');
  return motion;
}

export function createSimulationStepFlexEvaluator(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,value:SimulationStepFlexMotion):SimulationStepFlexEvaluator {
  const motion=validateSimulationStepFlexMotion(prepared,animation,value),expected=instructions(prepared,animation,motion,motion.foldLimit),batches=motionBatches(animation,motion),byEdge=new Map(batches.flatMap(b=>b.edges.map(e=>[e,b] as const))),keyframes=motion.keyframes;
  const angles=(progress:number)=>{if(!Number.isFinite(progress))throw Error('局部柔性动画进度无效。');const p=clamp(progress);return prepared.creaseParams.map((c,i)=>expected.from[i]+(expected.peak[i]-expected.from[i])*batchAmount(byEdge.get(c.edge),p));};
  const seed=keyframes[0].positions,rest=prepared.edgesVertices.map(([a,b])=>norm(sub(point(seed,b),point(seed,a)))),areas=prepared.facesVertices.map(f=>norm(facePolynomial(seed,seed,f)[0]));
  const evaluate=(progress:number):Float32Array=>{
    if(!Number.isFinite(progress))throw Error('局部柔性动画进度无效。');
    const p=clamp(progress),i=keyframes.findIndex(k=>k.progress>=p),b=keyframes[Math.max(0,i)],a=keyframes[Math.max(0,i-1)];
    const positions=a===b||p===b.progress?Float32Array.from(b.positions):interpolation(a.positions,b.positions,(p-a.progress)/(b.progress-a.progress));
    const g=geometry(prepared,positions),target=angles(p);
    prepared.edgesVertices.forEach(([a,b],e)=>{const strain=Math.abs(norm(sub(point(positions,b),point(positions,a)))/rest[e]-1);if(!Number.isFinite(strain)||strain>edgeTolerance)throw unavailable('当前进度的材料边长超过误差界。');});
    prepared.facesVertices.forEach((face,f)=>{const strain=Math.abs(norm(facePolynomial(positions,positions,face)[0])/areas[f]-1);if(!Number.isFinite(strain)||strain>areaTolerance)throw unavailable('当前进度的纸面面积超过误差界。');});
    prepared.creaseParams.forEach((c,i)=>{if(motion.bendingStiffness[c.edge]<1)return;const error=Math.abs(circular(g.angles[i]-target[i]*rad));if(!Number.isFinite(error)||error>angleTolerance)throw unavailable();});
    return positions;
  };
  return {keyframes:keyframes.map(k=>({progress:k.progress,positions:[...k.positions]})),initialPositions:evaluate(0),initialAngles:[...expected.from],fixedVertices:[...animation.fixedVertices],foldLimit:motion.foldLimit,evaluate,angles,
    profile(progress){const a=angles(progress);return {ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:a[i],toAngle:a[i]}))};},
    driver(a){
      if(a.length!==expected.from.length||Array.from(a).some(v=>!Number.isFinite(v)))throw Error('局部柔性动画折角无效。');
      if(a.every((v,i)=>Math.abs(v-expected.from[i])<1e-10))return evaluate(0);
      const active=expected.active.find(i=>Math.abs(a[i]-expected.from[i])>1e-10)!;
      const batch=byEdge.get(prepared.creaseParams[active].edge)!,u=(a[active]-expected.from[active])/(expected.peak[active]-expected.from[active]);
      if(u<-.000001||u>1.000001)throw Error('局部柔性动画折角偏离已验证路径。');
      const distance=(batch.end-batch.start)*clamp(u)*.5;
      for(const progress of [batch.start+distance,batch.end-distance]){
        const target=angles(progress);if(a.every((v,i)=>Math.abs(v-target[i])<=1e-5))return evaluate(progress);
      }
      throw Error('局部柔性动画折角偏离已验证路径。');
    },
    motionBound(start,end){
      if(!Number.isFinite(start)||!Number.isFinite(end))throw Error('局部柔性动画区间无效。');
      const lo=clamp(Math.min(start,end)),hi=clamp(Math.max(start,end)),center=evaluate((lo+hi)/2),poses=[evaluate(lo),evaluate(hi),...keyframes.filter(k=>k.progress>lo&&k.progress<hi).map(k=>k.positions)];
      return Array.from({length:prepared.vertexCount},(_,v)=>Math.max(...poses.map(p=>norm(sub(point(p,v),point(center,v))))));
    }};
}

/** Compose independent press-and-return groups on the same material mesh.
 * Every group is revalidated with only its own crease instructions enabled;
 * batch boundaries retain the exact common saved pose. */
export function combineSimulationStepFlexMotions(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,parts:readonly {motion:SimulationStepFlexMotion;edges:readonly number[]}[]):SimulationStepFlexMotion {
  if(!parts.length||parts.length>32)throw Error('局部柔性压痕分组数量无效。');
  const first=parts[0].motion,keyframes:SimulationStepFlexKeyframe[]=[],batches:SimulationStepFlexBatch[]=[];
  parts.forEach((part,i)=>{
    if(part.motion.foldLimit!==first.foldLimit||part.motion.bendingStiffness.length!==first.bendingStiffness.length||part.motion.bendingStiffness.some((v,e)=>v!==first.bendingStiffness[e]))throw Error('局部柔性压痕各批次的材料参数或峰值比例不一致。');
    const edges=new Set(part.edges),subAnimation={...animation,ranges:animation.ranges.map(r=>{const {viaAngle,...base}=r;return edges.has(r.edge)?{...base,...viaAngle===undefined?{}:{viaAngle}}:base;})};
    const motion=validateSimulationStepFlexMotion(prepared,subAnimation,part.motion),start=i/parts.length,end=(i+1)/parts.length;
    if(motion.batches&&motion.batches.length!==1)throw Error('局部柔性压痕只允许合并完整的独立单批次。');
    batches.push({start,end,edges:[...part.edges]});
    motion.keyframes.forEach((frame,n)=>{if(i>0&&n===0)return;keyframes.push({progress:start+(end-start)*frame.progress,positions:[...frame.positions]});});
  });
  return validateSimulationStepFlexMotion(prepared,animation,{...first,keyframes,batches});
}
