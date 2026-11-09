import type {FoldGraph,Point} from './types';
import {materialPointInside,materialOrientation} from './materialTraceGeometry';
export function materialFaceRings(g:FoldGraph,f:number){return [g.faces_vertices![f],...(g.faces_holes?.[f]??[])];}
export function materialFaceEdgeRings(g:FoldGraph,f:number){return [g.faces_edges![f],...(g.faces_holeEdges?.[f]??[])];}
export function materialFaceVertices(g:FoldGraph,f:number){return materialFaceRings(g,f).flat();}
export function materialFaceEdges(g:FoldGraph,f:number){return materialFaceEdgeRings(g,f).flat();}
export function materialFaceInside(g:FoldGraph,f:number,p:Point){const rings=materialFaceRings(g,f).map(r=>r.map(v=>g.vertices_coords[v]));return materialPointInside(p,rings[0])&&!rings.slice(1).some(r=>materialPointInside(p,r)||r.some((a,i)=>{const b=r[(i+1)%r.length];return !materialOrientation(a,b,p)&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);}));}
/** Generate a view/export path. Ring geometry stays indexed, without bridges. */
export function materialFacePath(g:FoldGraph,f:number,point:(p:Point)=>Point=p=>p){return materialFaceRings(g,f).map(r=>r.map((v,i)=>`${i?'L':'M'}${point(g.vertices_coords[v]).join(',')}`).join(' ')+' Z').join(' ');}
export function materialHoles(g:FoldGraph){return g.faces_vertices!.map((_,f)=>(g.faces_holes?.[f]??[]).map(r=>[...r]));}
export function materialHoleEdges(g:FoldGraph){return g.faces_vertices!.map((_,f)=>(g.faces_holeEdges?.[f]??[]).map(r=>[...r]));}
