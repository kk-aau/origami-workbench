import {defaultEquilateralEllipseSource,ellipsePointsMatch,readJoinedEllipseSource,solveEquilateralEllipse,type JoinedEllipseSource} from './equilateralEllipse';
export type TubePoint=[number,number];
export type TwistJoinedTubeParams={family:'twist-joined-tube';bottomPoints:TubePoint[];topPoints:TubePoint[];
  verticalOffset:number;twistDirection:'CCW'|'CW';tiltAxialAngleDeg:number;
  tiltAzimuthalAngleDeg:number;tubeHeight:number;panelOverlap:boolean;
  typeMinimumAngleDeg:number;typeMaximumAngleDeg:number;ellipseSource?:JoinedEllipseSource};
export type DoubleJoinedTubeParams={family:'double-joined-tube';bottomPoints:TubePoint[];topPoints:TubePoint[];
  verticalOffset:number;tubeHeight:number;panelOverlap:boolean;
  typeMinimumAngleDeg:number;typeMaximumAngleDeg:number;ellipseSource?:JoinedEllipseSource};
export type JoinedTubeParams=TwistJoinedTubeParams|DoubleJoinedTubeParams;

export function rotateTubePoints(points:TubePoint[],degrees:number):TubePoint[]{
  const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return points.map(([x,y])=>[c*x-s*y,s*x+c*y]);
}

/** Origamica PleatReducePolygon, used by the saved DoubleJoinedTubes example. */
export function pleatReducePolygon(points:TubePoint[],ratio:number,direction:'CCW'|'CW'='CCW'):TubePoint[]{
  if(points.length<3||!Number.isFinite(ratio)||ratio<=0||ratio>=1)throw Error('收缩比须在 0 与 1 之间。');
  const result:TubePoint[]=[];
  points.forEach((point,index)=>{
    const next=points[(index+1)%points.length];
    if(direction==='CCW'){
      result.push([ratio*point[0],ratio*point[1]]);
      result.push([ratio*point[0]+(1+ratio)/2*(next[0]-point[0]),
        ratio*point[1]+(1+ratio)/2*(next[1]-point[1])]);
    }else{
      result.push([ratio*next[0]+(1+ratio)/2*(point[0]-next[0]),
        ratio*next[1]+(1+ratio)/2*(point[1]-next[1])]);
      result.push([ratio*next[0],ratio*next[1]]);
    }
  });
  return direction==='CCW'?[result[result.length-1],...result.slice(0,-1)]:result;
}

export function joinedTubePreset(family:'twist-joined-tube'|'double-joined-tube'):JoinedTubeParams{
  if(family==='twist-joined-tube'){
    const bottomPoints:TubePoint[]=[[1,1],[-1,1],[-1,-1],[1,-1]];
    return {family,bottomPoints,topPoints:rotateTubePoints(bottomPoints,30),
      verticalOffset:1,twistDirection:'CCW',tiltAxialAngleDeg:0,
      tiltAzimuthalAngleDeg:0,tubeHeight:1,panelOverlap:true,
      typeMinimumAngleDeg:.5,typeMaximumAngleDeg:180};
  }
  const bottomPoints:TubePoint[]=[[1,0],[0,1],[-1,0],[0,-1]];
  return {family,bottomPoints,
    topPoints:rotateTubePoints(pleatReducePolygon(bottomPoints,.5),45),
    verticalOffset:.5,tubeHeight:1,panelOverlap:false,
    typeMinimumAngleDeg:.5,typeMaximumAngleDeg:180};
}

/** In[3587]: DiscreteEllipseEquilateral[24,{GoldenRatio,1}] and RotateLeft[Rot90[bottom],3].
 * The saved vertices remain unchanged; the optional source is independently
 * rebuilt and checked by both project readers and the numerical backend.
 */
export function joinedTubeSavedEllipsePreset():TwistJoinedTubeParams{
  const bottomPoints:TubePoint[]=[
    [1.618033988749895,0],[1.525354458859344,.333582529254831],
    [1.299387251147903,.595890783268838],[1.007694012443580,.782389720474835],
    [.684352403048776,.906151599576440],[.345449248169483,.976943200050260],
    [0,1],[-.345449248169483,.976943200050260],
    [-.684352403048776,.906151599576440],[-1.007694012443580,.782389720474835],
    [-1.299387251147903,.595890783268838],[-1.525354458859344,.333582529254831],
    [-1.618033988749895,0],[-1.525354458859344,-.333582529254831],
    [-1.299387251147903,-.595890783268838],[-1.007694012443580,-.782389720474835],
    [-.684352403048776,-.906151599576440],[-.345449248169483,-.976943200050260],
    [0,-1],[.345449248169483,-.976943200050260],
    [.684352403048776,-.906151599576440],[1.007694012443580,-.782389720474835],
    [1.299387251147903,-.595890783268838],[1.525354458859344,-.333582529254831],
  ];
  const rotated=bottomPoints.map(([x,y])=>[-y||0,x] as TubePoint);
  const base=joinedTubePreset('twist-joined-tube') as TwistJoinedTubeParams;
  return {...base,bottomPoints,
    topPoints:[...rotated.slice(3),...rotated.slice(0,3)],verticalOffset:.2,
    panelOverlap:true,ellipseSource:{ellipse:defaultEquilateralEllipseSource(24),topRotationDeg:90,topShift:3}};
}

export function joinedTubeEllipsePoints(source:JoinedEllipseSource,double=false):{bottomPoints:TubePoint[];topPoints:TubePoint[]}{
  const checked=readJoinedEllipseSource(source,double);
  if(!checked)throw Error('椭圆来源或上圈变换参数无效。');
  const bottomPoints=solveEquilateralEllipse(checked.ellipse);
  const rotated=rotateTubePoints(double?pleatReducePolygon(bottomPoints,checked.pleatReduction!):bottomPoints,checked.topRotationDeg);
  return {bottomPoints,topPoints:[...rotated.slice(checked.topShift),...rotated.slice(0,checked.topShift)]};
}

/** In[3590]: the two 10-point PleatReducePolygon rings of a regular pentagon. */
export function joinedTubeSavedPleatedPentagonPreset():TwistJoinedTubeParams{
  const pentagon:TubePoint[]=Array.from({length:5},(_,j)=>[
    Math.cos(2*Math.PI*j/5),Math.sin(2*Math.PI*j/5),
  ]);
  const base=joinedTubePreset('twist-joined-tube') as TwistJoinedTubeParams;
  return {...base,bottomPoints:pleatReducePolygon(pentagon,.8),
    topPoints:rotateTubePoints(pleatReducePolygon(pentagon,.4),10),
    verticalOffset:.5,twistDirection:'CCW',panelOverlap:true};
}

/** In[3588]/In[3589]: the same 1.732 × 1 rectangle pair with opposite twist directions. */
export function joinedTubeSavedRectanglesPreset(
  twistDirection:'CW'|'CCW'='CW'):TwistJoinedTubeParams{
  const a=1.732,b=1;
  const bottomPoints:TubePoint[]=[[a,b],[-a,b],[-a,-b],[a,-b]];
  const rotated=rotateTubePoints(bottomPoints,60);
  const base=joinedTubePreset('twist-joined-tube') as TwistJoinedTubeParams;
  return {...base,bottomPoints,topPoints:[...rotated.slice(1),rotated[0]],
    verticalOffset:.95,twistDirection,panelOverlap:true};
}

/** In[3586]: offset 24-gon after a 175° twist; the 0.32 gap is source input. */
export function joinedTubeSavedOffsetCirclePreset():TwistJoinedTubeParams{
  const count=24;
  const bottomPoints:TubePoint[]=Array.from({length:count},(_,j)=>[
    Math.cos(2*Math.PI*j/count),Math.sin(2*Math.PI*j/count)]);
  const topPoints=rotateTubePoints(bottomPoints,175).map(([x,y])=>[x+.5,y+.5] as TubePoint);
  const base=joinedTubePreset('twist-joined-tube') as TwistJoinedTubeParams;
  return {...base,bottomPoints,topPoints,verticalOffset:.32,
    twistDirection:'CCW',panelOverlap:true,typeMinimumAngleDeg:30};
}

/** In[3592]: 12-gon with a 90° top twist and a 15° tilted upper axis. */
export function joinedTubeSavedTiltedCirclePreset():TwistJoinedTubeParams{
  const count=12;
  const bottomPoints:TubePoint[]=Array.from({length:count},(_,j)=>[
    Math.cos(2*Math.PI*j/count),Math.sin(2*Math.PI*j/count)]);
  const base=joinedTubePreset('twist-joined-tube') as TwistJoinedTubeParams;
  return {...base,bottomPoints,topPoints:rotateTubePoints(bottomPoints,90),
    verticalOffset:.8,twistDirection:'CCW',tiltAxialAngleDeg:90,
    tiltAzimuthalAngleDeg:15,panelOverlap:true,typeMinimumAngleDeg:30};
}

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
function points(value:unknown):TubePoint[]|null{
  if(!Array.isArray(value)||value.length<3||value.length>96)return null;
  if(value.some(point=>!Array.isArray(point)||point.length!==2||point.some(coord=>!finite(coord)||Math.abs(coord)>10000)))return null;
  return structuredClone(value) as TubePoint[];
}
function perimeter(vertices:TubePoint[]):number{
  let length=0;
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length],edge=Math.hypot(a[0]-b[0],a[1]-b[1]);
    if(edge<1e-8)return NaN;
    length+=edge;
  }
  return length;
}

export function readJoinedTubeParams(value:unknown):JoinedTubeParams|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>,family=raw.family;
  if(family!=='twist-joined-tube'&&family!=='double-joined-tube')return null;
  const shared=['family','bottomPoints','topPoints','verticalOffset','tubeHeight','panelOverlap',
    'typeMinimumAngleDeg','typeMaximumAngleDeg','ellipseSource'];
  const allowed=family==='twist-joined-tube'?[...shared,'twistDirection','tiltAxialAngleDeg','tiltAzimuthalAngleDeg']:shared;
  if(Object.keys(raw).some(key=>!allowed.includes(key)))return null;
  const bottomPoints=points(raw.bottomPoints),topPoints=points(raw.topPoints);
  if(!bottomPoints||!topPoints||bottomPoints.length>48||topPoints.length!==(family==='twist-joined-tube'?bottomPoints.length:2*bottomPoints.length))return null;
  let ellipseSource:JoinedEllipseSource|undefined;
  if(raw.ellipseSource!==undefined){
    const source=readJoinedEllipseSource(raw.ellipseSource,family==='double-joined-tube');
    if(!source)return null;
    try{const expected=joinedTubeEllipsePoints(source,family==='double-joined-tube');
      if(!ellipsePointsMatch(bottomPoints,expected.bottomPoints)||!ellipsePointsMatch(topPoints,expected.topPoints))return null;
    }catch{return null;}
    ellipseSource=source;
  }
  const bottomPerimeter=perimeter(bottomPoints),topPerimeter=perimeter(topPoints);
  if(!finite(bottomPerimeter)||!finite(topPerimeter)||Math.abs(bottomPerimeter-topPerimeter)>1e-6)return null;
  const verticalOffset=raw.verticalOffset,tubeHeight=raw.tubeHeight??1,panelOverlap=raw.panelOverlap??false,
    typeMinimumAngleDeg=raw.typeMinimumAngleDeg??.5,typeMaximumAngleDeg=raw.typeMaximumAngleDeg??180;
  if(!finite(verticalOffset)||verticalOffset<1e-5||verticalOffset>10000||
    !finite(tubeHeight)||tubeHeight<1e-5||tubeHeight>10000||typeof panelOverlap!=='boolean'||
    !finite(typeMinimumAngleDeg)||!finite(typeMaximumAngleDeg)||typeMinimumAngleDeg<0||
    typeMinimumAngleDeg>typeMaximumAngleDeg||typeMaximumAngleDeg>180)return null;
  const common={bottomPoints,topPoints,verticalOffset,tubeHeight,panelOverlap,
    typeMinimumAngleDeg,typeMaximumAngleDeg,...(ellipseSource?{ellipseSource}:{})};
  if(family==='double-joined-tube')return {family,...common};
  const twistDirection=raw.twistDirection??'CCW',tiltAxialAngleDeg=raw.tiltAxialAngleDeg??0,
    tiltAzimuthalAngleDeg=raw.tiltAzimuthalAngleDeg??0;
  if(!['CCW','CW'].includes(String(twistDirection))||!finite(tiltAxialAngleDeg)||
    Math.abs(tiltAxialAngleDeg)>360||!finite(tiltAzimuthalAngleDeg)||
    Math.abs(tiltAzimuthalAngleDeg)>89)return null;
  return {family,...common,twistDirection:twistDirection as 'CCW'|'CW',
    tiltAxialAngleDeg,tiltAzimuthalAngleDeg};
}
