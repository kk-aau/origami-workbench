import type {TessResult,XY} from './tessellation';
import {readWovenFullEdgeInsets,type WovenFullEdgeInsets,type WovenSegmentInset} from './wovenParams';

export type WovenInsetEdge={edge:number;line:number;from:XY;to:XY;current:number;base:number};
export function wovenInsetEdges(result:TessResult):WovenInsetEdge[]{
 const graph=result.mother,owners=result.source.edgeLines,widths=result.source.edgeWidths,lines=result.source.lines,effective=result.source.effectiveEdgeInsets;
 if(!graph||!Array.isArray(owners)||!Array.isArray(widths)||owners.length!==graph.edges_vertices.length||widths.length!==owners.length)return [];
 return graph.edges_vertices.map(([a,b],edge)=>{
  const line=owners[edge],width=widths[edge],from=graph.vertices_coords[a],to=graph.vertices_coords[b];
  const base=line<0?Number(result.source.borderInset??0):result.source.graph?Number(result.source.defaultInset):Array.isArray(lines)&&Array.isArray(lines[line])?lines[line][2]/2:width/2;
  return {edge,line,from,to,current:Array.isArray(effective)?Number(effective[edge]):line<0?base:width/2,base};
 });
}

export function wovenInsetStampMatches(item:WovenSegmentInset,edge:WovenInsetEdge,tolerance=1e-7):boolean{
 return item.line===edge.line&&Math.min(Math.max(Math.hypot(item.from[0]-edge.from[0],item.from[1]-edge.from[1]),Math.hypot(item.to[0]-edge.to[0],item.to[1]-edge.to[1])),
  Math.max(Math.hypot(item.from[0]-edge.to[0],item.from[1]-edge.to[1]),Math.hypot(item.to[0]-edge.from[0],item.to[1]-edge.from[1])))<=tolerance;
}
export function wovenFullInsetsMatch(source:WovenFullEdgeInsets,edges:WovenInsetEdge[],graphMode=false):boolean{
 if(!readWovenFullEdgeInsets(source,graphMode)||source.edgeCount!==edges.length)return false;
 const coords=edges.flatMap(e=>[e.from,e.to]),span=Math.max(...[0,1].map(k=>Math.max(...coords.map(p=>p[k]))-Math.min(...coords.map(p=>p[k]))));
 const magnitude=Math.max(...coords.flat().map(Math.abs));
 const ulp=magnitude?2**(Math.floor(Math.log2(magnitude))-52):Number.MIN_VALUE;
 return source.entries.every((item,i)=>wovenInsetStampMatches(item,edges[i],1e-9*span+16*ulp));
}
export function makeWovenFullInsets(edges:WovenInsetEdge[],values:Record<number,string>={}):WovenFullEdgeInsets{
 return {edgeCount:edges.length,entries:edges.map(e=>({edge:e.edge,line:e.line,from:[...e.from],to:[...e.to],inset:Number(values[e.edge]??e.current)}))};
}
