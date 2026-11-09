import type {FlatFoldResult,Point} from '../core/types';
export function modelFaceRings(result:FlatFoldResult,f:number){return [result.geometry.faces[f],...(result.geometry.graph?.faces_holes?.[f]??[])];}
export function modelFaceContains(result:FlatFoldResult,f:number,p:Point,vertices=result.geometry.vertices){
 const inside=(r:number[])=>{let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=vertices[r[j]],b=vertices[r[i]];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
 const rs=modelFaceRings(result,f);return inside(rs[0])&&!rs.slice(1).some(inside);
}
export function modelFacePath(result:FlatFoldResult,f:number,vertices=result.geometry.vertices){return modelFaceRings(result,f).map(r=>r.map((v,i)=>`${i?'L':'M'}${vertices[v].join(',')}`).join(' ')+' Z').join(' ');}
