import type {XY} from './tessellation';
import {tessGeometryError} from './tessellation';
export type PolygonVariant='general'|'centered'|'centered-angle'|'offset';

export type PolygonTileParams={family:'polygon-tile';polygon:XY[];width:number;centralTypes:('M'|'V')[]}&(
 {variant:'general';offset:number;tilt:number;ccw:boolean}|{variant:'centered';tilt:number}|{variant:'centered-angle';twistAngle:number}|{variant:'offset';offset:number}
);
export const POLYGON_VARIANTS:Record<PolygonVariant,string>={general:'一般 · 褶宽／偏置／褶角',centered:'居中 · 褶角','centered-angle':'居中 · 扭角',offset:'偏置 · 垂直褶线'};
export function polygonTileGeometryError(ps:XY[]):string{
 if(!Array.isArray(ps)||ps.length<3||ps.length>24||ps.some(p=>!Array.isArray(p)||p.length!==2||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||x< -10||x>10)))return '需要 3–24 个有限二维顶点，坐标须在 −10 至 10 之间。';
 const span=Math.max(...[0,1].map(k=>Math.max(...ps.map(p=>p[k]))-Math.min(...ps.map(p=>p[k]))));
 if(span<=0)return '轮廓不能退化成一个点。';
 const local=ps.map(p=>[(p[0]-ps[0][0])/span,(p[1]-ps[0][1])/span] as XY);
 return tessGeometryError(local,-1,1,[local.map((_,i)=>i)],true);
}
export function polygonTilePreset(variant:PolygonVariant='centered'):PolygonTileParams{
 const base={family:'polygon-tile' as const,polygon:[[0,0],[1,0],[1,1],[0,1]] as XY[],width:.3,centralTypes:Array(4).fill('M')};
 if(variant==='general')return {...base,variant,offset:0,tilt:70,ccw:true};
 if(variant==='offset')return {...base,variant,offset:.08};
 if(variant==='centered-angle')return {...base,variant,twistAngle:35};
 return {...base,variant,tilt:70};
}
export function readPolygonTileParams(raw:Record<string,unknown>):PolygonTileParams|null{
 const variant=raw.variant??'centered';if(typeof variant!=='string'||!Object.hasOwn(POLYGON_VARIANTS,variant))return null;
 const base=polygonTilePreset(variant as PolygonVariant) as unknown as Record<string,unknown>;
 if(Object.keys(raw).some(k=>!Object.hasOwn(base,k)))return null;
 Object.assign(base,structuredClone(raw));
 const number=(key:string,min:number,max:number)=>typeof base[key]==='number'&&Number.isFinite(base[key])&&(base[key] as number)>=min&&(base[key] as number)<=max;
 const ps=base.polygon as XY[];if(polygonTileGeometryError(ps))return null;
 if(!number('width',.05,.8)||!Array.isArray(base.centralTypes)||base.centralTypes.length!==ps.length||base.centralTypes.some(t=>t!=='M'&&t!=='V'))return null;
 if(('offset' in base&&!number('offset',-.4,.4))||('tilt' in base&&!number('tilt',1,179))||('twistAngle' in base&&!number('twistAngle',1,179))||('ccw' in base&&typeof base.ccw!=='boolean'))return null;
 if(Math.abs((base.offset as number)??0)+(base.width as number)/2>=.5-1e-8)return null;
 return base as unknown as PolygonTileParams;
}
