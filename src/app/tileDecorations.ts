import type {TessGraph,TileTwist,XY} from './tessellation';
import type {ExactSplitParams} from './splitParams';
import type {PolygonTileParams} from './polygonTileParams';
import type {BrocardParams} from './brocardParams';
import {parseTileColorExpression} from './tileColorExpressions';
import {parseTileLabelExpression} from './tileLabelExpressions';
import {readTileGraphicsSpec,type TileGraphicsSpec} from './tileGraphicsSource';

export type TileFill='none'|'M'|'V'|'W'|'O'|'light'|'medium'|'dark';
export type TileArrowStyle='none'|'DH'|'CH'|'DF'|'CF';
export type TileTilingColorName='textColor'|'lineColor'|'fillColor';
/** The SVG colors are authoritative; valid source expressions are retained for editing. */
export type TileTilingStyle={textColor:string;lineColor:string;fillColor:string;expressions?:Partial<Record<TileTilingColorName,string>>};
/** Origamica In[2784]: Darker[Brown,.8], Orange, Lighter[Brown]. */
export const ORIGAMICA_TILE_TILING_STYLE:TileTilingStyle={textColor:'#1f140a',lineColor:'#ff8000',fillColor:'#bb9977'};
/** Existing saved projects without a style retain their established workbench colors. */
export const DEFAULT_TILE_TILING_STYLE:TileTilingStyle={textColor:'#223c34',lineColor:'#273b33',fillColor:'#ccb399'};
export function resolvedTileTilingStyle(options:Pick<TileDecorations,'tilingStyle'>):TileTilingStyle{
  return options.tilingStyle??DEFAULT_TILE_TILING_STYLE;
}
/** Origamica TilingStyle uses Lighter[fill, .70/.50] for light/medium. */
export function lighterTileColor(color:string,amount:number):string{
  const rgb=[1,3,5].map(index=>Math.round(parseInt(color.slice(index,index+2),16)*(1-amount)+255*amount));
  return `#${rgb.map(value=>value.toString(16).padStart(2,'0')).join('')}`;
}
/** D follows the original TileEdgeArrowDirs: a direction mark without a fold assignment. M/V preserve older projects. */
export type TileArrowMark='D'|'M'|'V'|null;
/** TileIndex is a tile-local label in Origamica; omitted means the generated index, null suppresses it. */
export type TileDecoration={fill:TileFill;arrows:TileArrowMark[];arrowDirections?:number[];label?:string|null;labelExpression?:string;graphics?:TileGraphicsSpec};
export type TileDecorations={showPolys:boolean;showEdges:boolean;showVertexIndices:boolean;showTileIndices:boolean;overlayCreasePattern:boolean;overlayFoldedForm:boolean;arrowStyle:TileArrowStyle;tilingStyle?:TileTilingStyle;tiles:TileDecoration[]};
export type DecoratedTile={points:XY[];sourceIndex:number;decoration:TileDecoration;vertexIndices?:number[]};

/** TileEdgeArrowDirs is independent of M/V; absent directions retain the established M/V defaults. */
export function effectiveTileArrowDirections(tile:TileDecoration):number[]{
  return tile.arrows.map((type,index)=>tile.arrowDirections?.[index]??(type==='V'?-1:1));
}

export function defaultTileDecorations(faces:number[][]):TileDecorations{
  return {showPolys:false,showEdges:true,showVertexIndices:false,showTileIndices:false,overlayCreasePattern:false,overlayFoldedForm:false,arrowStyle:'none',tiles:faces.map(face=>({fill:'none',arrows:face.map(()=>null)}))};
}

/** A new Origamica decoration stores its source palette explicitly for project roundtrips. */
export function origamicaTileDecorations(faces:number[][]):TileDecorations{
  return {...defaultTileDecorations(faces),tilingStyle:{...ORIGAMICA_TILE_TILING_STYLE}};
}
export function readTileDecorations(value:unknown,faces:number[][]):TileDecorations|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>,keys=['showPolys','showEdges','showVertexIndices','showTileIndices'];
  if(keys.some(k=>typeof raw[k]!=='boolean')||[raw.overlayCreasePattern,raw.overlayFoldedForm].some(value=>value!==undefined&&typeof value!=='boolean')||!['none','DH','CH','DF','CF'].includes(String(raw.arrowStyle))||!Array.isArray(raw.tiles)||raw.tiles.length!==faces.length)return null;
  let tilingStyle:TileTilingStyle|undefined;
  if(raw.tilingStyle!==undefined){
    if(!raw.tilingStyle||typeof raw.tilingStyle!=='object'||Array.isArray(raw.tilingStyle))return null;
    const colors=raw.tilingStyle as Record<string,unknown>,names=['textColor','lineColor','fillColor'] as const;
    if(Object.keys(colors).some(name=>!names.includes(name as TileTilingColorName)&&name!=='expressions')||
       names.some(name=>typeof colors[name]!=='string'||!/^#[0-9a-fA-F]{6}$/.test(colors[name] as string)))return null;
    let expressions:TileTilingStyle['expressions'];
    if(colors.expressions!==undefined){
      if(!colors.expressions||typeof colors.expressions!=='object'||Array.isArray(colors.expressions))return null;
      const source=colors.expressions as Record<string,unknown>,keys=Object.keys(source);
      if(!keys.length||keys.some(name=>!names.includes(name as TileTilingColorName)||typeof source[name]!=='string'||
        parseTileColorExpression(source[name] as string)?.toLowerCase()!==(colors[name] as string).toLowerCase()))return null;
      expressions=source as TileTilingStyle['expressions'];
    }
    tilingStyle={textColor:colors.textColor as string,lineColor:colors.lineColor as string,fillColor:colors.fillColor as string,...(expressions?{expressions}:{})};
  }
  const tiles:TileDecoration[]=[];
  for(let i=0;i<faces.length;i++){
    const tile=raw.tiles[i];if(!tile||typeof tile!=='object'||Array.isArray(tile))return null;
    const entry=tile as Record<string,unknown>;
    if(!['none','M','V','W','O','light','medium','dark'].includes(String(entry.fill))||!Array.isArray(entry.arrows)||entry.arrows.length!==faces[i].length||entry.arrows.some(a=>a!==null&&a!=='D'&&a!=='M'&&a!=='V'))return null;
    if(entry.arrowDirections!==undefined&&(!Array.isArray(entry.arrowDirections)||entry.arrowDirections.length!==faces[i].length||entry.arrowDirections.some(x=>x!==-1&&x!==1)))return null;
    if(entry.label!==undefined&&entry.label!==null&&(typeof entry.label!=='string'||entry.label.length<1||entry.label.length>32||/[\x00-\x1f\x7f]/.test(entry.label)))return null;
    if(entry.labelExpression!==undefined){
      if(typeof entry.labelExpression!=='string')return null;
      const parsed=parseTileLabelExpression(entry.labelExpression);
      if(!parsed||parsed.label!==entry.label)return null;
    }
    const graphics=entry.graphics===undefined?undefined:readTileGraphicsSpec(entry.graphics,faces[i].length);
    if(entry.graphics!==undefined&&!graphics)return null;
    tiles.push({fill:entry.fill as TileFill,arrows:[...entry.arrows],...(entry.arrowDirections?{arrowDirections:[...entry.arrowDirections]}:{}),...(entry.label!==undefined?{label:entry.label as string|null}:{}),...(entry.labelExpression!==undefined?{labelExpression:entry.labelExpression as string}:{}),...(graphics?{graphics}:{})});
  }
  return {...Object.fromEntries(keys.map(k=>[k,raw[k]])) as Pick<TileDecorations,'showPolys'|'showEdges'|'showVertexIndices'|'showTileIndices'>,overlayCreasePattern:raw.overlayCreasePattern===true,overlayFoldedForm:raw.overlayFoldedForm===true,arrowStyle:raw.arrowStyle as TileArrowStyle,...(tilingStyle?{tilingStyle}:{}),tiles};
}

/** Specialized PolygonCentered/OffsetTwistTile Tiling decoration rules. */
export function twistTileDecorations(faces:number[][],twists:Pick<TileTwist,'offset'|'centralTypes'>[]):TileDecorations{
  return {showPolys:twists.some(t=>t.offset!==0),showEdges:true,showVertexIndices:false,showTileIndices:false,overlayCreasePattern:false,overlayFoldedForm:false,arrowStyle:'CF',tiles:faces.map((face,i)=>{
    const twist=twists[i],types=twist.centralTypes,sign=Math.sign(twist.offset)||1;
    const fill:TileFill=twist.offset===0?'none':new Set(types).size>1?'medium':(twist.offset>0&&types[0]==='M'||twist.offset<0&&types[0]==='V')?'dark':'light';
    return {fill,arrows:face.map((_,j)=>types[j]),arrowDirections:face.map((_,j)=>sign*(types[j]==='M'?1:-1))};
  })};
}

/** Original RenderTile delegates: centered/offset polygon and split tiles, plus cyclic Brocard offset. */
export function specializedTwistTileDecorations(params:ExactSplitParams|PolygonTileParams|BrocardParams):TileDecorations|null{
  if(params.family==='brocard'&&params.kind!=='cyclic-offset')return null;
  if('variant' in params&&params.variant==='general')return null;
  const types=params.centralTypes,offset='offset' in params?params.offset:0;
  return {...twistTileDecorations([types.map((_,i)=>i)],[{offset,centralTypes:types}]),tilingStyle:{...ORIGAMICA_TILE_TILING_STYLE}};
}

/** Keep original PolygonTile vertex/edge numbering after a mother tile is normalized to CCW. */
export function alignTileDecoration(points:XY[],source:XY[],decoration:TileDecoration):Pick<DecoratedTile,'decoration'|'vertexIndices'>{
  const n=source.length;
  if(points.length===n)for(let start=0;start<n;start++)for(const step of [1,-1]){
    const dx=points[0][0]-source[start][0],dy=points[0][1]-source[start][1];
    if(points.every((p,j)=>Math.abs(p[0]-source[(start+step*j+n*n)%n][0]-dx)<1e-7&&Math.abs(p[1]-source[(start+step*j+n*n)%n][1]-dy)<1e-7)){
      const vertex=(j:number)=>(start+step*j+n*n)%n;
      const edge=(j:number)=>step===1?vertex(j):(vertex(j)-1+n)%n;
      return {vertexIndices:points.map((_,j)=>vertex(j)+1),decoration:{...decoration,
        arrows:points.map((_,j)=>decoration.arrows[edge(j)]),
        arrowDirections:points.map((_,j)=>{
          const index=edge(j),type=decoration.arrows[index];
          return step*(decoration.arrowDirections?.[index]??(type==='V'?-1:1));
        })}};
    }
  }
  // An unmatched polygon cannot safely retain source-relative marks.
  return {vertexIndices:[],decoration:{...decoration,arrows:points.map(()=>null),arrowDirections:undefined}};
}

export function sourceDecoratedMotherTiles(mother:TessGraph,options:TileDecorations,vertices:XY[],faces:number[][]):DecoratedTile[]{
  return decoratedMotherTiles(mother,options,faces.length).map(tile=>({
    ...tile,...alignTileDecoration(tile.points,faces[tile.sourceIndex].map(i=>vertices[i]),tile.decoration),
  }));
}

/** Compatibility alias for the existing automatic twist decoration caller. */
export const twistDecoratedMotherTiles=sourceDecoratedMotherTiles;
export function decoratedMotherTiles(mother:TessGraph,options:TileDecorations,faceCount:number):DecoratedTile[]{
  const source=mother.zhezhi_custom_face_index;
  if(!source&&mother.faces_vertices.length!==faceCount)return [];
  return mother.faces_vertices.flatMap((face,i)=>{
    const sourceIndex=source?.[i]??i,decoration=options.tiles[sourceIndex];
    return decoration?[{points:mother.zhezhi_custom_polygons?.[i]??face.map(j=>mother.vertices_coords[j]),sourceIndex,decoration}]:[];
  });
}

function paperOutline(graph:TessGraph):XY[]|null{
  const adjacent=new Map<number,number[]>();
  graph.edges_vertices.forEach(([a,b],i)=>{
    if(graph.edges_assignment[i]!=='B')return;
    adjacent.set(a,[...(adjacent.get(a)??[]),b]);adjacent.set(b,[...(adjacent.get(b)??[]),a]);
  });
  if(adjacent.size<3||[...adjacent.values()].some(neighbors=>neighbors.length!==2))return null;
  const start=adjacent.keys().next().value as number,seen=new Set<number>(),order:number[]=[];
  let previous=-1,current=start;
  do{
    if(seen.has(current))return null;
    seen.add(current);order.push(current);
    const next=adjacent.get(current)!.find(vertex=>vertex!==previous);
    if(next===undefined)return null;
    previous=current;current=next;
  }while(current!==start&&order.length<=adjacent.size);
  if(current!==start||order.length!==adjacent.size)return null;
  return order.map(index=>graph.vertices_coords[index]);
}

function pointOnEdge(p:XY,a:XY,b:XY,tolerance:number):boolean{
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  return length>tolerance&&Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))<=tolerance*length&&
    (p[0]-a[0])*dx+(p[1]-a[1])*dy>=-tolerance*length&&
    (p[0]-b[0])*dx+(p[1]-b[1])*dy<=tolerance*length;
}

function insidePaper(point:XY,outline:XY[],tolerance:number):boolean{
  let inside=false;
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length];
    if(pointOnEdge(point,a,b,tolerance))return true;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

function tileInsidePaper(points:XY[],outline:XY[],tolerance:number):boolean{
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    if(!insidePaper(a,outline,tolerance)||!insidePaper([(a[0]+b[0])/2,(a[1]+b[1])/2],outline,tolerance))return false;
    for(let j=0;j<outline.length;j++){
      const c=outline[j],d=outline[(j+1)%outline.length];
      const ux=b[0]-a[0],uy=b[1]-a[1],vx=d[0]-c[0],vy=d[1]-c[1],denom=ux*vy-uy*vx;
      if(Math.abs(denom)<=tolerance*Math.max(1,Math.hypot(ux,uy),Math.hypot(vx,vy)))continue;
      const wx=c[0]-a[0],wy=c[1]-a[1],t=(wx*vy-wy*vx)/denom,u=(wx*uy-wy*ux)/denom;
      if(t>tolerance&&t<1-tolerance&&u>=-tolerance&&u<=1+tolerance)return false;
    }
  }
  return true;
}

/** Convert a mother overlay into tessDocument's CP frame, only within its actual B boundary. */
export function reframeTileDecorations(tiles:DecoratedTile[],mother:TessGraph,fold:TessGraph):DecoratedTile[]|null{
  const frame=(graph:TessGraph)=>{
    const points=graph.vertices_coords;
    if(!points.length||points.some(p=>p.length!==2||!p.every(Number.isFinite)))return null;
    const minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1]));
    const width=Math.max(...points.map(p=>p[0]))-minX,height=Math.max(...points.map(p=>p[1]))-minY;
    const span=Math.max(width,height);
    return span>1e-8?{minX,minY,width,height,scale:200/span}:null;
  };
  const source=frame(mother),target=frame(fold),outline=paperOutline(fold);
  if(!source||!target||!outline)return null;
  const projected:DecoratedTile[]=[];
  for(const tile of tiles){
    const points:XY[]=[],world:XY[]=[];
    for(const [x,y] of tile.points){
      const worldX=source.minX+x/source.scale,worldY=source.minY+y/source.scale;
      const tolerance=1e-7*Math.max(1,target.width,target.height);
      if(!Number.isFinite(worldX)||!Number.isFinite(worldY)||
         worldX<target.minX-tolerance||worldX>target.minX+target.width+tolerance||
         worldY<target.minY-tolerance||worldY>target.minY+target.height+tolerance)return null;
      world.push([worldX,worldY]);
      points.push([(worldX-target.minX)*target.scale,(worldY-target.minY)*target.scale]);
    }
    if(!tileInsidePaper(world,outline,1e-7*Math.max(1,target.width,target.height)))return null;
    projected.push({...tile,points});
  }
  return projected;
}

/** Arrow geometry in polygon coordinates, scaled to a short mark on the edge. */
export function tileArrowSegments(a:XY,b:XY,type:'M'|'V',style:TileArrowStyle,maxSize=Infinity,directionSign?:number):[XY,XY][]{
  if(style==='none')return [];
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<1e-8)return [];
  const u:XY=[dx/length,dy/length],left:XY=[-u[1],u[0]],sign=directionSign??(type==='M'?1:-1);
  const size=Math.min(length*.16,maxSize),mid:XY=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const point=(parallel:number,normal:number):XY=>[mid[0]+u[0]*parallel+left[0]*normal,mid[1]+u[1]*parallel+left[1]*normal];
  const crossing=style[0]==='C',half=style[1]==='H';
  const tip=crossing?point(0,sign>0?(half?0:-size/2):(half?size:size/2)):point(sign*size*.6,0);
  const tail=crossing?point(0,sign>0?(half?size:size/2):(half?0:-size/2)):point(-sign*size*.6,0);
  const direction:XY=[(tip[0]-tail[0])/Math.hypot(tip[0]-tail[0],tip[1]-tail[1]),(tip[1]-tail[1])/Math.hypot(tip[0]-tail[0],tip[1]-tail[1])];
  const side:XY=[-direction[1],direction[0]],wing=size*.43,back=size*.52;
  const halfSide=half&&!crossing?left:side;
  const leftWing:XY=[tip[0]-direction[0]*back+halfSide[0]*wing,tip[1]-direction[1]*back+halfSide[1]*wing];
  const rightWing:XY=[tip[0]-direction[0]*back-side[0]*wing,tip[1]-direction[1]*back-side[1]*wing];
  return half?[[tail,tip],[leftWing,tip]]:[[tail,tip],[leftWing,tip],[rightWing,tip]];
}

/** Origamica In[2836/2838/2840/2842]: arrows are filled triangles scaled by the entire edge vector. */
export function originalTileArrowPolygon(a:XY,b:XY,style:TileArrowStyle,direction:number,sourceStep:1|-1=1):XY[]{
  if(style==='none')return [];
  if(sourceStep===-1)return originalTileArrowPolygon(b,a,style,-direction);
  const r:XY=[b[0]-a[0],b[1]-a[1]];
  if(Math.hypot(...r)<1e-8)return [];
  // Use the source edge orientation for the CCW wing of half arrows.
  const s:XY=[-r[1],r[0]];
  const sz=style[1]==='H'?.15:.18,w=style==='DH'?.58:.3;
  let offsets:[number,number][];
  if(style==='DH')offsets=direction>0?[[-.5,0],[.5,0],[-.5,w]]:[[.5,0],[-.5,0],[.5,w]];
  else if(style==='CH')offsets=direction>0?[[0,0],[w,1],[-w,1]]:[[-w,0],[w,0],[0,1]];
  else if(style==='DF')offsets=direction>0?[[-.5,-w],[.5,0],[-.5,w]]:[[.5,-w],[-.5,0],[.5,w]];
  else offsets=direction>0?[[0,-.5],[w,.5],[-w,.5]]:[[-w,-.5],[w,-.5],[0,.5]];
  const mid:XY=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  return offsets.map(([parallel,normal])=>[mid[0]+sz*(parallel*r[0]+normal*s[0]),mid[1]+sz*(parallel*r[1]+normal*s[1])]);
}
