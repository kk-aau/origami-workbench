import {apiWhenIdle} from './api';
import type {XY} from './tessellation';

export type PotGraphicsColor='None'|'White'|'Black'|{RGBColor:[number,number,number]};
export type PotGraphicsOptions={Axes?:boolean|[boolean,boolean];AxesOrigin?:XY;Frame?:boolean;
  PlotRange?:'All'|[XY,XY];AspectRatio?:'Automatic'|number;ImageSize?:number|XY;Background?:PotGraphicsColor};
export type PotCrossSectionQuery={family:'pot-cross-section-native';points:XY[];graphicsOptions:PotGraphicsOptions};
export type PotCrossSectionResult={schema:'origamica-pot-cross-section-graphics-v1';query:PotCrossSectionQuery;
  source:{function:'PotCrossSectionGraphics';definitionCell:'In[3458]';definitionLines:[261319,261359];referenceOrigin:XY;
    originalPrimitiveOrder:string[];forwardedGraphicsRules:{option:string;value:unknown}[];finiteGraphicsOptions:string[];
    allOriginalLineCoordinatesPreserved:true;fullOptionsGraphicsReproduced:false;mathematicaDefaultRenderingReproduced:false;wolframExecuted:false};
  data:{head:'Graphics';primitives:[{head:'Line';points:XY[]},{head:'Line';points:XY[]}];options:PotGraphicsOptions}};
export const POT_GRAPHICS_OPTIONS=['Axes','AxesOrigin','Frame','PlotRange','AspectRatio','ImageSize','Background'] as const;
const number=(v:unknown,lo:number,hi:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const point=(v:unknown):v is XY=>Array.isArray(v)&&v.length===2&&v.every(n=>number(n,-1e6,1e6));

export function readPotGraphicsOptions(value:unknown):PotGraphicsOptions|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  for(const [name,v] of Object.entries(value)){
    if(!POT_GRAPHICS_OPTIONS.includes(name as typeof POT_GRAPHICS_OPTIONS[number]))return null;
    const valid=name==='Axes'?typeof v==='boolean'||Array.isArray(v)&&v.length===2&&v.every(x=>typeof x==='boolean'):
      name==='AxesOrigin'?point(v):name==='Frame'?typeof v==='boolean':
      name==='PlotRange'?v==='All'||Array.isArray(v)&&v.length===2&&v.every(p=>point(p)&&p[1]-p[0]>=1e-9):
      name==='AspectRatio'?v==='Automatic'||number(v,.05,20):
      name==='ImageSize'?number(v,20,1200)||Array.isArray(v)&&v.length===2&&v.every(n=>number(n,20,1200)):
      ['None','White','Black'].includes(v as string)||!!v&&typeof v==='object'&&!Array.isArray(v)&&
        Object.keys(v).join(',')==='RGBColor'&&Array.isArray((v as any).RGBColor)&&(v as any).RGBColor.length===3&&(v as any).RGBColor.every((n:unknown)=>number(n,0,1));
    if(!valid)return null;
  }
  return structuredClone(value) as PotGraphicsOptions;
}

export function readPotCrossSectionQuery(value:unknown):PotCrossSectionQuery|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const r=value as Record<string,unknown>,points=r.points,options=readPotGraphicsOptions(r.graphicsOptions??{});
  if(r.family!=='pot-cross-section-native'||Object.keys(r).some(k=>!['family','points','graphicsOptions'].includes(k))||
    !Array.isArray(points)||points.length<1||points.length>512||!points.every(point)||!options)return null;
  return{family:'pot-cross-section-native',points:structuredClone(points),graphicsOptions:options};
}

/** Independent literal scalar subtraction and diagonal reflection, with full Line order. */
export function potCrossSectionReference(query:PotCrossSectionQuery):PotCrossSectionResult{
  const q=readPotCrossSectionQuery(query);if(!q)throw Error('原对称剖面输入或Graphics有限选项无效。');
  const origin=q.points[0],first=q.points.map(([x,y])=>[x-origin[0],y-origin[1]] as XY),second=first.map(([x,y])=>[-x,y] as XY);
  return{schema:'origamica-pot-cross-section-graphics-v1',query:q,
    source:{function:'PotCrossSectionGraphics',definitionCell:'In[3458]',definitionLines:[261319,261359],referenceOrigin:structuredClone(origin),
      originalPrimitiveOrder:['Line[pts1]','Line[({-1,1}#)&/@pts1]'],
      forwardedGraphicsRules:Object.entries(q.graphicsOptions).map(([option,value])=>({option,value:structuredClone(value)})),
      finiteGraphicsOptions:[...POT_GRAPHICS_OPTIONS],allOriginalLineCoordinatesPreserved:true,
      fullOptionsGraphicsReproduced:false,mathematicaDefaultRenderingReproduced:false,wolframExecuted:false},
    data:{head:'Graphics',primitives:[{head:'Line',points:first},{head:'Line',points:second}],options:structuredClone(q.graphicsOptions)}};
}

export function readPotCrossSectionResult(raw:unknown,query:PotCrossSectionQuery):PotCrossSectionResult{
  const expected=potCrossSectionReference(query),same=(a:unknown,b:any):boolean=>typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&a===b:
    Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v)):
    b&&typeof b==='object'?!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).sort().join(',')===Object.keys(b).sort().join(',')&&Object.entries(b).every(([k,v])=>same((a as any)[k],v)):a===b;
  if(!same(raw,expected))throw Error('原两条Line、首点平移、镜像、Graphics顺序或来源独立回读失败。');
  return raw as PotCrossSectionResult;
}
export async function fetchPotCrossSection(query:PotCrossSectionQuery,signal?:AbortSignal){
  return readPotCrossSectionResult(await apiWhenIdle('tessellation/pot-cross-section-graphics',query,signal),query);
}

export type PotGraphicsView={range:[XY,XY];aspectRatio:number;width:number;height:number;
  content:{x:number;y:number;width:number;height:number};axes:[boolean,boolean];axesOrigin:XY;frame:boolean;background:string};
export function potGraphicsView(result:PotCrossSectionResult):PotGraphicsView{
  const options=result.data.options,points=result.data.primitives.flatMap(p=>p.points),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  let range:[XY,XY]=Array.isArray(options.PlotRange)?structuredClone(options.PlotRange):[[Math.min(...xs),Math.max(...xs)],[Math.min(...ys),Math.max(...ys)]];
  // Degenerate Line coordinates remain untouched; only a finite viewer window expands.
  if(!Array.isArray(options.PlotRange))range=range.map(([lo,hi])=>
    hi-lo<1e-12*Math.max(1,Math.abs(lo),Math.abs(hi))?[lo-.5,hi+.5]:[lo,hi]) as [XY,XY];
  const ratio=typeof options.AspectRatio==='number'?options.AspectRatio:(range[1][1]-range[1][0])/(range[0][1]-range[0][0]);
  const size=options.ImageSize;
  const width=Array.isArray(size)?size[0]:typeof size==='number'?size:Math.min(300,150/ratio);
  const height=Array.isArray(size)?size[1]:width*ratio,contentWidth=Math.min(width,height/ratio),contentHeight=contentWidth*ratio;
  const background=options.Background??'None';
  return{range,aspectRatio:ratio,width,height,content:{x:(width-contentWidth)/2,y:(height-contentHeight)/2,width:contentWidth,height:contentHeight},
    axes:Array.isArray(options.Axes)?options.Axes:[!!options.Axes,!!options.Axes],axesOrigin:options.AxesOrigin??[0,0],frame:!!options.Frame,
    background:typeof background==='string'?background==='None'?'transparent':background.toLowerCase():`rgb(${background.RGBColor.map(v=>v*255).join(',')})`};
}

/** SVG keeps both complete original point sequences; PlotRange clips only its viewport. */
export function potCrossSectionSVG(result:PotCrossSectionResult):string{
  const v=potGraphicsView(result),[[xmin,xmax],[ymin,ymax]]=v.range,c=v.content;
  const axes=(v.axes[0]?`<line data-graphics-option="Axes-x" x1="${xmin}" y1="${v.axesOrigin[1]}" x2="${xmax}" y2="${v.axesOrigin[1]}" vector-effect="non-scaling-stroke"/>`:'')+
    (v.axes[1]?`<line data-graphics-option="Axes-y" x1="${v.axesOrigin[0]}" y1="${ymin}" x2="${v.axesOrigin[0]}" y2="${ymax}" vector-effect="non-scaling-stroke"/>`:'');
  const lines=result.data.primitives.map((p,i)=>`<polyline data-original-head="Line" data-original-index="${i}" points="${p.points.map(x=>x.join(',')).join(' ')}" fill="none" stroke="currentColor" vector-effect="non-scaling-stroke"/>`).join('');
  return`<svg xmlns="http://www.w3.org/2000/svg" width="${v.width}pt" height="${v.height}pt" viewBox="0 0 ${v.width} ${v.height}" style="background:${v.background};color:#202124" aria-label="原对称剖面"><svg x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" viewBox="${xmin} ${-ymax} ${xmax-xmin} ${ymax-ymin}" preserveAspectRatio="none" overflow="hidden"><g transform="scale(1,-1)" fill="none" stroke="#81918b" vector-effect="non-scaling-stroke">${axes}${lines}</g></svg>${v.frame?`<rect data-graphics-option="Frame" x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" fill="none" stroke="#202124"/>`:''}</svg>`;
}
