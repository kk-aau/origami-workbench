import type {XY} from './tessellation';

export const UNIT_REGULAR_CENTERED_TILE_TYPE='UnitRegularPolygonCenteredTwistTile' as const;
export const UNIT_REGULAR_CENTERED_ALT_TILE_TYPE='UnitRegularPolygonCenteredTwistAltTile' as const;
export const UNIT_REGULAR_OFFSET_TILE_TYPE='UnitRegularPolygonOffsetTwistTile' as const;

type UnitRegularCenteredCommon={
  sides:number;
  width:number;
  centralTypes:('M'|'V')[];
};
export type UnitRegularCenteredPleatSpec=UnitRegularCenteredCommon&{
  tileType:typeof UNIT_REGULAR_CENTERED_TILE_TYPE;
  pleatAngle:number;
  arrangement:'single'|'in3005-pair';
};
export type UnitRegularCenteredAltSpec=UnitRegularCenteredCommon&{
  tileType:typeof UNIT_REGULAR_CENTERED_ALT_TILE_TYPE;
  twistAngle:number;
  arrangement:'single'|'in3010-pair'|'in3078-pair'|'in3079-pair'|'in3080-pair';
};
export type UnitRegularOffsetTileSpec={offset:number;centralTypes:('M'|'V')[]};
export type UnitRegularOffsetSpec={
  tileType:typeof UNIT_REGULAR_OFFSET_TILE_TYPE;
  sides:number;
  width:number;
  arrangement:'single'|'in3019-pair'|'in3084-pair'|'in3085-pair'|'in3086-pair'|'in3087-four';
  tiles:UnitRegularOffsetTileSpec[];
};
/** The historical project key unitRegularCentered also stores the named offset source. */
export type UnitRegularCenteredSpec=UnitRegularCenteredPleatSpec|UnitRegularCenteredAltSpec|UnitRegularOffsetSpec;

export function unitRegularCenteredPreset():UnitRegularCenteredPleatSpec{
  return {tileType:UNIT_REGULAR_CENTERED_TILE_TYPE,sides:4,width:.2,
    pleatAngle:70,centralTypes:['M','M','V','V'],arrangement:'in3005-pair'};
}

export function unitRegularCenteredAltPreset():UnitRegularCenteredAltSpec{
  return {tileType:UNIT_REGULAR_CENTERED_ALT_TILE_TYPE,sides:4,width:.2,
    twistAngle:30,centralTypes:['M','M','V','V'],arrangement:'in3010-pair'};
}

/** Saved In[3078–3080]: side 2/3 against the next tile's side 1, Mn/Vn. */
export function unitRegularCenteredAltSidePairPreset(
  example:3078|3079|3080=3079):UnitRegularCenteredAltSpec{
  const sides=example===3078?3:example===3079?4:6;
  return {tileType:UNIT_REGULAR_CENTERED_ALT_TILE_TYPE,sides,
    width:example===3078?.1:.2,twistAngle:25,
    centralTypes:Array.from({length:sides},()=> 'M'),
    arrangement:`in${example}-pair`};
}

export function unitRegularOffsetPreset():UnitRegularOffsetSpec{
  return {tileType:UNIT_REGULAR_OFFSET_TILE_TYPE,sides:4,width:.2,
    arrangement:'in3019-pair',tiles:[
      {offset:.15,centralTypes:['V','V','V','V']},
      {offset:-.15,centralTypes:['V','V','V','V']},
    ]};
}

/** Saved In[3084–3086]: signed offset pair with the original source edge. */
export function unitRegularOffsetSidePairPreset(
  example:3084|3085|3086):UnitRegularOffsetSpec{
  const sides=example===3084?3:example===3085?4:6;
  const width=example===3086?.2:.15;
  const offset=example===3084?.10:example===3085?.12:.15;
  const type=example===3085?'V':'M';
  return {tileType:UNIT_REGULAR_OFFSET_TILE_TYPE,sides,width,
    arrangement:`in${example}-pair`,tiles:[
      {offset,centralTypes:Array.from({length:sides},()=>type)},
      {offset:-offset,centralTypes:Array.from({length:sides},()=>type)},
    ]};
}

/** Saved In[3087]: four all-valley squares, signed offsets +d,-d,-d,+d. */
export function unitRegularOffsetFourPreset():UnitRegularOffsetSpec{
  return {tileType:UNIT_REGULAR_OFFSET_TILE_TYPE,sides:4,width:.18,
    arrangement:'in3087-four',tiles:[.15,-.15,-.15,.15].map(offset=>({
      offset,centralTypes:['V','V','V','V']}))};
}

const SIDE_PAIR_LAYOUTS={
  'in3078-pair':{sides:3,edge:2},'in3079-pair':{sides:4,edge:2},
  'in3080-pair':{sides:6,edge:3},'in3084-pair':{sides:3,edge:2},
  'in3085-pair':{sides:4,edge:2},'in3086-pair':{sides:6,edge:3},
} as const;
export function unitRegularSidePairLayout(arrangement:string):{sides:number;edge:number}|undefined{
  return SIDE_PAIR_LAYOUTS[arrangement as keyof typeof SIDE_PAIR_LAYOUTS];
}

/** Origamica's acute Alt branch: tau = atan(tan(alpha) / w). */
export function unitRegularCenteredPleatAngle(spec:UnitRegularCenteredSpec):number{
  if(spec.tileType===UNIT_REGULAR_OFFSET_TILE_TYPE)return 90;
  if(spec.tileType!==UNIT_REGULAR_CENTERED_ALT_TILE_TYPE)return spec.pleatAngle;
  const alpha=spec.twistAngle*Math.PI/180;
  return Math.atan2(Math.sin(alpha),spec.width*Math.cos(alpha))*180/Math.PI;
}

export function readUnitRegularCenteredSpec(value:unknown):UnitRegularCenteredSpec|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  if(!Number.isInteger(raw.sides)||Number(raw.sides)<3||Number(raw.sides)>24||
    typeof raw.width!=='number'||!Number.isFinite(raw.width)||raw.width<.05||raw.width>.8)return null;
  if(raw.tileType===UNIT_REGULAR_OFFSET_TILE_TYPE){
    if(Object.keys(raw).sort().join(',')!=='arrangement,sides,tileType,tiles,width'||
      raw.arrangement!=='single'&&raw.arrangement!=='in3019-pair'&&
        raw.arrangement!=='in3084-pair'&&raw.arrangement!=='in3085-pair'&&
        raw.arrangement!=='in3086-pair'&&raw.arrangement!=='in3087-four'||
      raw.arrangement==='in3087-four'&&raw.sides!==4||
      unitRegularSidePairLayout(String(raw.arrangement))?.sides!==undefined&&
        unitRegularSidePairLayout(String(raw.arrangement))?.sides!==raw.sides||
      !Array.isArray(raw.tiles)||raw.tiles.length!==(raw.arrangement==='single'?1:raw.arrangement==='in3087-four'?4:2))return null;
    for(const tile of raw.tiles){
      if(!tile||typeof tile!=='object'||Array.isArray(tile))return null;
      const item=tile as Record<string,unknown>;
      if(Object.keys(item).sort().join(',')!=='centralTypes,offset'||
        typeof item.offset!=='number'||!Number.isFinite(item.offset)||
        Math.abs(item.offset)>.4||Math.abs(item.offset)+Number(raw.width)/2>=.5-1e-8||
        !Array.isArray(item.centralTypes)||item.centralTypes.length!==raw.sides||
        item.centralTypes.some(type=>type!=='M'&&type!=='V'))return null;
    }
    return structuredClone(raw) as UnitRegularOffsetSpec;
  }
  if(!Array.isArray(raw.centralTypes)||raw.centralTypes.length!==raw.sides||
    raw.centralTypes.some(type=>type!=='M'&&type!=='V'))return null;
  if(raw.tileType===UNIT_REGULAR_CENTERED_TILE_TYPE){
    if(Object.keys(raw).sort().join(',')!=='arrangement,centralTypes,pleatAngle,sides,tileType,width'||
      typeof raw.pleatAngle!=='number'||!Number.isFinite(raw.pleatAngle)||
      raw.pleatAngle<1||raw.pleatAngle>179||
      raw.arrangement!=='single'&&raw.arrangement!=='in3005-pair')return null;
    return structuredClone(raw) as UnitRegularCenteredPleatSpec;
  }
  if(raw.tileType===UNIT_REGULAR_CENTERED_ALT_TILE_TYPE){
    if(Object.keys(raw).sort().join(',')!=='arrangement,centralTypes,sides,tileType,twistAngle,width'||
      typeof raw.twistAngle!=='number'||!Number.isFinite(raw.twistAngle)||
      raw.twistAngle<1||raw.twistAngle>=90||
      raw.arrangement!=='single'&&raw.arrangement!=='in3010-pair'&&
        raw.arrangement!=='in3078-pair'&&raw.arrangement!=='in3079-pair'&&
        raw.arrangement!=='in3080-pair'||
      unitRegularSidePairLayout(String(raw.arrangement))?.sides!==undefined&&
        unitRegularSidePairLayout(String(raw.arrangement))?.sides!==raw.sides)return null;
    return structuredClone(raw) as UnitRegularCenteredAltSpec;
  }
  return null;
}

const snap=(value:number)=>Math.abs(value-Math.round(value))<1e-12?Math.round(value):value;

/** First edge has unit length and runs from (0,0) to (1,0), as in Origamica. */
export function unitRegularCenteredMesh(sides:number,arrangement:UnitRegularCenteredSpec['arrangement']):{vertices:XY[];faces:number[][]}{
  if(!Number.isInteger(sides)||sides<3||sides>24)throw Error('单位正多边形需要 3–24 条边。');
  const half=Math.PI/sides,cx=.5,cy=.5/Math.tan(half);
  const vertices:XY[]=Array.from({length:sides},(_,index)=>{
    const angle=index*2*half;
    return [snap(cx-cx*Math.cos(angle)+cy*Math.sin(angle)),
      snap(cy-cx*Math.sin(angle)-cy*Math.cos(angle))];
  });
  vertices[0]=[0,0];vertices[1]=[1,0];
  const faces=[Array.from({length:sides},(_,index)=>index)];
  if(arrangement==='single')return {vertices,faces};
  if(arrangement==='in3087-four'){
    if(sides!==4)throw Error('In[3087] 保存拼块须为四个正方形。');
    vertices.push([2,0],[2,1],[1,2],[0,2],[2,2]);
    faces.push([1,4,5,2],[3,2,6,7],[2,5,8,6]);
    return {vertices,faces};
  }
  const sidePair=unitRegularSidePairLayout(arrangement);
  if(sidePair){
    if(sides!==sidePair.sides)throw Error('保存的侧向接边与单位正多边形边数不一致。');
    // JoinTiling[{1,j,1}]: new vertex 1 maps to old vertex j, while
    // new vertex n maps to old vertex j+1.  New edge n is the joint.
    const start=sidePair.edge-1,end=sidePair.edge%sides;
    const a=vertices[start],b=vertices[end],last=vertices[sides-1];
    const ux=-last[0],uy=-last[1],vx=a[0]-b[0],vy=a[1]-b[1];
    const length2=ux*ux+uy*uy;
    const cosine=(ux*vx+uy*vy)/length2,sine=(ux*vy-uy*vx)/length2;
    const second=[start];
    for(let index=1;index<sides-1;index++){
      const [x,y]=vertices[index];
      const px=x-last[0],py=y-last[1];
      vertices.push([snap(b[0]+cosine*px-sine*py),
        snap(b[1]+sine*px+cosine*py)]);
      second.push(vertices.length-1);
    }
    second.push(end);
    faces.push(second);
    return {vertices,faces};
  }
  // In[3005], In[3010], and In[3019] reflect the first square across its third edge. The same edge
  // gives a connected two-tile mesh for other side counts, without claiming
  // their full CP is pointwise identical to the Mathematica construction.
  const start=2,end=(start+1)%sides,a=vertices[start],b=vertices[end];
  const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
  const second=[end,start];
  for(let step=1;step<sides-1;step++){
    const point=vertices[(start-step+sides)%sides];
    const projection=((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length2;
    vertices.push([snap(2*(a[0]+projection*dx)-point[0]),
      snap(2*(a[1]+projection*dy)-point[1])]);
    second.push(vertices.length-1);
  }
  faces.push(second);
  return {vertices,faces};
}
