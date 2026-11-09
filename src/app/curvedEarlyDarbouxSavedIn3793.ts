/** Fixed read-only source diagnostics In[3793], [3794], [3796], [3797]. */
import type {Point3} from './curvedDarbouxNormalSavedIn3812';

export type EarlyCell='3793'|'3794'|'3796'|'3797';
const PI=Math.PI,A=Math.sqrt(3)/2,B=.5;
const dot=(x:Point3,y:Point3)=>x[0]*y[0]+x[1]*y[1]+x[2]*y[2];
const cross=(x:Point3,y:Point3):Point3=>[
  x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
const norm=(x:Point3)=>Math.hypot(...x);
const scale=(x:Point3,s:number):Point3=>[s*x[0],s*x[1],s*x[2]];
const sub=(x:Point3,y:Point3):Point3=>[x[0]-y[0],x[1]-y[1],x[2]-y[2]];
const normalized=(x:Point3):Point3=>scale(x,1/norm(x));
const valid=(cell:string):cell is EarlyCell=>
  cell==='3793'||cell==='3794'||cell==='3796'||cell==='3797';
function check(cell:EarlyCell,t:number){
  if(!valid(cell))throw Error('仅支持四个固定保存诊断。');
  const end=cell==='3794'?PI/2:.3;
  if(!Number.isFinite(t)||t< -end||t>end)
    throw Error('参数超出该保存曲线画域。');
}
export function earlySavedInput(cell:EarlyCell){
  if(!valid(cell))throw Error('仅支持四个固定保存诊断。');
  return {
    sourceCell:`In[${cell}]`,sourceFunction:'Darboux3DSystem',
    curveRange:cell==='3794'?[-PI/2,PI/2] as [number,number]:[-.3,.3] as [number,number],
    sourceFrameAt:cell==='3793'?.15:null,
    sourceVectorLength:cell==='3793'?.1:null,
    plotAngleDeg:cell==='3794'?null:30,
    plotK1:cell==='3793'?2:cell==='3794'?null:1,
    plotK2:cell==='3793'?6:cell==='3794'?null:2,
    printedAt:cell==='3793'?.15:cell==='3794'?null:0,
    printedBeforeNumericPlotAssignments:cell==='3796'||cell==='3797',
    wolframNumericOutAvailable:false,exactFOLD:false,adoptablePaper:false,
  };
}

/** Paraboloid parameters x,y; for 3794 side 1 is (x,phi), side 2 (z,psi). */
export function earlySurface(cell:EarlyCell,x:number,y:number,side:1|2=1):Point3{
  if(!valid(cell)||!Number.isFinite(x)||!Number.isFinite(y))
    throw Error('曲面参数须有限，且属于四个保存例。');
  if(cell==='3794'){
    if(side!==1&&side!==2)throw Error('只支持源两圆柱面。');
    const lo=side===1?-1:-.5;
    if(x<lo||x>1.5||y< -PI/2||y>PI/2)
      throw Error('圆柱参数超出保存画域。');
    return side===1?[x,Math.sin(y),1-Math.cos(y)]:
      [1-Math.cos(y),Math.sin(y),x];
  }
  if(x< -.3||x>.3||y< -.3||y>.3)throw Error('二次曲面参数超出保存画域。');
  const [kx,ky]=cell==='3793'?[2,6]:[1,2];
  return [x,y,(kx*x*x+ky*y*y)/2];
}

function parabolaParameter(cell:EarlyCell,t:number){
  const bent=cell==='3797';
  return {x:A*t-(bent?B*t*t:0),y:B*t+(bent?A*t*t:0),
    dx:A-(bent?2*B*t:0),dy:B+(bent?2*A*t:0),
    ddx:bent?-2*B:0,ddy:bent?2*A:0};
}
export function earlyCurve(cell:EarlyCell,t:number):Point3{
  check(cell,t);
  if(cell==='3794')return [1-Math.cos(t),Math.sin(t),1-Math.cos(t)];
  const {x,y}=parabolaParameter(cell,t),[kx,ky]=cell==='3793'?[2,6]:[1,2];
  return [x,y,(kx*x*x+ky*y*y)/2];
}

/** Exact derivatives of the saved parameter curves and surface normals. */
export function earlyFrame(cell:EarlyCell,t:number){
  check(cell,t);
  let point:Point3,first:Point3,second:Point3,third:Point3,
    normalRaw:Point3,normalRawPrime:Point3;
  if(cell==='3794'){
    const s=Math.sin(t),c=Math.cos(t);
    point=[1-c,s,1-c];first=[s,c,s];second=[c,-s,c];third=[-s,-c,-s];
    normalRaw=[0,-s,c];normalRawPrime=[0,-c,-s];
  }else{
    const {x,y,dx,dy,ddx,ddy}=parabolaParameter(cell,t),
      [kx,ky]=cell==='3793'?[2,6]:[1,2];
    point=[x,y,(kx*x*x+ky*y*y)/2];
    first=[dx,dy,kx*x*dx+ky*y*dy];
    second=[ddx,ddy,kx*(dx*dx+x*ddx)+ky*(dy*dy+y*ddy)];
    third=[0,0,3*(kx*dx*ddx+ky*dy*ddy)];
    normalRaw=[-kx*x,-ky*y,1];normalRawPrime=[-kx*dx,-ky*dy,0];
  }
  const speed=norm(first),tangent=scale(first,1/speed),
    tangentPrime=scale(sub(second,scale(tangent,dot(tangent,second))),1/speed),
    turn=norm(tangentPrime),frenetNormal=scale(tangentPrime,1/turn),
    binormal=cross(tangent,frenetNormal),surfaceNormal=normalized(normalRaw),
    normalPrime=scale(sub(normalRawPrime,
      scale(surfaceNormal,dot(surfaceNormal,normalRawPrime))),1/norm(normalRaw)),
    tangentNormal=cross(surfaceNormal,tangent),
    cross12=cross(first,second),cross12sq=dot(cross12,cross12);
  return {t,point,first,second,third,speed,tangent,frenetNormal,binormal,
    surfaceNormal,tangentNormal,curvature:turn/speed,
    torsion:dot(cross12,third)/cross12sq,
    geodesicCurvature:dot(tangentNormal,tangentPrime)/speed,
    normalCurvature:dot(surfaceNormal,tangentPrime)/speed,
    geodesicTorsion:-dot(tangentNormal,normalPrime)/speed,
    surfaceArea:norm(normalRaw)};
}

export function earlyIntersectionTangency(t:number){
  check('3794',t);
  // S1 normal is (0,-sin t,cos t); S2's oriented normal is (-cos t,sin t,0).
  const s=Math.sin(t),c=Math.cos(t);
  return {point:earlyCurve('3794',t),surface1Normal:[0,-s,c] as Point3,
    surface2Normal:[-c,s,0] as Point3,
    normalCrossMagnitude:Math.abs(c)*Math.sqrt(1+s*s)};
}
