import type {XY} from './tessellation';

export type SplitVariant='general'|'centered'|'centered-angle'|'offset'|'unit-offset';
type SplitBase={family:'split';width:number;baseVertex:number;connection:'M'|'V';centralTypes:('M'|'V')[]};
export type ExactSplitParams=SplitBase&(
  ({polygon:XY[]}&(
    {variant:'general';offset:number;tilt:number;ccw:boolean}|
    {variant:'centered';tilt:number}|
    {variant:'centered-angle';twistAngle:number}|
    {variant:'offset';offset:number}
  ))|
  {variant:'unit-offset';angles:[number,number,number];side:number;sideIndex:2|3|4;offset:number}
);
export const SPLIT_VARIANTS:Record<SplitVariant,string>={general:'一般分裂',centered:'居中 · 褶角','centered-angle':'居中 · 扭角',offset:'偏置分裂','unit-offset':'单位四边形 · 偏置分裂'};

/** Original unit quadrilateral: first side is 1, selected other side sets scale. */
export function unitQuadrilateralVertices(angles:readonly number[],side:number,sideIndex:number):XY[]|null{
  if((angles.length!==3&&angles.length!==4)||angles.slice(0,3).some(x=>!Number.isFinite(x)||x<1||x>179)
    ||(angles.length===4&&!Number.isFinite(angles[3]))||!Number.isFinite(side)||side<.05||side>5||![2,3,4].includes(sideIndex))return null;
  const [a1,a2,a3]=angles,final=360-a1-a2-a3;
  if(final<1||final>179)return null;
  const radians=Math.PI/180,direction=(a:number):XY=>[Math.cos(a),Math.sin(a)];
  const u2=direction(Math.PI-a2*radians),u3=direction(2*Math.PI-(a2+a3)*radians),u4=direction(a1*radians);
  const cross=(a:XY,b:XY)=>a[0]*b[1]-a[1]*b[0];
  const solve=(u:XY,v:XY,r:XY):[number,number]|null=>{const determinant=cross(u,v);return Math.abs(determinant)<1e-10?null:[cross(r,v)/determinant,cross(u,r)/determinant];};
  let s2:number,s3:number,s4:number;
  if(sideIndex===2){const solved=solve(u3,[-u4[0],-u4[1]],[-1-side*u2[0],-side*u2[1]]);if(!solved)return null;[s3,s4]=solved;s2=side;}
  else if(sideIndex===3){const solved=solve(u2,[-u4[0],-u4[1]],[-1-side*u3[0],-side*u3[1]]);if(!solved)return null;[s2,s4]=solved;s3=side;}
  else{const solved=solve(u2,u3,[-1+side*u4[0],side*u4[1]]);if(!solved)return null;[s2,s3]=solved;s4=side;}
  if(Math.min(s2,s3,s4)<1e-6||Math.max(s2,s3,s4)>10)return null;
  const polygon:XY[]=[[0,0],[1,0],[1+s2*u2[0],s2*u2[1]],[1+s2*u2[0]+s3*u3[0],s2*u2[1]+s3*u3[1]]];
  if(polygon.some(p=>p.some(x=>!Number.isFinite(x)||Math.abs(x)>10)))return null;
  const edges=polygon.map((p,i):XY=>[polygon[(i+1)%4][0]-p[0],polygon[(i+1)%4][1]-p[1]]);
  return edges.every((e,i)=>cross(e,edges[(i+1)%4])>1e-8)?polygon:null;
}

export function splitPreset(variant:SplitVariant='centered'):ExactSplitParams{
  const base={family:'split' as const,polygon:[[0,0],[1,0],[1.1,1.4],[-.2,1]] as XY[],width:.15,baseVertex:1,connection:'M' as const,centralTypes:Array<'M'|'V'>(4).fill('M')};
  if(variant==='unit-offset')return {family:'split',variant,width:.15,baseVertex:1,connection:'M',centralTypes:['M','V','V','M'],angles:[70,85,95],side:1,sideIndex:2,offset:.09};
  if(variant==='offset')return {...base,variant,polygon:[[0,0],[1,0],[.9,.8],[.2,1]],width:.14,baseVertex:0,offset:-.12,centralTypes:['M','M','V','V']};
  if(variant==='centered-angle')return {...base,variant,twistAngle:22.4};
  if(variant==='general')return {...base,variant,tilt:70,offset:0,ccw:true};
  return {...base,variant,tilt:70};
}
export function readSplitParams(raw:Record<string,unknown>):ExactSplitParams|null{
  const variant=raw.variant??'centered';if(typeof variant!=='string'||!Object.hasOwn(SPLIT_VARIANTS,variant))return null;
  const base=splitPreset(variant as SplitVariant) as unknown as Record<string,unknown>;
  if(Object.keys(raw).some(k=>!Object.hasOwn(base,k)))return null;
  Object.assign(base,structuredClone(raw));
  const number=(key:string,min:number,max:number,integer=false)=>typeof base[key]==='number'&&Number.isFinite(base[key])&&(base[key] as number)>=min&&(base[key] as number)<=max&&(!integer||Number.isInteger(base[key]));
  if(!number('width',.05,.8)||!number('baseVertex',0,3,true)||!['M','V'].includes(String(base.connection)))return null;
  if(!Array.isArray(base.centralTypes)||base.centralTypes.length!==4||base.centralTypes.some(t=>t!=='M'&&t!=='V'))return null;
  if(variant==='unit-offset'){
    if(!Array.isArray(base.angles)||(base.angles.length!==3&&base.angles.length!==4)||!number('side',.05,5)||!number('sideIndex',2,4,true)||!number('offset',-.4,.4)
      ||!unitQuadrilateralVertices(base.angles as number[],base.side as number,base.sideIndex as number))return null;
    base.angles=(base.angles as number[]).slice(0,3);
  }else{
    if(!Array.isArray(base.polygon)||base.polygon.length!==4||base.polygon.some(p=>!Array.isArray(p)||p.length!==2||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>10)))return null;
    const ps=base.polygon as XY[],crosses=ps.map((a,i)=>{const b=ps[(i+1)%4],c=ps[(i+2)%4];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});
    if(!crosses.every(v=>v>1e-8)&&!crosses.every(v=>v< -1e-8))return null;
  }
  if(('offset' in base&&!number('offset',-.4,.4))||('tilt' in base&&!number('tilt',1,179))||('twistAngle' in base&&!number('twistAngle',1,179))||('ccw' in base&&typeof base.ccw!=='boolean'))return null;
  if(Math.abs((base.offset as number)??0)+(base.width as number)/2>=.5-1e-8)return null;
  return base as unknown as ExactSplitParams;
}
