import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';

export type SimulationStepRigidVector=[number,number,number];
/** Row-major rotation and translation, both applied to the immutable seed. */
export interface SimulationStepRigidTransform {rotation:number[];translation:SimulationStepRigidVector}
export interface SimulationStepRigidComponent {
  faces:number[];
  vertices:number[];
  parent:number|null;
  /** Index in prepared.creaseParams, not an edge or CP-face index. */
  parentCrease:number|null;
  rotationSign:1|-1;
  /** Ancestor crease indices in root-to-leaf order, including parentCrease. */
  path:number[];
}
export interface SimulationStepRigidJoint {crease:number;a:number;b:number;tree:boolean}
export interface SimulationStepRigidEvaluation {
  /** Root-first ownership of shared material vertices. Never average a seam. */
  positions:Float64Array;
  transforms:SimulationStepRigidTransform[];
  /** Shared-vertex and pin differences, followed by length-scaled angular errors.
   * The vector keeps the same order and length for every candidate. */
  residuals:Float64Array;
  maxResidual:number;
  maxPositionResidual:number;
  /** Circular angular error in radians, before the residual length scale. */
  maxAngleResidual:number;
}
export interface SimulationStepRigidMechanism {
  components:SimulationStepRigidComponent[];
  joints:SimulationStepRigidJoint[];
  /** Simulation triangle -> rigid component. */
  triangleBodies:number[];
  /** Root-first owner used by evaluateAngles for every material vertex. */
  vertexBodies:number[];
  activeCreases:number[];
  root:number;
  seedPositions:Float64Array;
  fromAngles:number[];
  evaluateAngles(angles:readonly number[]):SimulationStepRigidEvaluation;
  /** Re-evaluates and verifies seams, all pins, every material edge, and the
   * actual dihedral of every hinge. A small optimiser residual is not proof. */
  validatePose(angles:readonly number[],evaluation?:SimulationStepRigidEvaluation):Float32Array;
  /** Per-body displacement bound from the first endpoint for any motion whose
   * individual angles remain in their endpoint intervals. Includes excursions
   * between equal endpoint poses; this is not an endpoint-distance estimate. */
  displacementBounds(fromAngles:readonly number[],toAngles:readonly number[]):number[];
}

type V=SimulationStepRigidVector;
type T=SimulationStepRigidTransform;
const add=(a:V,b:V):V=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scale=(a:V,s:number):V=>[a[0]*s,a[1]*s,a[2]*s];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const size=(v:V)=>Math.hypot(...v);
const unit=(v:V)=>scale(v,1/size(v));
const point=(p:ArrayLike<number>,i:number):V=>[p[i*3],p[i*3+1],p[i*3+2]];
const rotate=(r:number[],p:V):V=>[dot(r.slice(0,3) as V,p),dot(r.slice(3,6) as V,p),dot(r.slice(6,9) as V,p)];
const apply=(t:T,p:V)=>add(rotate(t.rotation,p),t.translation);
const identity=():T=>({rotation:[1,0,0,0,1,0,0,0,1],translation:[0,0,0]});
function around(parent:T,a:V,b:V,degrees:number):T {
  const angle=degrees*Math.PI/180,halfTurns=degrees/180,exactHalfTurn=Number.isInteger(halfTurns);
  // Exact instruction endpoints are integer half turns. Math.sin(Math.PI)
  // leaves a ~1e-16 out-of-plane displacement, much larger than the Float32
  // rounding uncertainty of an otherwise zero height. Preserve the exact
  // trigonometric value instead of manufacturing a false crossing at contact.
  // This equality has no tolerance: near-folded poses retain their real depth.
  const [x,y,z]=unit(sub(b,a)),c=exactHalfTurn?(halfTurns%2===0?1:-1):Math.cos(angle),s=exactHalfTurn?0:Math.sin(angle),k=1-c;
  const q=[c+x*x*k,x*y*k-z*s,x*z*k+y*s,y*x*k+z*s,c+y*y*k,y*z*k-x*s,z*x*k-y*s,z*y*k+x*s,c+z*z*k];
  const r=Array.from({length:9},(_,i)=>{const row=Math.floor(i/3),col=i%3;return q[row*3]*parent.rotation[col]+q[row*3+1]*parent.rotation[col+3]+q[row*3+2]*parent.rotation[col+6];});
  return {rotation:r,translation:add(rotate(q,sub(parent.translation,a)),a)};
}
const moving=(r:SimulationStepAnimation['ranges'][number])=>Math.abs(r.fromAngle-r.toAngle)>1e-8||r.viaAngle!==undefined&&(Math.abs(r.viaAngle-r.fromAngle)>1e-8||Math.abs(r.viaAngle-r.toAngle)>1e-8);
const positionTolerance=2e-5,angleTolerance=1e-4;
const circular=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));

/** Compile unchanged folds into rigid assemblies. Candidate evaluation deliberately
 * permits a loop to be open so a continuation solver can close it. It never
 * deforms a triangle to hide that error: each assembly has one seed-to-pose rigid
 * transform, and every competing shared-vertex proposal becomes a residual. */
export function compileSimulationStepRigidMechanism(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation):SimulationStepRigidMechanism {
  const seed=Float64Array.from(animation.initialPositions),fixed=[...animation.fixedVertices];
  if(seed.length!==prepared.vertexCount*3||seed.some(v=>!Number.isFinite(v)))throw Error('步骤动画的初始纸面坐标无效。');
  const parent=prepared.facesVertices.map((_,i)=>i);
  const find=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=(a:number,b:number)=>{parent[find(b)]=find(a);};
  const ranges=new Map(animation.ranges.map(r=>[r.edge,{...r}]));
  const active=new Set(animation.ranges.filter(moving).map(r=>r.edge));
  prepared.edgesFaces.forEach((faces,e)=>{
    if(faces.length!==2)return;
    if(!ranges.has(e))throw Error('步骤动画包含未确定折角的材料铰链，无法保持纸面刚性。');
    if(!active.has(e))join(faces[0],faces[1]);
  });
  const ids=new Map<number,number>(),triangleBodies=parent.map((_,f)=>{const root=find(f);if(!ids.has(root))ids.set(root,ids.size);return ids.get(root)!;});
  const vertexSets=Array.from({length:ids.size},()=>new Set<number>()),faceSets=Array.from({length:ids.size},()=>[] as number[]);
  prepared.facesVertices.forEach((face,f)=>{faceSets[triangleBodies[f]].push(f);face.forEach(v=>vertexSets[triangleBodies[f]].add(v));});
  const components:SimulationStepRigidComponent[]=vertexSets.map((v,i)=>({faces:faceSets[i],vertices:[...v],parent:null,parentCrease:null,rotationSign:1,path:[]}));
  const joints:SimulationStepRigidJoint[]=[],adj=components.map(()=>[] as SimulationStepRigidJoint[]);
  prepared.creaseParams.forEach((c,i)=>{
    if(!ranges.has(c.edge))throw Error('步骤动画包含未确定折角的材料铰链，无法保持纸面刚性。');
    if(!active.has(c.edge))return;
    const a=triangleBodies[c.face1],b=triangleBodies[c.face2],joint={crease:i,a,b,tree:false};
    joints.push(joint);adj[a].push(joint);if(a!==b)adj[b].push(joint);
  });
  const fixedSet=new Set(fixed);
  const noncollinear=(indices:number[])=>{
    if(indices.length<3)return false;const a=point(seed,indices[0]);
    let axis:V=[0,0,0],longest=0;
    for(const i of indices){const v=sub(point(seed,i),a);if(size(v)>longest){axis=v;longest=size(v);}}
    return longest>1e-6&&indices.some(i=>size(cross(axis,sub(point(seed,i),a)))>longest*1e-6);
  };
  const root=components.findIndex(c=>noncollinear(c.vertices.filter(i=>fixedSet.has(i))));
  if(root<0)throw Error('固定点未落在同一刚性纸面区域，请重新选择固定侧。');
  const queue=[root],seen=new Set(queue);
  for(let n=0;n<queue.length;n++){
    const current=queue[n];
    for(const joint of adj[current]){
      const next=joint.a===current?joint.b:joint.a;if(seen.has(next))continue;
      const child=components[next];child.parent=current;child.parentCrease=joint.crease;child.rotationSign=joint.a===current?-1:1;
      child.path=[...components[current].path,joint.crease];joint.tree=true;seen.add(next);queue.push(next);
    }
  }
  if(queue.length!==components.length)throw Error('步骤动画存在未连接固定侧的材料区域，无法确定其运动。');
  const vertexBodies=Array.from({length:prepared.vertexCount},()=>-1);
  for(const c of queue)for(const v of components[c].vertices)if(vertexBodies[v]<0)vertexBodies[v]=c;
  if(vertexBodies.some(c=>c<0))throw Error('步骤动画包含不属于纸面的顶点。');
  const fromAngles=prepared.creaseParams.map(c=>ranges.get(c.edge)!.fromAngle);
  const validAngles=(angles:readonly number[])=>{
    if(angles.length!==prepared.creaseParams.length||Array.from(angles).some(v=>!Number.isFinite(v)))throw Error('步骤动画目标折角无效。');
  };
  const seedNormals=prepared.facesVertices.map(([a,b,c])=>unit(cross(sub(point(seed,b),point(seed,a)),sub(point(seed,c),point(seed,a)))));
  if(seedNormals.some(n=>n.some(v=>!Number.isFinite(v))))throw Error('步骤动画包含退化的纸面，无法确定刚性姿态。');
  const edgeLengths=prepared.edgesVertices.map(([a,b])=>size(sub(point(seed,b),point(seed,a))));
  if(edgeLengths.some(n=>!Number.isFinite(n)||n<=1e-12))throw Error('步骤动画包含退化的材料边。');
  const angleScales=prepared.creaseParams.map(c=>edgeLengths[c.edge]);

  const evaluateAngles=(angles:readonly number[]):SimulationStepRigidEvaluation=>{
    validAngles(angles);
    const transforms:T[]=components.map(identity);
    for(const current of queue){
      if(current===root)continue;
      const child=components[current],p=transforms[child.parent!],crease=prepared.creaseParams[child.parentCrease!],[a,b]=prepared.edgesVertices[crease.edge];
      const delta=angles[child.parentCrease!]-fromAngles[child.parentCrease!];
      // A waiting batch has no relative motion at this hinge. Reusing the
      // immutable parent transform avoids both needless Rodrigues work and
      // subtract/add roundoff at an unchanged anchor. No near-zero snapping.
      if(delta===0){transforms[current]=p;continue;}
      transforms[current]=around(p,apply(p,point(seed,a)),apply(p,point(seed,b)),child.rotationSign*delta);
    }
    const positions=new Float64Array(seed.length),residuals:number[]=[];
    let maxPositionResidual=0,maxAngleResidual=0,maxResidual=0;
    for(const c of queue)for(const v of components[c].vertices){
      const proposed=apply(transforms[c],point(seed,v));
      if(vertexBodies[v]===c)positions.set(proposed,v*3);
      else{
        const d=sub(proposed,point(positions,v));residuals.push(...d);maxPositionResidual=Math.max(maxPositionResidual,size(d));
      }
      // A pin shared by several pieces constrains every proposal, including an
      // otherwise invisible proposal on the far side of a non-tree seam.
      if(fixedSet.has(v)){
        const d=sub(proposed,point(seed,v));residuals.push(...d);maxPositionResidual=Math.max(maxPositionResidual,size(d));
      }
    }
    maxResidual=maxPositionResidual;
    for(let i=0;i<prepared.creaseParams.length;i++){
      const crease=prepared.creaseParams[i],a=triangleBodies[crease.face1],b=triangleBodies[crease.face2],[v0,v1]=prepared.edgesVertices[crease.edge];
      const axis=unit(rotate(transforms[a].rotation,sub(point(seed,v1),point(seed,v0)))),n1=rotate(transforms[a].rotation,seedNormals[crease.face1]),n2=rotate(transforms[b].rotation,seedNormals[crease.face2]);
      const theta=Math.atan2(dot(cross(n1,axis),n2),Math.max(-1,Math.min(1,dot(n1,n2))));
      const error=circular(theta-angles[i]*Math.PI/180),scaled=error*angleScales[i];
      residuals.push(scaled);maxAngleResidual=Math.max(maxAngleResidual,Math.abs(error));maxResidual=Math.max(maxResidual,Math.abs(scaled));
    }
    return {positions,transforms,residuals:Float64Array.from(residuals),maxResidual,maxPositionResidual,maxAngleResidual};
  };

  const validatePose=(angles:readonly number[]):Float32Array=>{
    validAngles(angles);
    for(let i=0;i<angles.length;i++){
      const range=ranges.get(prepared.creaseParams[i].edge)!,direction=Math.sign(range.fromAngle||range.toAngle||range.viaAngle||0);
      if(Math.abs(angles[i])>180+1e-8||direction&&angles[i]*direction< -1e-8)throw Error('本步铰链超出山谷折允许范围：谷折 0～180°，峰折 -180～0°。');
    }
    const evaluation=evaluateAngles(angles),result=evaluation.positions;
    if(!Number.isFinite(evaluation.maxPositionResidual)||evaluation.maxPositionResidual>positionTolerance)throw Error('本步折角不能同时满足闭环和材料连接，请拆分为多个折叠动作。');
    for(const v of fixed)if(size(sub(point(result,v),point(seed,v)))>positionTolerance)throw Error('本步动作会移动已固定的纸面区域，请调整固定侧或折痕作用范围。');
    for(let e=0;e<prepared.edgesVertices.length;e++){
      const [a,b]=prepared.edgesVertices[e],actual=size(sub(point(result,a),point(result,b)));
      if(!Number.isFinite(actual)||Math.abs(actual-edgeLengths[e])>Math.max(2e-7,edgeLengths[e]*2e-5))throw Error('本步刚性姿态存在材料边拉伸，不能作为折叠动画。');
    }
    const normals=prepared.facesVertices.map(([a,b,c])=>unit(cross(sub(point(result,b),point(result,a)),sub(point(result,c),point(result,a)))));
    for(let i=0;i<prepared.creaseParams.length;i++){
      const crease=prepared.creaseParams[i],[a,b]=prepared.edgesVertices[crease.edge],axis=unit(sub(point(result,b),point(result,a))),n1=normals[crease.face1],n2=normals[crease.face2];
      const theta=Math.atan2(dot(cross(n1,axis),n2),Math.max(-1,Math.min(1,dot(n1,n2))));
      if(!Number.isFinite(theta)||Math.abs(circular(theta-angles[i]*Math.PI/180))>angleTolerance||evaluation.maxAngleResidual>angleTolerance)throw Error('本步铰链角度无法保持所有纸面连接，请拆分折叠动作。');
    }
    return Float32Array.from(result);
  };

  // Distances between successive tree-hinge anchor points remain fixed within
  // their shared rigid assembly. Their polygonal chain therefore bounds the
  // lever arm throughout arbitrary configurations, unlike seed-to-axis distance
  // which can grow when an intermediate hinge opens.
  const leverArms=components.map(c=>{
    const pivots=c.path.map(i=>point(seed,prepared.edgesVertices[prepared.creaseParams[i].edge][0]));
    if(!pivots.length)return [];
    const result=pivots.map(()=>0);
    let bound=Math.max(0,...c.vertices.map(v=>size(sub(point(seed,v),pivots[pivots.length-1]))));
    for(let i=pivots.length-1;i>=0;i--){
      if(i<pivots.length-1)bound+=size(sub(pivots[i+1],pivots[i]));
      result[i]=bound;
    }
    return result;
  });
  const displacementBounds=(a:readonly number[],b:readonly number[])=>{
    validAngles(a);validAngles(b);
    return components.map((c,j)=>c.path.reduce((sum,i,k)=>sum+Math.min(2,Math.abs(b[i]-a[i])*Math.PI/180)*leverArms[j][k],0));
  };
  return {components,joints,triangleBodies,vertexBodies,activeCreases:prepared.creaseParams.flatMap((c,i)=>active.has(c.edge)?[i]:[]),root,seedPositions:seed,fromAngles,evaluateAngles,validatePose,displacementBounds};
}

/** Strict compatibility entry point: independent linearly scheduled hinges are
 * accepted only if the exact requested configuration closes without stretching.
 * Coupled mechanisms must first obtain legal angles from the path planner. */
export function createSimulationStepRigidDriver(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation):(angles:readonly number[])=>Float32Array {
  const mechanism=compileSimulationStepRigidMechanism(prepared,animation);
  if(mechanism.joints.some(j=>j.a===j.b))throw Error('本步变化折痕仍被已有折态连成闭环，无法执行保持纸面刚性的动作。');
  let cachedAngles:number[]|null=null,cachedPose:Float32Array|null=null;
  return angles=>{
    if(cachedAngles&&cachedAngles.length===angles.length&&cachedAngles.every((a,i)=>a===angles[i]))return cachedPose!;
    const result=mechanism.validatePose(angles);cachedAngles=[...angles];cachedPose=result;return result;
  };
}
