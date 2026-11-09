import type {XY} from './tessellation';

export const UNIT_TRIANGLE_CENTERED_TYPE='UnitTriangleCenteredTwistTile' as const;
export const UNIT_TRIANGLE_ALT_TYPE='UnitTriangleCenteredTwistAltTile' as const;
export const UNIT_TRIANGLE_OFFSET_TYPE='UnitTriangleOffsetTwistTile' as const;

type TriangleCommon={angles:[number,number,number];width:number};
export type TriangleTypes={centralTypes:('M'|'V')[]};
export type TriangleOffsetTile=TriangleTypes&{offset:number};
export type TriangleCenteredSpec=TriangleCommon&{
  tileType:typeof UNIT_TRIANGLE_CENTERED_TYPE;
  arrangement:'single'|'in3025-pair';
  pleatAngle:number;
  tiles:TriangleTypes[];
};
export type TriangleAltSpec=TriangleCommon&{
  tileType:typeof UNIT_TRIANGLE_ALT_TYPE;
  arrangement:'single'|'in3028-pair';
  twistAngle:number;
  tiles:TriangleTypes[];
};
export type TriangleOffsetSpec=TriangleCommon&{
  tileType:typeof UNIT_TRIANGLE_OFFSET_TYPE;
  arrangement:'single'|'in3039-pair';
  tiles:TriangleOffsetTile[];
};
export type UnitTriangleSpec=TriangleCenteredSpec|TriangleAltSpec|TriangleOffsetSpec;

const angles=():[number,number,number]=>[50,60,70];
const centeredTiles=():TriangleTypes[]=>[
  {centralTypes:['M','M','M']},{centralTypes:['V','V','V']},
];
export function triangleCenteredPreset():TriangleCenteredSpec{
  return {tileType:UNIT_TRIANGLE_CENTERED_TYPE,angles:angles(),width:.1,
    arrangement:'in3025-pair',pleatAngle:80,tiles:centeredTiles()};
}
export function triangleAltPreset():TriangleAltSpec{
  return {tileType:UNIT_TRIANGLE_ALT_TYPE,angles:angles(),width:.1,
    arrangement:'in3028-pair',twistAngle:25,tiles:centeredTiles()};
}
export function triangleOffsetPreset():TriangleOffsetSpec{
  return {tileType:UNIT_TRIANGLE_OFFSET_TYPE,angles:angles(),width:.1,
    arrangement:'in3039-pair',tiles:[
      {offset:.05,centralTypes:['M','M','M']},
      {offset:-.05,centralTypes:['M','M','M']},
    ]};
}

/** Origamica In[366]: unit base and source A/B/C angles in degrees. */
export function unitTriangleMesh(sourceAngles:[number,number,number],arrangement:UnitTriangleSpec['arrangement']):{vertices:XY[];faces:number[][]}{
  const a=sourceAngles[0]*Math.PI/180,b=sourceAngles[1]*Math.PI/180;
  const c=(180-sourceAngles[0]-sourceAngles[1])*Math.PI/180;
  const length=Math.sin(b)/Math.sin(c);
  const x=length*Math.cos(a),y=length*Math.sin(a);
  const vertices:XY[]=[[0,0],[1,0],[x,y]];
  const faces=[[0,1,2]];
  if(arrangement!=='single'){
    // In[3025], In[3028], In[3039]: half-turn about edge 2 midpoint.
    vertices.push([1+x,y]);faces.push([3,2,1]);
  }
  return {vertices,faces};
}

export function triangleAltPleatAngle(spec:TriangleAltSpec):number{
  const alpha=spec.twistAngle*Math.PI/180;
  return Math.atan2(Math.sin(alpha),spec.width*Math.cos(alpha))*180/Math.PI;
}

export function readUnitTriangleSpec(value:unknown):UnitTriangleSpec|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  if(!Array.isArray(raw.angles)||raw.angles.length!==3||
    raw.angles.some(angle=>typeof angle!=='number'||!Number.isFinite(angle)||angle<1)||
    Math.abs(raw.angles.reduce((sum,angle)=>sum+angle,0)-180)>1e-8||
    typeof raw.width!=='number'||!Number.isFinite(raw.width)||raw.width<.05||raw.width>.8||
    !Array.isArray(raw.tiles))return null;
  const pair=raw.arrangement!=='single';
  if(raw.tiles.length!==(pair?2:1))return null;
  const centered=raw.tileType===UNIT_TRIANGLE_CENTERED_TYPE;
  const alt=raw.tileType===UNIT_TRIANGLE_ALT_TYPE;
  const offset=raw.tileType===UNIT_TRIANGLE_OFFSET_TYPE;
  if(!centered&&!alt&&!offset)return null;
  if(centered){
    if(Object.keys(raw).sort().join(',')!=='angles,arrangement,pleatAngle,tileType,tiles,width'||
      raw.arrangement!=='single'&&raw.arrangement!=='in3025-pair'||
      typeof raw.pleatAngle!=='number'||!Number.isFinite(raw.pleatAngle)||
      raw.pleatAngle<1||raw.pleatAngle>179)return null;
  }else if(alt){
    if(Object.keys(raw).sort().join(',')!=='angles,arrangement,tileType,tiles,twistAngle,width'||
      raw.arrangement!=='single'&&raw.arrangement!=='in3028-pair'||
      typeof raw.twistAngle!=='number'||!Number.isFinite(raw.twistAngle)||
      raw.twistAngle<1||raw.twistAngle>=90)return null;
  }else if(Object.keys(raw).sort().join(',')!=='angles,arrangement,tileType,tiles,width'||
    raw.arrangement!=='single'&&raw.arrangement!=='in3039-pair')return null;
  for(const tile of raw.tiles){
    if(!tile||typeof tile!=='object'||Array.isArray(tile))return null;
    const item=tile as Record<string,unknown>;
    if(Object.keys(item).sort().join(',')!==(offset?'centralTypes,offset':'centralTypes')||
      !Array.isArray(item.centralTypes)||item.centralTypes.length!==3||
      item.centralTypes.some(type=>type!=='M'&&type!=='V'))return null;
    if(offset&&(typeof item.offset!=='number'||!Number.isFinite(item.offset)||
      Math.abs(item.offset)>.4||Math.abs(item.offset)+Number(raw.width)/2>=.5-1e-8))return null;
  }
  return structuredClone(raw) as UnitTriangleSpec;
}
