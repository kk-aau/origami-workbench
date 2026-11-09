import type {Point} from '../core/types';
import type {ModelLayerRegion} from './modelRegionLayers';

/** Rasterize each material once: independently antialiased decomposition cells
 * leave seams through which hidden paper shows. Nonzero subpaths share one fill
 * operation, while preserving holes, disconnected areas and exact boundaries.
 * Keep the original cells separately for face selection and layer diagnostics.
 */
export function modelRegionPaths(regions:ModelLayerRegion[],project:(p:Point)=>Point,fill:(region:ModelLayerRegion)=>string){
 const points=regions.flatMap(region=>region.polygon),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const extent=(values:number[])=>{let low=Infinity,high=-Infinity;for(const v of values){low=Math.min(low,v);high=Math.max(high,v);}return high-low;};
 // Every material uses the model's tolerance. A small selected or back-facing
 // patch must not reopen a seam already welded in the neighboring material.
 const epsilon=Math.max(1e-8,Math.max(extent(xs),extent(ys))*1e-10);
 const weld=(values:number[])=>{const map=new Map<number,number>();let last=-Infinity;for(const v of [...new Set(values)].sort((a,b)=>a-b)){if(v-last>epsilon)last=v;map.set(v,last);}return map;};
 const x=weld(xs),y=weld(ys),polygons=regions.map(region=>region.polygon.map(p=>[x.get(p[0])!,y.get(p[1])!] as Point));
 const groups=new Map<string,{fill:string;d:string;indices:number[];status:ModelLayerRegion['layers']['status']}>();
 regions.forEach((region,index)=>{
  const color=fill(region),key=region.layers.status+':'+color;
  let group=groups.get(key);
  if(!group){group={fill:color,d:'',indices:[],status:region.layers.status};groups.set(key,group);}
  group.indices.push(index);
 });
 return [...groups.values()].map(group=>({...group,d:surfaceOutline(group.indices.map(i=>polygons[i]),project)}));
}

/** Cancel internal cell edges, including T junctions on vertical slab boundaries.
 * This also avoids the residual single-pixel cracks that rasterizers can leave
 * when a compound path still contains oppositely directed internal edges.
 * Coordinates are welded only within the decomposition's geometric tolerance.
 */
function surfaceOutline(polygons:Point[][],project:(p:Point)=>Point):string{
 const key=(p:Point)=>p.join(','),coords=new Map<string,Point>();
 const edges=new Map<string,{a:string;b:string;count:number}>(),columns=new Map<number,Map<number,number>>();
 const edge=(a:Point,b:Point,count=1)=>{
  const ka=key(a),kb=key(b);if(ka===kb)return;coords.set(ka,a);coords.set(kb,b);
  const forward=ka<kb,k=forward?ka+'|'+kb:kb+'|'+ka,old=edges.get(k);
  if(old)old.count+=forward?count:-count;else edges.set(k,{a:forward?ka:kb,b:forward?kb:ka,count:forward?count:-count});
 };
 for(const polygon of polygons){
  const ps=[...polygon];
  const area=ps.reduce((sum,p,i)=>{const q=ps[(i+1)%ps.length];return sum+p[0]*q[1]-p[1]*q[0];},0);if(area<0)ps.reverse();
  ps.forEach((a,i)=>{const b=ps[(i+1)%ps.length];if(a[0]!==b[0]){edge(a,b);return;}
   let events=columns.get(a[0]);if(!events){events=new Map();columns.set(a[0],events);}events.set(a[1],(events.get(a[1])??0)+1);events.set(b[1],(events.get(b[1])??0)-1);
  });
 }
 for(const [vx,events] of columns){const breaks=[...events.keys()].sort((a,b)=>a-b);let winding=0;
  for(let i=0;i<breaks.length-1;i++){winding+=events.get(breaks[i])!;if(winding)edge([vx,breaks[i]],[vx,breaks[i+1]],winding);}
 }
 const outgoing=new Map<string,string[]>();
 // Welding at a near-degenerate junction can give an edge a winding magnitude
 // greater than one. Keeping only its sign breaks the balanced contour graph
 // and can drop an entire material. Preserve multiplicity for nonzero filling.
 for(const {a,b,count} of edges.values())if(count){const from=count>0?a:b,to=count>0?b:a,list=outgoing.get(from)??[];for(let i=0;i<Math.abs(count);i++)list.push(to);outgoing.set(from,list);}
 let d='';
 for(const [start,list] of outgoing)while(list.length){
  const loop:Point[]=[coords.get(start)!];let cursor=start;
  do{const next=outgoing.get(cursor)?.pop();if(next===undefined)throw new Error('局部纸面轮廓未闭合。');cursor=next;if(cursor!==start)loop.push(coords.get(cursor)!);}while(cursor!==start);
  if(loop.length>=3)d+='M'+loop.map(p=>project(p).join(',')).join('L')+'Z';
 }
 return d;
}
