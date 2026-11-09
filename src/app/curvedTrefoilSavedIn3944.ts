/** Origamica In[3944]: the directly evaluated Mathematica KnotData Trefoil branch.
 * The notebook does not contain numerical Out. This is a read-only local
 * Frenet/ruling preview, not a certified finite-width paper surface.
 */

export type TrefoilVec3=[number,number,number];
export type TrefoilFrame={
  u:number;curve:TrefoilVec3;tangent:TrefoilVec3;
  leftRuling:TrefoilVec3;rightRuling:TrefoilVec3;
  speed:number;curvature:number;geodesicCurvature:number;torsion:number;
  leftRulingAngleDeg:number;rightRulingAngleDeg:number;foldAngleDeg:135;
};

export const TREFOIL_IN3944={
  parameterStart:Math.PI/3,parameterEnd:7*Math.PI/3,
  foldAngleDeg:135,orientation:1,samplingSegments:256,
  sourceExpression:'{Sin[u] + 2 Sin[2 u], Cos[u] - 2 Cos[2 u], -Sin[3 u]}',
  notebookInput:'KnotData["Trefoil","SpaceCurve"]',
  // Direct Mathematica evaluations, not interchangeable hand-written knots:
  sourceEvaluations:[
    'https://mathematica.stackexchange.com/questions/112511/how-to-add-color-to-a-knot',
    'https://mathematica.stackexchange.com/questions/157255/how-to-pre-or-post-process-knotdata-substrate',
  ],
} as const;

const add=(a:TrefoilVec3,b:TrefoilVec3):TrefoilVec3=>
  [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const scale=(a:TrefoilVec3,s:number):TrefoilVec3=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a:TrefoilVec3,b:TrefoilVec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:TrefoilVec3,b:TrefoilVec3):TrefoilVec3=>[
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0],
];
const norm=(a:TrefoilVec3)=>Math.hypot(...a);

/** Exact derivative jets of the evaluated KnotData Function, no finite differences. */
export function trefoilJets(u:number){
  if(!Number.isFinite(u)||u<TREFOIL_IN3944.parameterStart-1e-12||
    u>TREFOIL_IN3944.parameterEnd+1e-12)throw Error('参数超出 In[3944] 的闭区间。');
  const curve:TrefoilVec3=[Math.sin(u)+2*Math.sin(2*u),
    Math.cos(u)-2*Math.cos(2*u),-Math.sin(3*u)];
  const d1:TrefoilVec3=[Math.cos(u)+4*Math.cos(2*u),
    -Math.sin(u)+4*Math.sin(2*u),-3*Math.cos(3*u)];
  const d2:TrefoilVec3=[-Math.sin(u)-8*Math.sin(2*u),
    -Math.cos(u)+8*Math.cos(2*u),9*Math.sin(3*u)];
  const d3:TrefoilVec3=[-Math.cos(u)-16*Math.cos(2*u),
    Math.sin(u)-16*Math.sin(2*u),27*Math.cos(3*u)];
  return {curve,d1,d2,d3};
}

/** The two source identities prove regularity and nonzero Frenet curvature
 * globally: with c=cos(3u), |f'|²=17+8c+9c²>=137/9 and
 * |f'×f''|²=2338+248c-776c²-144c³>=1170 for -1<=c<=1.
 */
export const TREFOIL_REGULARITY={minimumSpeedSquared:137/9,
  conservativeMinimumCrossSquared:1170,fullSavedInterval:true} as const;

/** Reconstruct the source FoldSpaceCurve3D Frenet generator at one parameter.
 * This verifies directions at the crease only. The short rays drawn by the UI
 * are glyphs; their endpoints are not certified strip boundaries.
 */
export function trefoilFrame(u:number):TrefoilFrame{
  const {curve,d1,d2,d3}=trefoilJets(u),cross12=cross(d1,d2);
  const speed=norm(d1),crossLength=norm(cross12);
  const tangent=scale(d1,1/speed),binormal=scale(cross12,1/crossLength);
  const normal=cross(binormal,tangent);
  const curvature=crossLength/speed**3;
  const torsion=dot(cross12,d3)/crossLength**2;
  const half=TREFOIL_IN3944.foldAngleDeg*Math.PI/360;
  const halfCos=Math.cos(half),halfSin=Math.sin(half);
  const speedCurvature=speed*curvature,speedTorsion=speed*torsion;
  const q=halfSin*speedCurvature;
  const a=speedTorsion,b=-speedTorsion;
  const leftAlpha=a/Math.hypot(q,a),leftBeta=q/Math.hypot(q,a);
  const rightAlpha=-b/Math.hypot(q,b),rightBeta=-q/Math.hypot(q,b);
  const leftTransverse=add(scale(normal,halfCos),scale(binormal,halfSin));
  const rightTransverse=add(scale(normal,halfCos),scale(binormal,-halfSin));
  const leftRuling=add(scale(tangent,leftAlpha),scale(leftTransverse,leftBeta));
  const rightRuling=add(scale(tangent,rightAlpha),scale(rightTransverse,rightBeta));
  const angle=(value:number)=>Math.acos(Math.max(-1,Math.min(1,value)))*180/Math.PI;
  return {u,curve,tangent,leftRuling,rightRuling,speed,curvature,
    geodesicCurvature:curvature*halfCos,torsion,
    leftRulingAngleDeg:angle(dot(leftRuling,tangent)),
    rightRulingAngleDeg:angle(dot(rightRuling,tangent)),
    foldAngleDeg:135};
}

export function sampleTrefoilIn3944(segments=TREFOIL_IN3944.samplingSegments):TrefoilFrame[]{
  if(!Number.isInteger(segments)||segments<16||segments>512)throw Error('采样段数须在 16–512。');
  const {parameterStart:start,parameterEnd:end}=TREFOIL_IN3944;
  return Array.from({length:segments+1},(_,index)=>
    trefoilFrame(start+(end-start)*index/segments));
}

export function projectTrefoil(point:TrefoilVec3,azimuthDeg:number):[number,number,number]{
  if(!Number.isFinite(azimuthDeg)||azimuthDeg<-180||azimuthDeg>180)
    throw Error('视角须在 −180° 至 180°。');
  const az=azimuthDeg*Math.PI/180,elevation=25*Math.PI/180;
  const x=Math.cos(az)*point[0]-Math.sin(az)*point[1];
  const depth=Math.sin(az)*point[0]+Math.cos(az)*point[1];
  return [x,Math.cos(elevation)*point[2]-Math.sin(elevation)*depth,depth];
}
