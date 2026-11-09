import {validateDoc,type Assignment,type Doc} from '../core/types';

export type DesignKind='tree'|'box';
export type XY={x:number;y:number};
export interface TreeDesign {
 paper:{width:number;height:number;scale:number;has_symmetry:boolean;sym_loc:XY;sym_angle:number};
 nodes:{id:number;label:string;loc:XY}[];
 edges:{id:number;label:string;nodes:[number,number];length:number;strain:number;stiffness:number}[];
 conditions:Record<string,unknown>[];
}
export interface BoxDesign {
 version:string;
 design:{title:string;description?:string;mode:'tree'|'layout';
  tree:{sheet:{type:'rect'|'diag';width:number;height:number};nodes:{id:number;x:number;y:number;name:string}[];edges:{n1:number;n2:number;length:number}[]};
  layout:{sheet:{type:'rect'|'diag';width:number;height:number};flaps:{id:number;x:number;y:number;width:number;height:number}[];stretches:unknown[]}};
 [key:string]:unknown;
}
export type BaseDesignProject={format:'zhezhi-base-design';version:1;name:string}&({kind:'tree';model:TreeDesign}|{kind:'box';model:BoxDesign});
export interface CpLine {id:string;assignment:string;p1:XY;p2:XY}
export type DesignResult={kind:'tree';project:TreeDesign;snapshot:{summary:{is_feasible:boolean;scale:number;leaf_nodes:number;active_paths:number;leaf_paths:number};cp_status_report:{status:string};nodes:({id:number;is_leaf:boolean;loc:XY})[];paths:{nodes:[number,number];is_active:boolean;is_leaf:boolean}[]};report:null|{converged:boolean;is_feasible:boolean;message:string};fold:Record<string,unknown>|null;nativeFile:string|null}
 |{kind:'box';project:BoxDesign;ready:boolean;packingError:string|null;pattern:{sheet:{width:number;height:number};lines:CpLine[]}|null;graphics:{patternNotFound:boolean;invalidJunctions:{id:string;flapIds:[number,number]}[];stretches:{id:string;flapIds:number[];configurationIndex:number;configurationCount:number;patternIndex:number;patternCount:number;patternFound:boolean}[];nodeGraphics:Graphics[];deviceGraphics:Graphics[]}};
export interface Graphics {id:string;data:{contours:{outer:XY[];inner?:XY[][]}[];ridges:[XY,XY][]}}

const obj=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const positive=(v:unknown):v is number=>finite(v)&&v>0;
const ident=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
const point=(v:unknown)=>obj(v)&&finite(v.x)&&finite(v.y);
function require(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message);}
const conditionFields:Record<string,string[]>={
 node_combo:['node','to_symmetry_line','to_paper_edge','to_paper_corner','x_fixed','x_fix_value','y_fixed','y_fix_value'],
 node_fixed:['node','x_fixed','y_fixed','x_fix_value','y_fix_value'],node_on_corner:['node'],node_on_edge:['node'],node_symmetric:['node'],
 nodes_paired:['node1','node2'],nodes_collinear:['node1','node2','node3'],edge_length_fixed:['edge'],edges_same_strain:['edge1','edge2'],
 path_combo:['node1','node2','is_angle_fixed','angle','is_angle_quant','quant','quant_offset'],path_active:['node1','node2'],path_angle_fixed:['node1','node2','angle'],path_angle_quant:['node1','node2','quant','quant_offset'],
};
function validCondition(c:unknown,nodes:number,edges:number):boolean {
 if(!obj(c)||typeof c.type!=='string'||!Object.hasOwn(conditionFields,c.type))return false;
 return conditionFields[c.type].every(key=>/^node[123]?$/.test(key)?ident(c[key])&&c[key]>0&&c[key]<=nodes:/^edge[12]?$/.test(key)?ident(c[key])&&c[key]>0&&c[key]<=edges:/^(to_|is_)|_fixed$/.test(key)?typeof c[key]==='boolean':key==='quant'?ident(c[key]):finite(c[key]));
}
function treeTopology(nodes:number[],edges:[number,number][]) {
 require(new Set(nodes).size===nodes.length,'节点编号重复。');
 require(edges.length===Math.max(0,nodes.length-1),'基础形骨架须为连通树，不能包含环或独立分支。');
 const neighbors=new Map(nodes.map(id=>[id,[] as number[]]));
 for(const [a,b] of edges){require(a!==b&&neighbors.has(a)&&neighbors.has(b),'分支引用的节点不存在。');neighbors.get(a)!.push(b);neighbors.get(b)!.push(a);}
 const seen=new Set<number>(),pending=nodes.length?[nodes[0]]:[];
 while(pending.length){const id=pending.pop()!;if(seen.has(id))continue;seen.add(id);pending.push(...neighbors.get(id)!);}
 require(seen.size===nodes.length,'骨架中存在未连接的节点。');
}
/** Validate the complete editable source before replacing any current project. */
export function validateBaseDesign(value:unknown):BaseDesignProject {
 require(obj(value)&&value.format==='zhezhi-base-design'&&value.version===1,'不是受支持的基础形设计工程。');
 require(typeof value.name==='string'&&value.name.trim(),'设计工程名称不能为空。');
 const m=value.model;require(obj(m),'设计工程缺少模型。');
 if(value.kind==='tree'){
  const p=m.paper;require(obj(p)&&positive(p.width)&&positive(p.height)&&positive(p.scale)&&typeof p.has_symmetry==='boolean'&&point(p.sym_loc)&&finite(p.sym_angle),'树形纸张参数无效。');
  require(Array.isArray(m.nodes)&&Array.isArray(m.edges)&&Array.isArray(m.conditions),'树形模型不完整。');
  require(m.nodes.every((n:unknown,i:number)=>obj(n)&&n.id===i+1&&typeof n.label==='string'&&point(n.loc)),'树形节点参数无效，编号须连续。');
  require(m.edges.every((e:unknown,i:number)=>obj(e)&&e.id===i+1&&typeof e.label==='string'&&Array.isArray(e.nodes)&&e.nodes.length===2&&e.nodes.every(ident)&&positive(e.length)&&finite(e.strain)&&e.strain> -1&&positive(e.stiffness)),'树形分支参数无效。');
  require(m.conditions.every((c:unknown)=>validCondition(c,m.nodes.length,m.edges.length)),'树形约束字段无效或引用的节点、分支不存在。');
  treeTopology(m.nodes.map((n:any)=>n.id),m.edges.map((e:any)=>e.nodes));
 }else if(value.kind==='box'){
  const d=m.design;require(typeof m.version==='string'&&obj(d)&&typeof d.title==='string'&&['tree','layout'].includes(d.mode),'方格设计信息不完整。');
  require(obj(d.tree)&&obj(d.layout),'方格设计缺少骨架或布局。');
  for(const p of [d.tree.sheet,d.layout.sheet])require(obj(p)&&['rect','diag'].includes(p.type)&&positive(p.width)&&positive(p.height),'方格纸张参数无效。');
  const {nodes,edges}=d.tree;require(Array.isArray(nodes)&&Array.isArray(edges)&&Array.isArray(d.layout.flaps)&&Array.isArray(d.layout.stretches),'方格设计模型不完整。');
  require(nodes.every((n:unknown)=>obj(n)&&ident(n.id)&&finite(n.x)&&finite(n.y)&&typeof n.name==='string'),'方格节点参数无效。');
  require(edges.every((e:unknown)=>obj(e)&&ident(e.n1)&&ident(e.n2)&&positive(e.length)),'方格分支长度必须大于零。');
  treeTopology(nodes.map((n:any)=>n.id),edges.map((e:any)=>[e.n1,e.n2]));
  const ids=new Set<number>();
  require(d.layout.flaps.every((f:unknown)=>{if(!obj(f)||!ident(f.id)||ids.has(f.id)||!finite(f.x)||!finite(f.y)||!finite(f.width)||!finite(f.height)||f.width<0||f.height<0)return false;ids.add(f.id);return nodes.some((n:any)=>n.id===f.id)&&edges.filter((e:any)=>e.n1===f.id||e.n2===f.id).length===1;}),'纸瓣参数无效或不对应叶节点。');
 }else throw new Error('未知的基础形设计类型。');
 return value as BaseDesignProject;
}
export function parseBaseDesign(text:string){let value;try{value=JSON.parse(text);}catch{throw new Error('基础形设计工程不是有效 JSON。');}return validateBaseDesign(value);}
export function serializeBaseDesign(project:BaseDesignProject){return JSON.stringify(validateBaseDesign(project));}

/** Named examples are editable starting points, never presented as finished CPs. */
export function newBaseDesign(kind:DesignKind):BaseDesignProject {
 if(kind==='tree')return {format:'zhezhi-base-design',version:1,name:'树形基础形',kind,model:{paper:{width:1,height:1,scale:.1,has_symmetry:false,sym_loc:{x:.5,y:0},sym_angle:90},nodes:[{id:1,label:'中心',loc:{x:.5,y:.5}},...[[.15,.15],[.85,.15],[.85,.85],[.15,.85]].map(([x,y],i)=>({id:i+2,label:`纸瓣 ${i+1}`,loc:{x,y}}))],edges:[2,3,4,5].map((id,i)=>({id:i+1,label:'',nodes:[1,id],length:1,strain:0,stiffness:1})),conditions:[]}};
 return {format:'zhezhi-base-design',version:1,name:'方格基础形',kind,model:{version:'0.7',design:{title:'方格基础形',mode:'layout',tree:{sheet:{type:'rect',width:20,height:20},nodes:[{id:0,name:'中心',x:10,y:10},{id:1,name:'纸瓣 1',x:4,y:4},{id:2,name:'纸瓣 2',x:16,y:4},{id:3,name:'纸瓣 3',x:10,y:16}],edges:[1,2,3].map(n2=>({n1:0,n2,length:3}))},layout:{sheet:{type:'rect',width:16,height:16},flaps:[{id:1,x:4,y:4,width:0,height:0},{id:2,x:12,y:4,width:0,height:0},{id:3,x:8,y:12,width:0,height:0}],stretches:[]}}}};
}
export function treeAddLeaf(model:TreeDesign,parent:number):TreeDesign {
 const anchor=model.nodes.find(n=>n.id===parent);if(!anchor)throw new Error('请先选择连接节点。');
 const id=model.nodes.length+1,loc={x:Math.min(model.paper.width,anchor.loc.x+.1*model.paper.width),y:Math.min(model.paper.height,anchor.loc.y+.1*model.paper.height)};
 return {...model,nodes:[...model.nodes,{id,label:`节点 ${id}`,loc}],edges:[...model.edges,{id:model.edges.length+1,label:'',nodes:[parent,id],length:1,strain:0,stiffness:1}]};
}
export function treeRemoveLeaf(model:TreeDesign,id:number):TreeDesign {
 if(model.nodes.length<=2||model.edges.filter(e=>e.nodes.includes(id)).length!==1)throw new Error('只能删除叶节点，骨架至少保留两个节点。');
 const nodes=model.nodes.filter(n=>n.id!==id),nodeIds=new Map(nodes.map((n,i)=>[n.id,i+1])),edges=model.edges.filter(e=>!e.nodes.includes(id)),edgeIds=new Map(edges.map((e,i)=>[e.id,i+1]));
 const conditions=model.conditions.filter(c=>Object.entries(c).every(([key,v])=>!/^node[123]?$/.test(key)||nodeIds.has(v as number))).filter(c=>Object.entries(c).every(([key,v])=>!/^edge[12]?$/.test(key)||edgeIds.has(v as number))).map(c=>Object.fromEntries(Object.entries(c).map(([key,v])=>[key,/^node[123]?$/.test(key)?nodeIds.get(v as number):/^edge[12]?$/.test(key)?edgeIds.get(v as number):v])));
 return {...model,nodes:nodes.map(n=>({...n,id:nodeIds.get(n.id)!})),edges:edges.map(e=>({...e,id:edgeIds.get(e.id)!,nodes:e.nodes.map(n=>nodeIds.get(n)!) as [number,number]})),conditions};
}

export function designResultDocument(project:BaseDesignProject,result:DesignResult,width=400):Doc {
 require(positive(width),'输出纸张宽度必须大于零。');
 let paper:Doc['paper'],segments:Doc['segments'];
 const assignment=(s:string):Assignment=>({mountain:'M',valley:'V',border:'B',auxiliary:'A',flat:'F',unassigned:'U'} as Record<string,Assignment>)[s]??(['M','V','B','F','A','U'].includes(s)?s as Assignment:'U');
 if(result.kind==='tree'&&project.kind==='tree'){
  require(result.fold,'当前树形尚未生成完整折痕图。');
  const fold=result.fold as {vertices_coords:number[][];edges_vertices:[number,number][];edges_assignment:string[];edges_foldAngle?:number[]},scale=width/project.model.paper.width;
  require(Array.isArray(fold.vertices_coords)&&Array.isArray(fold.edges_vertices),'树形引擎返回了不完整的折痕图。');
  paper={width,height:project.model.paper.height*scale};
  segments=fold.edges_vertices.map(([a,b],i)=>{const type=assignment(fold.edges_assignment[i]);return {id:`design-${i}`,a:[fold.vertices_coords[a][0]*scale,fold.vertices_coords[a][1]*scale],b:[fold.vertices_coords[b][0]*scale,fold.vertices_coords[b][1]*scale],assignment:type,angle:type==='M'?-180:type==='V'?180:0};});
 }else if(result.kind==='box'&&project.kind==='box'){
  require(result.ready&&result.pattern,'当前方格布局尚未生成完整折痕图。');
  const scale=width/result.pattern.sheet.width;paper={width,height:result.pattern.sheet.height*scale};
  segments=result.pattern.lines.map((l,i)=>{const type=assignment(l.assignment);return {id:`design-${i}`,a:[(l.p1.x+result.pattern!.sheet.width/2)*scale,(l.p1.y+result.pattern!.sheet.height/2)*scale],b:[(l.p2.x+result.pattern!.sheet.width/2)*scale,(l.p2.y+result.pattern!.sheet.height/2)*scale],assignment:type,angle:type==='M'?-180:type==='V'?180:0};});
 }else throw new Error('设计结果与当前工程不匹配。');
 const doc:Doc={schemaVersion:2,name:project.name,paper,segments,metadata:{baseDesign:structuredClone(project)}};validateDoc(doc);return doc;
}

export const TREE_CP_STATUS:Record<string,string>={has_full_cp:'完整折痕图已生成',edges_too_short:'分支过短，请检查长度与比例',polys_not_valid:'活动路径尚未围成有效多边形',polys_not_filled:'多边形尚未完成填充',polys_multiple_ibps:'存在多个内骨架多边形',vertices_lack_depth:'部分顶点缺少深度信息',facets_not_valid:'部分纸面无效',not_local_root_connectable:'局部根节点无法连通'};

/** A completed worker request can still be a partial construction. */
export function designBuildFeedback(project:BaseDesignProject,result:DesignResult,width=400):{doc:Doc|null;message:string} {
 if(result.kind==='tree'&&(!result.fold||result.snapshot.cp_status_report.status!=='has_full_cp')){
  if(result.project.nodes.length<2)return {doc:null,message:'未生成折痕图：请先画出至少一条连接两个节点的分支。'};
  const reason=TREE_CP_STATUS[result.snapshot.cp_status_report.status]??'树形构造尚未完成';
  const recovery=result.snapshot.summary.is_feasible?'请先点击“优化布局”，再生成；若仍未完成，请调整节点位置、分支长度或约束。':'路径约束尚未满足，请检查节点位置、分支长度与约束，再点击“优化布局”后重新生成。';
  return {doc:null,message:`未生成完整折痕图：${reason}。${recovery}`};
 }
 if(result.kind==='box'&&(!result.ready||!result.pattern)){
  const reason=result.packingError?'布局未满足打包约束':result.graphics.patternNotFound?'部分河道未找到图案':'存在未解决的纸瓣交汇';
  return {doc:null,message:`未生成完整折痕图：${reason}。请调整布局，并查看右侧计算结果。`};
 }
 try{const doc=designResultDocument(project,result,width);return {doc,message:`折痕图已生成，共 ${doc.segments.length} 条折痕与边界，可导出或送到折痕编辑。`};}
 catch(e){return {doc:null,message:`折痕图未通过编辑区校验：${e instanceof Error?e.message:String(e)}`};}
}
