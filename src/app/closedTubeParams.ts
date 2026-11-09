import {defaultEquilateralEllipseSource,ellipsePointsMatch,readEquilateralEllipseSource,solveEquilateralEllipse,type EquilateralEllipseSource} from './equilateralEllipse';
export type ClosedTubePoint=[number,number];
export type ClosedTubeVector=[number,number,number];
export type ClosedTwistToppedTubeParams={family:'closed-twist-topped-tube';points:ClosedTubePoint[];
  convergencePoint:ClosedTubeVector;twistNormal:ClosedTubeVector;
  twistDirection:'CCW'|'CW';tubeHeight:number;panelOverlap:boolean;twistExtension:number;
  typeMinimumAngleDeg:number;typeMaximumAngleDeg:number;ellipseSource?:EquilateralEllipseSource};

export function closedTubePreset():ClosedTwistToppedTubeParams{
  return {family:'closed-twist-topped-tube',points:[[1,1],[-1,1],[-1,-1],[1,-1]],
    convergencePoint:[0,0,.5],twistNormal:[0,0,1],twistDirection:'CCW',
    tubeHeight:1,panelOverlap:true,twistExtension:.5,
    typeMinimumAngleDeg:0,typeMaximumAngleDeg:89};
}

/** In[3567]: offset apex and tilted twist plane, with the source's default extension and height. */
export function closedTubeSavedTiltedPreset():ClosedTwistToppedTubeParams{
  return {...closedTubePreset(),convergencePoint:[.4,0,.2],twistNormal:[-.2,-.3,1],
    twistDirection:'CW',panelOverlap:false,twistExtension:0};
}

/** In[3568]/In[3569]: DiscreteEllipseEquilateral[16,{GoldenRatio,1}]. */
export function closedTubeSavedEllipsePreset(twistExtension:0.2|-0.1=0.2):ClosedTwistToppedTubeParams{
  const points:ClosedTubePoint[]=[
    [1.618033988749895,0],[1.421208662185828,.478008410127300],
    [1.004516235158516,.783949042583285],[.514336409756560,.948131831262210],
    [0,1],[-.514336409756560,.948131831262210],
    [-1.004516235158516,.783949042583285],[-1.421208662185828,.478008410127300],
    [-1.618033988749895,0],[-1.421208662185828,-.478008410127300],
    [-1.004516235158516,-.783949042583285],[-.514336409756560,-.948131831262210],
    [0,-1],[.514336409756560,-.948131831262210],
    [1.004516235158516,-.783949042583285],[1.421208662185828,-.478008410127300],
  ];
  return {...closedTubePreset(),points,ellipseSource:defaultEquilateralEllipseSource(16),convergencePoint:[0,0,0],
    twistExtension,panelOverlap:true,typeMinimumAngleDeg:45};
}

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
function vector(value:unknown,length:number):number[]|null{
  return Array.isArray(value)&&value.length===length&&value.every(item=>finite(item)&&Math.abs(item)<=10000)?[...value]:null;
}
export function readClosedTubeParams(value:unknown):ClosedTwistToppedTubeParams|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  if(raw.family!=='closed-twist-topped-tube'||Object.keys(raw).some(key=>
    !['family','points','convergencePoint','twistNormal','twistDirection','tubeHeight',
      'panelOverlap','twistExtension','typeMinimumAngleDeg','typeMaximumAngleDeg','ellipseSource'].includes(key)))return null;
  const rawPoints=raw.points;
  if(!Array.isArray(rawPoints)||rawPoints.length<3||rawPoints.length>48)return null;
  const points=rawPoints.map(point=>vector(point,2));
  if(points.some(point=>!point))return null;
  let ellipseSource:EquilateralEllipseSource|undefined;
  if(raw.ellipseSource!==undefined){
    const source=readEquilateralEllipseSource(raw.ellipseSource);
    if(!source)return null;
    try{if(!ellipsePointsMatch(points as ClosedTubePoint[],solveEquilateralEllipse(source)))return null;}
    catch{return null;}
    ellipseSource=source;
  }
  for(let i=0;i<points.length;i++){
    const a=points[i]!,b=points[(i+1)%points.length]!;
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8)return null;
  }
  const convergencePoint=vector(raw.convergencePoint??[0,0,0],3),
    twistNormal=vector(raw.twistNormal??[0,0,1],3);
  if(!convergencePoint||!twistNormal||Math.abs(twistNormal[2])<1e-8)return null;
  const twistDirection=raw.twistDirection??'CCW',tubeHeight=raw.tubeHeight??1,
    panelOverlap=raw.panelOverlap??false,twistExtension=raw.twistExtension??0,
    typeMinimumAngleDeg=raw.typeMinimumAngleDeg??0,typeMaximumAngleDeg=raw.typeMaximumAngleDeg??89;
  if(!['CCW','CW'].includes(String(twistDirection))||!finite(tubeHeight)||tubeHeight<1e-5||tubeHeight>10000||
    typeof panelOverlap!=='boolean'||!finite(twistExtension)||Math.abs(twistExtension)>10000||
    !finite(typeMinimumAngleDeg)||!finite(typeMaximumAngleDeg)||typeMinimumAngleDeg<0||
    typeMinimumAngleDeg>typeMaximumAngleDeg||typeMaximumAngleDeg>180)return null;
  return {family:'closed-twist-topped-tube',points:points as ClosedTubePoint[],
    convergencePoint:convergencePoint as ClosedTubeVector,twistNormal:twistNormal as ClosedTubeVector,
    twistDirection:twistDirection as 'CCW'|'CW',tubeHeight,panelOverlap,twistExtension,
    typeMinimumAngleDeg,typeMaximumAngleDeg,...(ellipseSource?{ellipseSource}:{})};
}
