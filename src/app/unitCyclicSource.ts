import type {XY} from './tessellation';
import {unitCyclicPolygonVertices} from './unitCyclicPolygon';

export const UNIT_CYCLIC_CENTERED_TYPE='UnitCyclicPolygonCenteredTwistTile' as const;
export const UNIT_CYCLIC_ALT_TYPE='UnitCyclicPolygonCenteredTwistAltTile' as const;

type CyclicTile={centralTypes:('M'|'V')[]};
type CyclicCommon={angles:number[];
  side:number;sideIndex:number;
  width:number;arrangement:'single'|'in3042-pair'|'in3045-pair';tiles:CyclicTile[]};
export type UnitCyclicCenteredSpec=CyclicCommon&{tileType:typeof UNIT_CYCLIC_CENTERED_TYPE;pleatAngle:number};
export type UnitCyclicAltSpec=CyclicCommon&{tileType:typeof UNIT_CYCLIC_ALT_TYPE;twistAngle:number};
export type UnitCyclicSpec=UnitCyclicCenteredSpec|UnitCyclicAltSpec;

export function unitCyclicCenteredPreset():UnitCyclicCenteredSpec{
  return {tileType:UNIT_CYCLIC_CENTERED_TYPE,angles:[75,85,95,105],side:1.2,sideIndex:2,width:.1,arrangement:'in3042-pair',pleatAngle:80,tiles:[{centralTypes:['M','M','M','M']},{centralTypes:['V','V','V','V']}]};
}
export function unitCyclicAltPreset():UnitCyclicAltSpec{
  return {tileType:UNIT_CYCLIC_ALT_TYPE,angles:[75,85,95,105],side:1.2,sideIndex:2,width:.1,arrangement:'in3045-pair',twistAngle:30,tiles:[{centralTypes:['M','M','M','M']},{centralTypes:['V','V','V','V']}]};
}

/** Six-corner mother Out[359] plus a local In[3041]-formula single-tile twist. */
export function unitCyclicHexagonCenteredPreset():UnitCyclicCenteredSpec{
  return {tileType:UNIT_CYCLIC_CENTERED_TYPE,angles:[128,119,118,115,0,0],
    side:1,sideIndex:2,
    width:.1,arrangement:'single',pleatAngle:80,
    tiles:[{centralTypes:['M','M','M','M','V','V']}]};
}

/** Local n=8 formula composition; the notebook saves no octagon twist Out. */
export function unitCyclicOctagonCenteredPreset():UnitCyclicCenteredSpec{
  return {tileType:UNIT_CYCLIC_CENTERED_TYPE,
    angles:[140,135,135,135,130,135,0,0],side:1,sideIndex:2,
    width:.1,arrangement:'single',pleatAngle:80,
    tiles:[{centralTypes:['M','M','M','M','M','M','V','V']}]};
}

/** Numeric composition of In[378] and In[3041/3044] for an unsaved n-gon. */
export function unitCyclicGeneralPreset(sides:number):UnitCyclicCenteredSpec{
  if(!Number.isInteger(sides)||sides<3||sides>24)throw Error('圆内接居中扭转只接收 3–24 边。');
  if(sides===4)return unitCyclicCenteredPreset();
  if(sides===6)return unitCyclicHexagonCenteredPreset();
  if(sides===8)return unitCyclicOctagonCenteredPreset();
  const angle=(sides-2)*180/sides;
  const angles=Array(sides).fill(angle);
  angles[sides-1]=0;
  if(sides%2===0)angles[sides-2]=0;
  return {tileType:UNIT_CYCLIC_CENTERED_TYPE,angles,side:1,sideIndex:2,
    width:.1,arrangement:'single',pleatAngle:80,
    tiles:[{centralTypes:Array.from({length:sides},(_,i)=>sides>12||i<sides-2?'M':'V')}]};
}

function cross(a:XY,b:XY){return a[0]*b[1]-a[1]*b[0];}
const rad=(angle:number)=>angle*Math.PI/180;

/** In[357] ignores the last two even-order corner inputs. */
export function unitCyclicEffectiveAngles(angles:readonly number[]):number[]{
  if(angles.length===4)return [angles[0],angles[1],180-angles[0],180-angles[1]];
  if(angles.length<3||angles.length>24)throw Error('仅支持 3–24 边圆内接来源。');
  if(angles.length%2){
    const fixed=angles.slice(0,-1);
    return [...fixed,(angles.length-2)*180-fixed.reduce((sum,value)=>sum+value,0)];
  }
  const fixed=angles.slice(0,-2);
  const remaining=(angles.length-2)*180-fixed.reduce((sum,value)=>sum+value,0);
  const alternating=fixed.reduce((sum,value,index)=>
    sum+(index%2===0?value:-value),0);
  return [...fixed,(remaining-alternating)/2,(remaining+alternating)/2];
}

/** Bounded, center-inside n=6/8 branch of UnitCyclicPolygonVertices, is=2. */
function unitEvenPolygonVertices(angles:readonly number[],side:number):XY[]{
  const effective=unitCyclicEffectiveAngles(angles);
  const count=effective.length;
  if(count!==6&&count!==8)throw Error('当前仅构造六边形和八边形单补片。');
  if(effective.some(angle=>!Number.isFinite(angle)||angle<1||angle>179))
    throw Error('圆内接偶数边形补角越过严格凸数值范围。');
  const equations=effective.map(angle=>360-2*angle);
  const gapsFromFirst=(first:number)=>{
    const gaps=[first];for(let i=1;i<count;i++)gaps.push(equations[i]-gaps[i-1]);
    return gaps;
  };
  const zero=gapsFromFirst(0);
  const first=-zero.reduce((sum,gap,i)=>sum+(i%2===0?gap:-gap),0)/count;
  const base=gapsFromFirst(first),signs=base.map((_gap,i)=>i%2===0?1:-1);
  if(Math.abs(base[count-1]+base[0]-equations[0])>1e-8||
    Math.abs(base.reduce((sum,gap)=>sum+gap,0)-360)>1e-8)
    throw Error('圆内接偶数边形内角未闭合。');
  let lower=Math.max(...base.map((gap,i)=>signs[i]>0?1-gap:gap-179));
  let upper=Math.min(...base.map((gap,i)=>signs[i]>0?179-gap:gap-1));
  if(lower>=upper)throw Error('圆内接偶数边形没有中心位于内部的凸形分支。');
  const residual=(shift:number)=>Math.sin(rad((base[1]-shift)/2))/
    Math.sin(rad((base[0]+shift)/2))-side;
  let left=residual(lower),right=residual(upper);
  if(!Number.isFinite(left)||!Number.isFinite(right)||left*right>0)
    throw Error('指定第 2 边长在受限凸形分支中不可达。');
  let shift:number;
  if(Math.abs(left)<1e-12)shift=lower;
  else if(Math.abs(right)<1e-12)shift=upper;
  else{
    shift=(lower+upper)/2;
    for(let i=0;i<90;i++){
      shift=(lower+upper)/2;
      const value=residual(shift);
      if(Math.abs(value)<1e-13||upper-lower<1e-12)break;
      if(left*value<0){upper=shift;right=value;}
      else{lower=shift;left=value;}
    }
  }
  const gaps=base.map((gap,i)=>gap+signs[i]*shift);
  if(gaps.some(gap=>gap<1-1e-9||gap>179+1e-9))
    throw Error('圆内接偶数边形中心弧角越过受限凸形分支。');
  const half=rad(gaps[0]/2),radius=.5/Math.sin(half);
  const center:XY=[.5,.5/Math.tan(half)],vertices:XY[]=[[0,0],[1,0]];
  let direction=-Math.PI/2+half;
  for(const gap of gaps.slice(1,-1)){
    direction+=rad(gap);
    vertices.push([center[0]+radius*Math.cos(direction),
      center[1]+radius*Math.sin(direction)]);
  }
  const edges=vertices.map((p,i)=>{
    const q=vertices[(i+1)%count];return [q[0]-p[0],q[1]-p[1]] as XY;
  });
  if(vertices.some(point=>point.some(value=>!Number.isFinite(value)||Math.abs(value)>10))||
    edges.some(edge=>Math.hypot(...edge)<1e-6)||
    edges.some((edge,i)=>cross(edge,edges[(i+1)%count])<=1e-9)||
    vertices.some(point=>Math.abs(Math.hypot(point[0]-center[0],
      point[1]-center[1])-radius)>1e-8)||
    Math.abs(Math.hypot(...edges[1])-side)>1e-8)
    throw Error('圆内接偶数边形退化、不共圆或指定边长未达到精度。');
  return vertices;
}
function unitQuadrilateralVertices(angles:[number,number,number,number],side:number,sideIndex:2|3|4):XY[]{
  const [a1,a2,a3]=angles.slice(0,3).map(v=>v*Math.PI/180);
  const direction=(a:number):XY=>[Math.cos(a),Math.sin(a)];
  const u2=direction(Math.PI-a2),u3=direction(2*Math.PI-a2-a3),u4=direction(a1),neg4:[number,number]=[-u4[0],-u4[1]];
  const solve=(u:XY,v:XY,r:XY):[number,number]=>{const det=cross(u,v);if(Math.abs(det)<1e-10)throw Error('该角度和指定边无法唯一确定圆内接四边形。');return [cross(r,v)/det,cross(u,r)/det];};
  let s2:number,s3:number,s4:number;
  if(sideIndex===2){s2=side;[s3,s4]=solve(u3,neg4,[-1-side*u2[0],-side*u2[1]]);}
  else if(sideIndex===3){s3=side;[s2,s4]=solve(u2,neg4,[-1-side*u3[0],-side*u3[1]]);}
  else {s4=side;[s2,s3]=solve(u2,u3,[-1+side*u4[0],side*u4[1]]);}
  if([s2,s3,s4].some(v=>v<1e-6||v>10))throw Error('该角度和边长不能构成有效凸四边形。');
  const p2:XY=[1+s2*u2[0],s2*u2[1]],p3:XY=[p2[0]+s3*u3[0],p2[1]+s3*u3[1]];
  const polygon:XY[]=[[0,0],[1,0],p2,p3];
  if(polygon.some(point=>point.some(value=>!Number.isFinite(value)||Math.abs(value)>10)))throw Error('单位四边形坐标越过允许范围。');
  const edges=polygon.map((p,i)=>{const q=polygon[(i+1)%4];return [q[0]-p[0],q[1]-p[1]] as XY;});
  if(edges.some((e,i)=>cross(e,edges[(i+1)%4])<=1e-8))throw Error('该角度和边长不能构成严格凸四边形。');
  return polygon;
}

export function unitCyclicMesh(spec:UnitCyclicSpec):{vertices:XY[];faces:number[][]}{
  const angles=spec.angles,largeEven=angles.length!==4;
  const first=angles.length===4?unitQuadrilateralVertices(
    unitCyclicEffectiveAngles(angles) as [number,number,number,number],
    spec.side,spec.sideIndex as 2|3|4):
    (angles.length===6||angles.length===8)&&spec.sideIndex===2?
      unitEvenPolygonVertices(angles,spec.side):
      unitCyclicPolygonVertices(angles,spec.side,spec.sideIndex);
  if(spec.arrangement==='single')return {vertices:first,
    faces:[first.map((_point,index)=>index)]};
  if(largeEven)throw Error('原版保存的双块拼接仅在四边形子域提供。');
  const second=first.map(p=>[first[1][0]+first[2][0]-p[0],first[1][1]+first[2][1]-p[1]] as XY);
  return {vertices:[...first,second[0],second[3]],faces:[[0,1,2,3],[4,2,1,5]]};
}

export function readUnitCyclicSpec(value:unknown):UnitCyclicSpec|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  const angles=raw.angles;
  if(!Array.isArray(angles)||angles.length<3||angles.length>24||
    angles.some((v,i)=>typeof v!=='number'||!Number.isFinite(v)||
      i<(angles.length%2?angles.length-1:angles.length-2)&&
      (v<1||v>179))||
    typeof raw.side!=='number'||!Number.isFinite(raw.side)||raw.side<.05||raw.side>5||
    !Number.isInteger(raw.sideIndex)||
    (raw.sideIndex as number)<2||(raw.sideIndex as number)>angles.length||
    typeof raw.width!=='number'||!Number.isFinite(raw.width)||
    raw.width<.05||raw.width>.8||!Array.isArray(raw.tiles))return null;
  const largeEven=angles.length!==4;
  const alt=raw.tileType===UNIT_CYCLIC_ALT_TYPE, centered=raw.tileType===UNIT_CYCLIC_CENTERED_TYPE;
  if(!alt&&!centered)return null;
  const arrangement=raw.arrangement;
  if(arrangement!=='single'&&
    (largeEven||arrangement!==(alt?'in3045-pair':'in3042-pair')))return null;
  const pair=arrangement!=='single';
  if(raw.tiles.length!==(pair?2:1))return null;
  const expectedKeys=alt?'angles,arrangement,side,sideIndex,tileType,tiles,twistAngle,width':'angles,arrangement,pleatAngle,side,sideIndex,tileType,tiles,width';
  if(Object.keys(raw).sort().join(',')!==expectedKeys)return null;
  const angleKey=alt?'twistAngle':'pleatAngle',angle=raw[angleKey];
  if(typeof angle!=='number'||!Number.isFinite(angle)||angle<1||angle>=90)return null;
  for(const tile of raw.tiles){if(!tile||typeof tile!=='object'||Array.isArray(tile))return null;const item=tile as Record<string,unknown>;if(Object.keys(item).sort().join(',')!=='centralTypes'||!Array.isArray(item.centralTypes)||item.centralTypes.length!==angles.length||item.centralTypes.some(v=>v!=='M'&&v!=='V'))return null;}
  try{unitCyclicMesh(raw as unknown as UnitCyclicSpec);}catch{return null;}
  return structuredClone(raw) as UnitCyclicSpec;
}

export function unitCyclicParams(spec:UnitCyclicSpec,paper?:{shape:'square'|'rectangle'|'regular';aspect?:number;sides?:number;margin:number}){
  const valid=readUnitCyclicSpec(spec);if(!valid)throw Error('单位圆内接多边形参数无效。');
  const {vertices,faces}=unitCyclicMesh(valid);
  const twists=valid.tiles.map(tile=>({width:valid.width,offset:0,...(valid.tileType===UNIT_CYCLIC_ALT_TYPE?{angleMode:'twist' as const,twistAngle:valid.twistAngle}:{tilt:valid.pleatAngle}),centralTypes:[...tile.centralTypes]}));
  return {family:'custom' as const,vertices,faces,repeatX:1,repeatY:1,customOutput:'tile-twists' as const,tileTwists:twists,monolithicOptions:{mergedEdges:'delete' as const,samePtTolerance:1e-8,collinearCleanup:true,collinearTolerance:1e-8},unitCyclic:valid,...(paper?{paper}:{}),angle:36,scale:.3};
}
