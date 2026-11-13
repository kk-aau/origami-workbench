import {newBaseDesign,treeRemoveLeaf,validateBaseDesign,type BaseDesignProject,type TreeDesign,type XY} from './baseDesign';

export type DesignView='tree'|'packing'|'cp';
export interface DesignSelection {nodes:number[];edges:number[]}
export const emptyDesignSelection=():DesignSelection=>({nodes:[],edges:[]});
export interface DesignCamera {x:number;y:number;zoom:number}
export const defaultDesignCamera=():DesignCamera=>({x:0,y:0,zoom:1});
export type DesignEditCommand=Record<string,unknown>&{type:string};
export const designNodes=(p:BaseDesignProject)=>p.kind==='tree'?p.model.nodes.map(n=>({id:n.id,name:n.label,...n.loc})):p.model.design.tree.nodes;
export const designEdges=(p:BaseDesignProject)=>p.kind==='tree'?p.model.edges.map(e=>({id:e.id,n1:e.nodes[0],n2:e.nodes[1],length:e.length})):p.model.design.tree.edges.map((e,id)=>({...e,id}));

export function blankBaseDesign(kind:'tree'|'box'):BaseDesignProject {
 const p=newBaseDesign(kind);
 if(p.kind==='tree')return {...p,model:{...p.model,nodes:[],edges:[],conditions:[]}};
 return {...p,model:{...p.model,design:{...p.model.design,tree:{...p.model.design.tree,nodes:[],edges:[]},layout:{...p.model.design.layout,flaps:[],stretches:[]}}}};
}
export function toggleDesignSelection(selection:DesignSelection,type:'node'|'edge',id:number,extend:boolean):DesignSelection {
 if(!extend)return type==='node'?{nodes:[id],edges:[]}:{nodes:[],edges:[id]};
 const key=type==='node'?'nodes':'edges',items=selection[key];
 return {...selection,[key]:items.includes(id)?items.filter(n=>n!==id):[...items,id]};
}
export function moveTreeNodes(model:TreeDesign,positions:{id:number;x:number;y:number}[]):TreeDesign {
 const points=new Map(positions.map(p=>[p.id,{x:p.x,y:p.y}]));
 return {...model,nodes:model.nodes.map(n=>points.has(n.id)?{...n,loc:points.get(n.id)!}:n),
  // A manual move establishes a new anchor. A later optimizer must not jump
  // back to the coordinates at which the pin was first created.
  conditions:model.conditions.map(c=>{const point=points.get(c.node as number);return point&&(c.type==='node_fixed'||c.type==='node_combo')?{...c,...(c.x_fixed?{x_fix_value:point.x}:{}),...(c.y_fixed?{y_fix_value:point.y}:{})}:c;})};
}
export function addTreeNode(model:TreeDesign,parent:number|null,point:XY,length:number):TreeDesign {
 const id=model.nodes.length+1;
 if(model.nodes.length&&!model.nodes.some(n=>n.id===parent))throw Error('先选择一个节点，再点击空白处延伸分支。');
 return {...model,nodes:[...model.nodes,{id,label:'',loc:point}],edges:parent===null?model.edges:[...model.edges,{id:model.edges.length+1,label:'',nodes:[parent,id],length,strain:0,stiffness:1}]};
}
export function addDesignNode(project:BaseDesignProject,parent:number|null,point:XY,length:number):BaseDesignProject {
 if(project.kind==='tree')return {...project,model:addTreeNode(project.model,parent,point,length)};
 const d=project.model.design,id=d.tree.nodes.reduce((max,n)=>Math.max(max,n.id),-1)+1;
 if(d.tree.nodes.length&&!d.tree.nodes.some(n=>n.id===parent))throw Error('先选择连接节点。');
 const nodes=[...d.tree.nodes,{id,name:'',...point}],edges=parent===null?d.tree.edges:[...d.tree.edges,{n1:parent,n2:id,length}];
 const leafIds=new Set(nodes.filter(n=>edges.filter(e=>e.n1===n.id||e.n2===n.id).length===1).map(n=>n.id));
 const flaps=d.layout.flaps.filter(f=>leafIds.has(f.id));
 for(const n of nodes)if(leafIds.has(n.id)&&!flaps.some(f=>f.id===n.id))flaps.push({id:n.id,x:Math.max(0,Math.min(d.layout.sheet.width,Math.round(n.x/d.tree.sheet.width*d.layout.sheet.width))),y:Math.max(0,Math.min(d.layout.sheet.height,Math.round(n.y/d.tree.sheet.height*d.layout.sheet.height))),width:0,height:0});
 return {...project,model:{...project.model,design:{...d,tree:{...d.tree,nodes,edges},layout:{...d.layout,flaps,stretches:[]}}}};
}
export function splitTreeEdge(model:TreeDesign,id:number):TreeDesign {
 const edge=model.edges.find(e=>e.id===id);if(!edge)throw Error('请选择要拆分的分支。');
 const a=model.nodes.find(n=>n.id===edge.nodes[0])!,b=model.nodes.find(n=>n.id===edge.nodes[1])!,node=model.nodes.length+1;
 return {...model,nodes:[...model.nodes,{id:node,label:'',loc:{x:(a.loc.x+b.loc.x)/2,y:(a.loc.y+b.loc.y)/2}}],
  edges:[...model.edges.map(e=>e.id===id?{...e,nodes:[e.nodes[0],node] as [number,number],length:e.length/2}:e),{...edge,id:model.edges.length+1,nodes:[node,edge.nodes[1]],length:edge.length/2}],
  conditions:model.conditions.filter(c=>!Object.entries(c).some(([key,v])=>/^edge[12]?$/.test(key)&&v===id))};
}
export function deleteTreeSelection(model:TreeDesign,ids:number[]):TreeDesign {
 if(!ids.length)return model;
 if(ids.length===model.nodes.length)return {...model,nodes:[],edges:[],conditions:[]};
 // Work in original ids; remapping after each deletion must not select a
 // different vertex when a former internal vertex becomes a leaf.
 let next=model;let original=next.nodes.map(n=>n.id),pending=new Set(ids);
 while(pending.size){let removed=false;for(const id of [...pending]){
  const index=original.indexOf(id);if(index<0){pending.delete(id);continue;}
  const current=index+1;
  if(next.edges.filter(e=>e.nodes.includes(current)).length===1){
   next=next.nodes.length===2?{...next,nodes:next.nodes.filter(n=>n.id!==current).map(n=>({...n,id:1})),edges:[],conditions:[]}:treeRemoveLeaf(next,current);
   original=original.filter(n=>n!==id);pending.delete(id);removed=true;
  }
 }
 if(!removed)throw Error('只能删除叶节点或完整的末端分支；若要保留两侧连接，请在分支上插入节点。');}
 return next;
}
export function designSubtree(project:BaseDesignProject,id:number):number[] {
 const nodes=designNodes(project),edges=designEdges(project),root=nodes[0]?.id;if(root===undefined)return [];
 const parent=new Set<number>([root]),todo=[root],adjacent=new Map<number,number[]>(),children=new Map<number,number[]>();
 for(const edge of edges){if(!adjacent.has(edge.n1))adjacent.set(edge.n1,[]);if(!adjacent.has(edge.n2))adjacent.set(edge.n2,[]);adjacent.get(edge.n1)!.push(edge.n2);adjacent.get(edge.n2)!.push(edge.n1);}
 while(todo.length){const n=todo.pop()!;for(const other of adjacent.get(n)??[])if(!parent.has(other)){parent.add(other);todo.push(other);if(!children.has(n))children.set(n,[]);children.get(n)!.push(other);}}
 const selected=[id];for(let i=0;i<selected.length;i++)for(const child of children.get(selected[i])??[])selected.push(child);
 return selected;
}
/** One common displacement preserves the shape of a selected group. */
export function constrainDesignDelta(points:XY[],delta:XY,width:number,height:number):XY {
 if(!points.length)return delta;
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
 return {x:Math.max(-minX,Math.min(width-maxX,delta.x))||0,y:Math.max(-minY,Math.min(height-maxY,delta.y))||0};
}
export function designProjectFromResult(source:BaseDesignProject,model:unknown):BaseDesignProject {
 return validateBaseDesign({...source,model});
}

/** Latest-only preview channel. A release always gets its own final solve;
 * previews never enter undo or persistence. Cancellation waits for the worker
 * stop acknowledgement before releasing the calculation lease. */
export function createDesignGestureQueue<T>(options:{
 request:(command:DesignEditCommand,signal:AbortSignal)=>Promise<T>;
 preview:(value:T)=>void;commit:(value:T)=>void;error:(error:unknown)=>void;
 stop:()=>Promise<unknown>;idle:()=>void;
}) {
 let pending:{command:DesignEditCommand;final:boolean}|null=null,active=false,closed=false,finished=false,last='';
 let controller:AbortController|null=null;
 const idle=()=>{if(!finished){finished=true;options.idle();}};
 const pump=async()=>{
  if(active||closed||!pending)return;
  const item=pending;pending=null;active=true;controller=new AbortController();
  try{const result=await options.request(item.command,controller.signal);if(!closed){if(item.final){closed=true;options.commit(result);}else options.preview(result);}}
  catch(error){if(!closed&&item.final){closed=true;options.error(error);}}
  finally{active=false;controller=null;if(closed){if(!cancelPromise)idle();}else void pump();}
 };
 let cancelPromise:Promise<void>|null=null;
 return {
  submit(command:DesignEditCommand,final=false){if(closed)return;const key=JSON.stringify(command);if(!final&&key===last)return;last=key;pending={command,final};void pump();},
  cancel(){if(cancelPromise)return cancelPromise;if(finished)return Promise.resolve();closed=true;pending=null;const wasActive=active;controller?.abort();cancelPromise=Promise.resolve().then(()=>wasActive?options.stop():undefined).then(()=>{},e=>options.error(e)).finally(idle);return cancelPromise;},
 };
}
