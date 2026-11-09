import {useId,useRef} from 'react';
import type {Point} from '../core/types';
import type {FlatTileDecorationMapping,FlatTileDecorationSource,VisibleTileRegion} from '../app/flatTileDecorations';
import {resolvedTileTilingStyle} from '../app/tileDecorations';
import {parseTileGraphicsSource,tileGraphicsPlacement,type TileGraphicsPrimitive} from '../app/tileGraphicsSource';
import {TileGraphicsPrimitives,useSvgScreenUnits} from './TileGraphicsPrimitives';

const near=(a:Point,b:Point,eps:number)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=eps;
function touches(point:Point,polygon:Point[],eps:number):boolean{
  return polygon.some((a,i)=>{
    const b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    return near(point,a,eps)||length>eps&&Math.abs(dx*(point[1]-a[1])-dy*(point[0]-a[0]))<=eps*length&&
      (point[0]-a[0])*dx+(point[1]-a[1])*dy>=-eps*length&&(point[0]-b[0])*dx+(point[1]-b[1])*dy<=eps*length;
  });
}

/** Render only verified topmost pieces of actual folded CP faces. Fill and
 * source edge arrows remain on the unfolded view: neither is a material-side
 * decoration with a proven physical mapping across interior pleats.
 */
export default function FlatTileDecorationLayer({source,mapping,foldedVertices,project}:{source:FlatTileDecorationSource;mapping:FlatTileDecorationMapping;foldedVertices:Point[];project:(point:Point)=>Point}){
  const id=useId().replace(/[^a-zA-Z0-9_-]/g,''),{tiles,options}=source,style=resolvedTileTilingStyle(options);
  const graphicsRef=useRef<SVGGElement>(null),graphicsUnits=useSvgScreenUnits(graphicsRef),graphicsCache=new Map<string,TileGraphicsPrimitive[]|null>();
  const placedGraphics=tiles.map(tile=>{
    const graphics=tile.decoration.graphics;if(!graphics)return null;
    const placement=tileGraphicsPlacement(graphics.frame,tile.points,tile.vertexIndices);if(!placement)return null;
    if(!graphicsCache.has(graphics.source))graphicsCache.set(graphics.source,parseTileGraphicsSource(graphics.source,style));
    const primitives=graphicsCache.get(graphics.source);return primitives?{placement,primitives}:null;
  });
  const visible=mapping.regions,xs=foldedVertices.map(p=>p[0]),ys=foldedVertices.map(p=>p[1]);
  const span=Math.max(1,Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)),units=Math.max(.3,span/160);
  const labels=new Map<number,VisibleTileRegion>();
  for(const region of visible)if(!labels.has(region.tile)||labels.get(region.tile)!.area<region.area)labels.set(region.tile,region);
  const vertexMarks=new Map<string,{region:VisibleTileRegion;point:Point;number:number}>();
  if(options.showVertexIndices)for(let tile=0;tile<tiles.length;tile++)for(let corner=0;corner<mapping.cornerIds[tile].length;corner++){
    const vertex=mapping.cornerIds[tile][corner],point=mapping.cornerPositions[tile][corner],number=tiles[tile].vertexIndices?.[corner]??(tiles[tile].vertexIndices?null:corner+1);
    if(number===null)continue;
    const candidates=visible.filter(region=>region.tile===tile&&mapping.cornerFaceIds[tile][corner].includes(region.topFace)&&touches(point,region.polygon,Math.max(1e-5,span*1e-5)));
    candidates.sort((a,b)=>b.area-a.area);
    if(candidates.length)vertexMarks.set(`${tile}:${corner}:${vertex}`,{region:candidates[0],point,number});
  }
  return <g ref={graphicsRef} data-flat-tile-decoration="verified" pointerEvents="none">
    <defs>{visible.map((region,index)=><clipPath id={`${id}-${index}`} key={index} clipPathUnits="userSpaceOnUse"><polygon points={region.polygon.map(point=>project(point).join(',')).join(' ')}/></clipPath>)}</defs>
    {visible.map((region,index)=>{
      const tile=tiles[region.tile],clip=`url(#${id}-${index})`,label=labels.get(region.tile)===region?tile.decoration.label:undefined;
      const defaultIndex=region.tile+1;
      const graphics=placedGraphics[region.tile],faceMap=mapping.faceMaps[region.topFace];
      return <g key={index} data-ff-visible-region={index} data-ff-top-face={region.topFace} data-ff-tile={region.tile} clipPath={clip}>
        {options.showEdges&&(region.boundarySegments??mapping.boundaryEdges[region.topFace].map(([a,b])=>[foldedVertices[a],foldedVertices[b]] as [Point,Point])).map(([a,b],edge)=>{
          const start=project(a),end=project(b);
          return <line key={edge} data-ff-folded-boundary={`${region.topFace}:${a}:${b}`} x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} stroke={style.lineColor} strokeWidth={options.tilingStyle?1:1.3*units} vectorEffect={options.tilingStyle?'non-scaling-stroke':undefined} strokeLinecap="round" strokeLinejoin="round"/>;
        })}
        {options.showTileIndices&&label!==null&&labels.get(region.tile)===region&&<text data-ff-tile-index={defaultIndex} x={project(region.center)[0]} y={project(region.center)[1]} textAnchor="middle" dominantBaseline="middle" fontSize={12*units} fill={style.textColor} stroke={options.tilingStyle?undefined:'#fff'} strokeWidth={options.tilingStyle?undefined:2.5*units} paintOrder={options.tilingStyle?undefined:'stroke'}>{label??defaultIndex}</text>}
        {[...vertexMarks.values()].filter(mark=>mark.region===region).map(mark=>{
          const point:Point=[mark.point[0]*.7+region.center[0]*.3,mark.point[1]*.7+region.center[1]*.3],p=project(point);
          return <text key={`${mark.number}:${mark.point.join(',')}`} data-ff-vertex-index={mark.number} x={p[0]} y={p[1]} textAnchor="middle" dominantBaseline="middle" fontSize={10*units} fill={style.textColor} stroke={options.tilingStyle?undefined:'#fff'} strokeWidth={options.tilingStyle?undefined:2.5*units} paintOrder={options.tilingStyle?undefined:'stroke'}>{mark.number}</text>;
        })}
        {graphics&&faceMap&&<TileGraphicsPrimitives primitives={graphics.primitives} placement={graphics.placement} map={point=>project(faceMap(point))} units={graphicsUnits}/>}
      </g>;
    })}
  </g>;
}
