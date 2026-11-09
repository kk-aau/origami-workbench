import {api} from './api';

export type PotPoint2=[number,number];
export type PotPoint3=[number,number,number];
export type AltMoselyQuery={family:'alt-mosely-pot-reference';example:3557|3558;sectors:number};
export type PotLine={points:[PotPoint2,PotPoint2];role:'M'|'V'|'F'|'B';
  part:'forward'|'reverse';repeat?:number};
export type PotFace={vertices:[PotPoint3,PotPoint3,PotPoint3,PotPoint3];
  role:'panel'|'flange-side'|'flange-face';part:'forward'|'reverse';repeat?:number};
export type AltMoselyResult={family:'origamica-alt-mosely-pot-display';query:AltMoselyQuery;
  source:{section:43;function:'MakeAltMoselyPot';definitionCell:'In[3556]';
    savedCell:'In[3557]'|'In[3558]';classDeprecated:true;machineReadableWolframOut:false};
  options:{CreasePatternBoundary:'Default';MinimumAngleDeg:10;FoldedFormGapSize:0.05};
  profile:{original:PotPoint2[];axisCompleted:PotPoint2[];
    heightFromOriginal:number;splitWedgeWidth:number;axisPointAdded:boolean};
  splitWedge:{flatLines:PotLine[];foldedFaces:PotFace[]};
  display:{flatLines:PotLine[];foldedFaces:PotFace[]};
  certification:{sourceFormulaCoordinates:true;historicalDeprecatedClass:true;
    exactFOLD:false;adoptableCreasePattern:false;foldedDisplayHasGap:true;
    selfIntersectionChecked:false;manufacturabilityChecked:false}};

export const ALT_MOSELY_SAVED:AltMoselyQuery[]=[
  {family:'alt-mosely-pot-reference',example:3557,sectors:8},
  {family:'alt-mosely-pot-reference',example:3558,sectors:6},
];
const isRecord=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value:Record<string,unknown>,names:string[])=>
  Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name));
const near=(value:unknown,expected:number)=>typeof value==='number'&&
  Number.isFinite(value)&&Math.abs(value-expected)<1e-8*Math.max(1,Math.abs(expected));
const vector=(value:unknown,n:number)=>Array.isArray(value)&&value.length===n&&
  value.every(item=>typeof item==='number'&&Number.isFinite(item)&&Math.abs(item)<=100);
const equal=(a:number[],b:number[])=>a.length===b.length&&a.every((v,i)=>near(v,b[i]));
const savedPoints=(example:3557|3558):PotPoint2[]=>example===3557?
  [[0,0],[1,1],[1,2],[2,3]]:
  [[0,0],[1,0],[2,Math.sqrt(3)],[1,2*Math.sqrt(3)],[0,2*Math.sqrt(3)]];

export function validateAltMoselyQuery(raw:unknown):AltMoselyQuery{
  if(!isRecord(raw)||raw.family!=='alt-mosely-pot-reference'||
    Object.keys(raw).some(key=>!['family','example','sectors'].includes(key)))
    throw Error('只接受原版 MakeAltMoselyPot 的只读查询。');
  const example=raw.example??3557;
  if(example!==3557&&example!==3558)throw Error('保存例只支持 In[3557] 与 In[3558]。');
  const sectors=raw.sectors??(example===3557?8:6);
  if(typeof sectors!=='number'||!Number.isInteger(sectors)||
    sectors<4||sectors>16||sectors%2)throw Error('旋转阶数须为 4–16 的偶数。');
  return {family:'alt-mosely-pot-reference',example,sectors};
}

function checkLines(value:unknown,expected:number,withRepeat:boolean):asserts value is PotLine[]{
  if(!Array.isArray(value)||value.length!==expected)throw Error('二维折线数量异常。');
  for(const item of value){
    if(!isRecord(item)||!keys(item,withRepeat?['points','role','part','repeat']:
      ['points','role','part'])||!Array.isArray(item.points)||item.points.length!==2||
      !item.points.every(point=>vector(point,2))||
      !['M','V','F','B'].includes(String(item.role))||
      !['forward','reverse'].includes(String(item.part))||
      withRepeat&&(!Number.isInteger(item.repeat)||Number(item.repeat)<0))
      throw Error('二维折线含无效几何或角色。');
  }
}
function checkFaces(value:unknown,expected:number,withRepeat:boolean):asserts value is PotFace[]{
  if(!Array.isArray(value)||value.length!==expected)throw Error('三维面数量异常。');
  for(const item of value){
    if(!isRecord(item)||!keys(item,withRepeat?['vertices','role','part','repeat']:
      ['vertices','role','part'])||!Array.isArray(item.vertices)||
      item.vertices.length!==4||!item.vertices.every(point=>vector(point,3))||
      !['panel','flange-side','flange-face'].includes(String(item.role))||
      !['forward','reverse'].includes(String(item.part))||
      withRepeat&&(!Number.isInteger(item.repeat)||Number(item.repeat)<0))
      throw Error('三维面含无效几何或角色。');
  }
}
function rotate2(point:number[],angle:number){
  return [Math.cos(angle)*point[0]-Math.sin(angle)*point[1],
    Math.sin(angle)*point[0]+Math.cos(angle)*point[1]];
}

/** Checks saved input, source flags, exact replication transforms and finite geometry. */
export function parseAltMoselyResult(raw:unknown,requested?:AltMoselyQuery):AltMoselyResult{
  if(!isRecord(raw)||!keys(raw,['family','query','source','options','profile',
    'splitWedge','display','certification'])||
    raw.family!=='origamica-alt-mosely-pot-display'||!isRecord(raw.query)||
    !keys(raw.query,['family','example','sectors']))throw Error('壶体返回格式异常。');
  const query=validateAltMoselyQuery(raw.query);
  if(requested&&(requested.example!==query.example||requested.sectors!==query.sectors))
    throw Error('服务端读回的保存例或旋转阶数不一致。');
  const source=raw.source,options=raw.options,profile=raw.profile;
  if(!isRecord(source)||!keys(source,['section','function','definitionCell','savedCell',
    'classDeprecated','machineReadableWolframOut'])||source.section!==43||
    source.function!=='MakeAltMoselyPot'||source.definitionCell!=='In[3556]'||
    source.savedCell!==`In[${query.example}]`||source.classDeprecated!==true||
    source.machineReadableWolframOut!==false||!isRecord(options)||
    !keys(options,['CreasePatternBoundary','MinimumAngleDeg','FoldedFormGapSize'])||
    options.CreasePatternBoundary!=='Default'||options.MinimumAngleDeg!==10||
    options.FoldedFormGapSize!==.05||!isRecord(profile)||
    !keys(profile,['original','axisCompleted','heightFromOriginal',
      'splitWedgeWidth','axisPointAdded']))throw Error('原版来源或选项标记异常。');
  const originals=savedPoints(query.example),completed=query.example===3557?
    [...originals,[0,3.0001] as PotPoint2]:originals;
  if(!Array.isArray(profile.original)||!Array.isArray(profile.axisCompleted)||
    profile.original.length!==originals.length||
    profile.axisCompleted.length!==completed.length||
    !profile.original.every((point,i)=>vector(point,2)&&equal(point,originals[i]))||
    !profile.axisCompleted.every((point,i)=>vector(point,2)&&equal(point,completed[i]))||
    profile.axisPointAdded!==(query.example===3557)||
    !near(profile.heightFromOriginal,originals.at(-1)![1]-originals[0][1]))
    throw Error('保存剖面、轴点或原始高度读回异常。');
  const width=completed.slice(1).reduce((sum,point,i)=>sum+
    Math.hypot(point[0]-completed[i][0],point[1]-completed[i][1]),0);
  if(!near(profile.splitWedgeWidth,width))throw Error('原版 SplitWedge 宽度异常。');
  const split=raw.splitWedge,display=raw.display,cert=raw.certification;
  if(!isRecord(split)||!keys(split,['flatLines','foldedFaces'])||
    !isRecord(display)||!keys(display,['flatLines','foldedFaces'])||
    !isRecord(cert)||!keys(cert,['sourceFormulaCoordinates','historicalDeprecatedClass',
      'exactFOLD','adoptableCreasePattern','foldedDisplayHasGap',
      'selfIntersectionChecked','manufacturabilityChecked'])||
    cert.sourceFormulaCoordinates!==true||cert.historicalDeprecatedClass!==true||
    cert.exactFOLD!==false||cert.adoptableCreasePattern!==false||
    cert.foldedDisplayHasGap!==true||cert.selfIntersectionChecked!==false||
    cert.manufacturabilityChecked!==false)
    throw Error('只读历史来源不得宣称精确 FOLD、无自交或可制造。');
  const n=completed.length;
  const flatStarts=query.example===3558?1:0;
  const perSplit=4*(n-1-flatStarts)+5*(n-2)+3;
  const splitLines=2*perSplit,splitFaces=10*(n-1),repeats=query.sectors/2;
  checkLines(split.flatLines,splitLines,false);
  checkLines(display.flatLines,splitLines*repeats,true);
  checkFaces(split.foldedFaces,splitFaces,false);
  checkFaces(display.foldedFaces,splitFaces*repeats,true);
  const phi=Math.PI/query.sectors;
  for(let i=0;i<splitLines;i++)for(let repeat=0;repeat<repeats;repeat++){
    const base=split.flatLines[i],copy=display.flatLines[i*repeats+repeat];
    const delta=rotate2([width*repeat*(Math.cos(2*phi)-1),
      width*repeat*Math.sin(2*phi)],-phi);
    if(copy.repeat!==repeat||copy.role!==base.role||copy.part!==base.part||
      !copy.points.every((point,j)=>equal(point,
        [base.points[j][0]+delta[0],base.points[j][1]+delta[1]])))
      throw Error('二维交替平移与保存公式不一致。');
  }
  for(let i=0;i<splitFaces;i++)for(let repeat=0;repeat<repeats;repeat++){
    const base=split.foldedFaces[i],copy=display.foldedFaces[i*repeats+repeat];
    if(copy.repeat!==repeat||copy.role!==base.role||copy.part!==base.part||
      !copy.vertices.every((point,j)=>equal(point,
        [...rotate2(base.vertices[j],4*Math.PI*repeat/query.sectors),
          base.vertices[j][2]])))throw Error('三维交替旋转与保存公式不一致。');
  }
  return raw as AltMoselyResult;
}

export async function fetchAltMoselyReference(input:unknown,signal?:AbortSignal){
  const query=validateAltMoselyQuery(input);
  for(let attempt=0;;attempt++){
    try{return parseAltMoselyResult(await api('tessellation/alt-mosely-pot-reference',
      query,signal),query);}
    catch(cause){
      if(signal?.aborted||attempt>=7||!(cause instanceof Error)||
        !cause.message.includes('已有镶嵌计算正在进行'))throw cause;
      await new Promise<void>((resolve,reject)=>{
        if(signal?.aborted){reject(signal.reason);return;}
        const abort=()=>{clearTimeout(timer);reject(signal?.reason);};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},
          Math.min(1200,350+attempt*170));
        signal?.addEventListener('abort',abort,{once:true});
      });
    }
  }
}
