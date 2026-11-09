/** Original In[4114]: u is a label string, v an indexed vector binding,
 * n the table limit. The one-argument WrapRules used here preserves k-1,
 * without modulo. m only belongs to an optional DefaultCPRules embedding.
 * This represents finite numeric Text positions, not a solved CP/FOLD.
 */
import {FLASHER_ROTATIONAL_ORDER_LIMIT} from './flasherParams';
export type FlasherLabelIndex=[number,number,number];
export type FlasherLabelPoint=[number,number]|[number,number,number];
export type FlasherLabelBinding={index:FlasherLabelIndex;point:FlasherLabelPoint};
type Origin={kind:'finite-numeric-bindings'}|{kind:'FlasherDefaultCPRules';rotationalOrder:number;prefill:{rings:number;heightOrder:number}|null};
export type FlasherAllLabelsQuery={function:'FlasherFirstSectorAllPossibleVerticesLabels';u:string;v:string;n:number;
  wrapContext:{rule:'FlasherWrapRules[v]';periodicModulo:false};dimension:2|3;bindings:FlasherLabelBinding[];origin:Origin};
export type FlasherLabelText={head:'Text';content:{head:'Subscript';base:{head:'Style';value:string;style:'Bold'};indices:FlasherLabelIndex};
  position:FlasherLabelPoint;resolvedPositionIndex:FlasherLabelIndex};
export type FlasherAllLabelsResult={schema:'origamica-flasher-all-vertices-labels-v1';query:FlasherAllLabelsQuery;
  source:{function:'FlasherFirstSectorAllPossibleVerticesLabels';definitionCell:'In[4114]';definitionLines:[343348,343374];
    labelFunction:'FlasherVertexLabel';labelCell:'In[4111]';table:{i:[-1,number];j:[0,number];k:0};
    inputMeanings:{u:'label-string';v:'indexed-vector-coordinate-bindings';n:'first-sector-table-limit'};
    representation:'finite-numeric-original-Text-primitives';tableNesting:'i-outer-j-inner';originalStyle:'Black';
    originalGraphicOptions:[];symbolicVectorDomainComplete:false;wolframExecuted:false;solvedCreasePattern:false;paperCertification:false};
  data:{head:'Style';style:'Black';items:FlasherLabelText[][]}};
function fail(message:string):never{throw Error(message);}
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:Record<string,unknown>,expected:string)=>Object.keys(x).sort().join(',')===expected.split(',').sort().join(',');
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e8;
const text=(x:unknown):x is string=>typeof x==='string'&&x.length>=1&&x.length<=24&&!/[\u0000-\u001f\u007f]/.test(x);
export const FLASHER_ALL_LABEL_LIMIT=12;
export function flasherLabelWrap([i,j,k]:FlasherLabelIndex):FlasherLabelIndex{
  return i===-1?[j,0,k-1]:[i,j,k];
}
const required=(n:number)=>Array.from({length:n+2},(_,i)=>
  Array.from({length:n+1},(_,j)=>flasherLabelWrap([i-1,j,0]))).flat();
/** In[4099] coordinates with In[4097/4098] seam wrap already applied. */
export function flasherAllLabelsSeedPoint(index:FlasherLabelIndex,m:number):[number,number]{
  if(index.length!==3||index.some(x=>!Number.isInteger(x)||Math.abs(x)>24)||!Number.isInteger(m)||m<3||m>FLASHER_ROTATIONAL_ORDER_LIMIT)fail(`原种子位置需要有限整数索引和 m=3–${FLASHER_ROTATIONAL_ORDER_LIMIT}。`);
  const [i,j,k]=flasherLabelWrap(index),t=Math.tan(Math.PI/m),turn=2*Math.PI/m;
  let x=1/(2*t),y=.5;
  if(i+1>=j){x+=(i+1)*Math.cos(Math.PI/2+turn)+t*j*Math.cos(turn);y+=(i+1)*Math.sin(Math.PI/2+turn)+t*j*Math.sin(turn);}
  else{x-=t*(i+1);y+=j;}
  x*=t;y*=t;
  return[Math.cos(turn*k)*x-Math.sin(turn*k)*y,Math.sin(turn*k)*x+Math.cos(turn*k)*y];
}
export function readFlasherAllLabelsQuery(raw:unknown):FlasherAllLabelsQuery{
  if(!record(raw)||!keys(raw,'function,u,v,n,wrapContext,dimension,bindings,origin')||
    raw.function!=='FlasherFirstSectorAllPossibleVerticesLabels'||!text(raw.u)||!text(raw.v)||
    !Number.isInteger(raw.n)||!finite(raw.n)||raw.n<0||raw.n>FLASHER_ALL_LABEL_LIMIT||
    !record(raw.wrapContext)||!keys(raw.wrapContext,'rule,periodicModulo')||raw.wrapContext.rule!=='FlasherWrapRules[v]'||raw.wrapContext.periodicModulo!==false||
    ![2,3].includes(raw.dimension as number)||!Array.isArray(raw.bindings)||!record(raw.origin))fail('标签输入要求 u/v 名称、0–12 的整数 n、原单参 WrapRules 与完整有限二维／三维坐标绑定。');
  const n=raw.n as number,dimension=raw.dimension as 2|3;
  if(raw.bindings.length!==(n+2)*(n+1))fail('必须保留所有原 Table 项所需的坐标绑定。');
  const wanted=new Set(required(n).map(index=>index.join(','))),seen=new Set<string>();
  for(const value of raw.bindings){
    if(!record(value)||!keys(value,'index,point')||!Array.isArray(value.index)||value.index.length!==3||value.index.some(x=>!Number.isInteger(x))||
      !Array.isArray(value.point)||value.point.length!==dimension||value.point.some(x=>!finite(x)))fail('每个坐标绑定须有完整整数索引及同维度有限坐标，范围±10⁸。');
    const key=value.index.join(',');
    if(!wanted.has(key)||seen.has(key))fail('坐标绑定索引重复、缺失或不是原 WrapRules 解析后的索引。');
    seen.add(key);
  }
  if(raw.origin.kind==='finite-numeric-bindings'){
    if(!keys(raw.origin,'kind'))fail('自定义坐标来源不能混入未验证的来源字段。');
  }else if(raw.origin.kind==='FlasherDefaultCPRules'){
    const m=raw.origin.rotationalOrder;
    if(!keys(raw.origin,'kind,rotationalOrder,prefill')||!Number.isInteger(m)||!finite(m)||m<3||m>FLASHER_ROTATIONAL_ORDER_LIMIT||dimension!==2)fail('原二维种子来源与 m／维度不符。');
    const p=raw.origin.prefill;
    if(p!==null&&(!record(p)||!keys(p,'rings,heightOrder')||!Number.isInteger(p.rings)||!Number.isInteger(p.heightOrder)||
      !finite(p.rings)||!finite(p.heightOrder)||p.rings<1||p.heightOrder<1||p.rings*p.heightOrder!==n))fail('当前 r/h 来源必须满足 n=r·h。');
    for(const value of raw.bindings as unknown as FlasherLabelBinding[]){
      const expected=flasherAllLabelsSeedPoint(value.index,m);
      if(value.point.some((x,i)=>Math.abs(x-expected[i])>1e-12+32*Number.EPSILON*Math.abs(expected[i])))fail('坐标已修改，不能仍声称是原 DefaultCPRules 种子。');
    }
  }else fail('未识别的标签坐标来源。');
  return structuredClone(raw) as unknown as FlasherAllLabelsQuery;
}
export function flasherAllLabelsSeedQuery(n:number,m:number,u='p',v='p',prefill:{rings:number;heightOrder:number}|null=null):FlasherAllLabelsQuery{
  if(!Number.isInteger(n)||n<0||n>FLASHER_ALL_LABEL_LIMIT||!Number.isInteger(m)||m<3||m>FLASHER_ROTATIONAL_ORDER_LIMIT)fail(`标签参考网格要求整数 n=0–12，m=3–${FLASHER_ROTATIONAL_ORDER_LIMIT}。`);
  return readFlasherAllLabelsQuery({function:'FlasherFirstSectorAllPossibleVerticesLabels',u,v,n,wrapContext:{rule:'FlasherWrapRules[v]',periodicModulo:false},dimension:2,
    bindings:required(n).map(index=>({index,point:flasherAllLabelsSeedPoint(index,m)})),origin:{kind:'FlasherDefaultCPRules',rotationalOrder:m,prefill}});
}
export function flasherAllVerticesLabels(raw:unknown):FlasherAllLabelsResult{
  const query=readFlasherAllLabelsQuery(raw),{u,n}=query;
  const positions=new Map(query.bindings.map(({index,point})=>[index.join(','),point]));
  const items=Array.from({length:n+2},(_,row)=>Array.from({length:n+1},(_,j):FlasherLabelText=>{
    const indices:FlasherLabelIndex=[row-1,j,0],resolvedPositionIndex=flasherLabelWrap(indices);
    return{head:'Text',content:{head:'Subscript',base:{head:'Style',value:u,style:'Bold'},indices},
      position:[...positions.get(resolvedPositionIndex.join(','))!] as FlasherLabelPoint,resolvedPositionIndex};
  }));
  return{schema:'origamica-flasher-all-vertices-labels-v1',query,source:{function:query.function,definitionCell:'In[4114]',definitionLines:[343348,343374],
    labelFunction:'FlasherVertexLabel',labelCell:'In[4111]',table:{i:[-1,n],j:[0,n],k:0},
    inputMeanings:{u:'label-string',v:'indexed-vector-coordinate-bindings',n:'first-sector-table-limit'},
    representation:'finite-numeric-original-Text-primitives',tableNesting:'i-outer-j-inner',originalStyle:'Black',
    originalGraphicOptions:[],symbolicVectorDomainComplete:false,wolframExecuted:false,solvedCreasePattern:false,paperCertification:false},
    data:{head:'Style',style:'Black',items}};
}
export function writeFlasherAllLabelsParameters(query:FlasherAllLabelsQuery):string{
  return JSON.stringify({format:'origamica-flasher-all-labels-parameters',version:1,query:readFlasherAllLabelsQuery(query)},null,2)+'\n';
}
export function readFlasherAllLabelsParameters(value:string):FlasherAllLabelsQuery{
  let raw:unknown;try{raw=JSON.parse(value);}catch{fail('标签参数 JSON 无效。');}
  if(!record(raw)||!keys(raw,'format,version,query')||raw.format!=='origamica-flasher-all-labels-parameters'||raw.version!==1)fail('请选择完整标签参数文件。');
  return readFlasherAllLabelsQuery(raw.query);
}
export function readFlasherAllLabelsResult(value:string):FlasherAllLabelsResult{
  let raw:unknown;try{raw=JSON.parse(value);}catch{fail('原标签图元 JSON 无效。');}
  if(!record(raw)||!keys(raw,'schema,query,source,data'))fail('原标签结果字段不完整。');
  const expected=flasherAllVerticesLabels(raw.query);
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):record(value)?
    Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  if(JSON.stringify(canonical(raw))!==JSON.stringify(canonical(expected)))fail('原标签结果与完整 Table／来源／绑定重算不符。');
  return expected;
}
