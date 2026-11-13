import type {XY} from './baseDesign';
export interface CanvasNode extends XY {id:number;name:string}
export interface CanvasEdge {id:number;n1:number;n2:number;length:number}
export function indexDesignGraph(nodes:readonly CanvasNode[],edges:readonly CanvasEdge[]){
 const byId=new Map(nodes.map(node=>[node.id,node])),degree=new Map<number,number>();
 for(const edge of edges){degree.set(edge.n1,(degree.get(edge.n1)??0)+1);degree.set(edge.n2,(degree.get(edge.n2)??0)+1);}
 return {byId,degree};
}
export function pickDesignGraph(nodes:readonly CanvasNode[],edges:readonly CanvasEdge[],byId:ReadonlyMap<number,CanvasNode>,point:XY,nodeRadius:number,edgeRadius:number){
 let node:number|undefined,best=nodeRadius*nodeRadius;
 for(const item of nodes){const d=(item.x-point.x)**2+(item.y-point.y)**2;if(d<=best){best=d;node=item.id;}}
 if(node!==undefined)return {node};let edge:number|undefined;best=edgeRadius*edgeRadius;
 for(const item of edges){const a=byId.get(item.n1),b=byId.get(item.n2);if(!a||!b)continue;const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/l)):0,d=(a.x+t*dx-point.x)**2+(a.y+t*dy-point.y)**2;if(d<=best){best=d;edge=item.id;}}
 return {edge};
}
export interface DesignViewport {minX:number;maxX:number;minY:number;maxY:number}
/** Keep every geometry item. Only labels that would collide in screen space
 * are deferred until the camera reveals enough room; the active label wins. */
export function readableDesignLabels<T extends XY&{id:number}>(items:readonly T[],viewport:DesignViewport,cellWidth:number,cellHeight:number,active?:number){
 const occupied=new Set<string>(),result:T[]=[];let selected:T|undefined;
 for(const item of items){if(item.x<viewport.minX||item.x>viewport.maxX||item.y<viewport.minY||item.y>viewport.maxY)continue;if(item.id===active){selected=item;continue;}const key=`${Math.floor((item.x-viewport.minX)/cellWidth)},${Math.floor((item.y-viewport.minY)/cellHeight)}`;if(!occupied.has(key)){occupied.add(key);result.push(item);}}
 if(selected)result.push(selected);return result;
}
export function designListWindow(count:number,scrollTop:number,height:number,rowHeight=34,overscan=4){const start=Math.max(0,Math.min(Math.max(0,count-1),Math.floor(Math.max(0,scrollTop)/rowHeight)-overscan));return {start,end:Math.min(count,Math.max(start+1,Math.ceil((Math.max(0,scrollTop)+height)/rowHeight)+overscan))};}
export function designCirclePath(x:number,y:number,r:number){return `M${x-r} ${y}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0Z`;}
/** A single compound path with thousands of intersecting circles can take
 * seconds to rebuild inside the browser when selection changes its geometry.
 * Preserve every marker while bounding each native path tessellation. */
function chunkDesignPaths(paths:readonly string[],size:number){const result:string[]=[];for(let i=0;i<paths.length;i+=size)result.push(paths.slice(i,i+size).join(''));return result;}
export const chunkDesignMarkers=(paths:readonly string[])=>chunkDesignPaths(paths,128);
export const chunkDesignEdges=(paths:readonly string[])=>chunkDesignPaths(paths,512);
