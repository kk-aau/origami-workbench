export type DocumentArrangement='tabs'|'horizontal'|'vertical'|'grid';
export type DocumentDropEdge='left'|'right'|'top'|'bottom';
export interface DocumentGroup {kind:'group';id:string;documentIds:string[];selectedId:string|null}
export interface DocumentSplit {kind:'split';id:string;axis:'horizontal'|'vertical';ratio:number;first:DocumentLayoutNode;second:DocumentLayoutNode}
export type DocumentLayoutNode=DocumentGroup|DocumentSplit;
export interface DocumentWindowLayout {root:DocumentLayoutNode;activeId:string|null}
export type LayoutIdFactory=()=>string;

export function documentGroups(node:DocumentLayoutNode):DocumentGroup[]{return node.kind==='group'?[node]:[...documentGroups(node.first),...documentGroups(node.second)];}
export function layoutDocumentIds(layout:DocumentWindowLayout):string[]{return documentGroups(layout.root).flatMap(group=>group.documentIds);}
function unique(ids:readonly string[]){return [...new Set(ids.filter(Boolean))];}
function group(id:string,ids:readonly string[],selected?:string|null):DocumentGroup {const documentIds=unique(ids);return{kind:'group',id,documentIds,selectedId:selected&&documentIds.includes(selected)?selected:documentIds[0]??null};}
export function createDocumentWindowLayout(ids:readonly string[]=[],activeId?:string|null):DocumentWindowLayout {const root=group('group-main',ids,activeId);return{root,activeId:root.selectedId};}
function mapGroups(node:DocumentLayoutNode,update:(value:DocumentGroup)=>DocumentGroup):DocumentLayoutNode {return node.kind==='group'?update(node):{...node,first:mapGroups(node.first,update),second:mapGroups(node.second,update)};}
function prune(node:DocumentLayoutNode):DocumentLayoutNode|null {if(node.kind==='group')return node.documentIds.length?node:null;const first=prune(node.first),second=prune(node.second);return first&&second?{...node,first,second}:first??second;}
function sameNode(a:DocumentLayoutNode,b:DocumentLayoutNode):boolean {if(a.kind!==b.kind||a.id!==b.id)return false;if(a.kind==='group'&&b.kind==='group')return a.selectedId===b.selectedId&&a.documentIds.length===b.documentIds.length&&a.documentIds.every((id,i)=>id===b.documentIds[i]);return a.kind==='split'&&b.kind==='split'&&a.axis===b.axis&&a.ratio===b.ratio&&sameNode(a.first,b.first)&&sameNode(a.second,b.second);}
function stable(before:DocumentWindowLayout,after:DocumentWindowLayout):DocumentWindowLayout {return before.activeId===after.activeId&&sameNode(before.root,after.root)?before:after;}

/** Reconcile only ownership changes. Metadata updates must not rebuild pane layout. */
export function reconcileDocumentWindowLayout(layout:DocumentWindowLayout,ids:readonly string[],activeId?:string|null):DocumentWindowLayout {
 const owned=unique(ids),allowed=new Set(owned),seen=new Set<string>();
 let root=mapGroups(layout.root,g=>group(g.id,g.documentIds.filter(id=>{if(!allowed.has(id)||seen.has(id))return false;seen.add(id);return true;}),g.selectedId));
 const missing=owned.filter(id=>!seen.has(id)),groups=documentGroups(root),target=groups.find(g=>g.documentIds.includes(activeId??''))??groups.find(g=>g.documentIds.includes(layout.activeId??''))??groups[0];
 if(missing.length)root=mapGroups(root,g=>g.id===target.id?group(g.id,[...g.documentIds,...missing],g.selectedId):g);
 root=prune(root)??group('group-main',[]);
 const nextActive=activeId&&allowed.has(activeId)?activeId:layout.activeId&&allowed.has(layout.activeId)?layout.activeId:documentGroups(root).find(g=>g.selectedId)?.selectedId??null;
 const next={root,activeId:nextActive};return stable(layout,nextActive?activateLayoutDocument(next,nextActive):next);
}
export function activateLayoutDocument(layout:DocumentWindowLayout,id:string):DocumentWindowLayout {
 if(!layoutDocumentIds(layout).includes(id))return layout;
 return stable(layout,{activeId:id,root:mapGroups(layout.root,g=>g.documentIds.includes(id)?{...g,selectedId:id}:g)});
}
/** index is the slot before removal, so a tab dropped before itself stays put. */
export function moveLayoutDocument(layout:DocumentWindowLayout,id:string,targetGroupId:string,index?:number):DocumentWindowLayout {
 const groups=documentGroups(layout.root),source=groups.find(g=>g.documentIds.includes(id)),target=groups.find(g=>g.id===targetGroupId);if(!source||!target)return layout;
 let slot=Math.max(0,Math.min(target.documentIds.length,index??target.documentIds.length));
 if(source.id===target.id&&source.documentIds.indexOf(id)<slot)slot--;
 const root=mapGroups(layout.root,g=>{
  const remaining=g.documentIds.filter(value=>value!==id);if(g.id===target.id){remaining.splice(Math.min(slot,remaining.length),0,id);return group(g.id,remaining,id);}
  return group(g.id,remaining,g.selectedId);
 });
 return stable(layout,{root:prune(root)??group('group-main',[id]),activeId:id});
}
export function splitLayoutDocument(layout:DocumentWindowLayout,id:string,targetGroupId:string,edge:DocumentDropEdge,nextId:LayoutIdFactory):DocumentWindowLayout {
 const target=documentGroups(layout.root).find(g=>g.id===targetGroupId);if(!target||!layoutDocumentIds(layout).includes(id)||target.documentIds.length===1&&target.documentIds[0]===id)return layout;
 const without=mapGroups(layout.root,g=>group(g.id,g.documentIds.filter(value=>value!==id),g.selectedId));
 const incoming=group(nextId(),[id]),before=edge==='left'||edge==='top';
 function replace(node:DocumentLayoutNode):DocumentLayoutNode {if(node.kind==='group')return node.id===targetGroupId?{kind:'split',id:nextId(),axis:edge==='left'||edge==='right'?'horizontal':'vertical',ratio:.5,first:before?incoming:node,second:before?node:incoming}:node;return{...node,first:replace(node.first),second:replace(node.second)};}
 return stable(layout,{root:prune(replace(without))!,activeId:id});
}
export function setDocumentSplitRatio(layout:DocumentWindowLayout,id:string,ratio:number):DocumentWindowLayout {
 if(!Number.isFinite(ratio))return layout;
 const value=Math.max(.1,Math.min(.9,ratio));function update(node:DocumentLayoutNode):DocumentLayoutNode{return node.kind==='group'?node:{...node,ratio:node.id===id?value:node.ratio,first:update(node.first),second:update(node.second)};}
 return stable(layout,{...layout,root:update(layout.root)});
}
export function arrangeDocumentWindow(layout:DocumentWindowLayout,mode:DocumentArrangement,nextId:LayoutIdFactory):DocumentWindowLayout {
 const ids=layoutDocumentIds(layout);if(mode==='tabs'||ids.length<2)return stable(layout,{root:group('group-main',ids,layout.activeId),activeId:layout.activeId});
 function split(first:DocumentLayoutNode,second:DocumentLayoutNode,axis:'horizontal'|'vertical',ratio=.5):DocumentSplit{return{kind:'split',id:nextId(),axis,ratio,first,second};}
 if(mode!=='grid'){const middle=Math.ceil(ids.length/2);return{root:split(group(nextId(),ids.slice(0,middle),layout.activeId),group(nextId(),ids.slice(middle),layout.activeId),mode),activeId:layout.activeId};}
 const columns=Math.ceil(Math.sqrt(ids.length)),rows:DocumentLayoutNode[]=[];
 for(let start=0;start<ids.length;start+=columns){const row=ids.slice(start,start+columns);let node:DocumentLayoutNode=group(nextId(),[row[row.length-1]]);for(let i=row.length-2;i>=0;i--)node=split(group(nextId(),[row[i]]),node,'horizontal',1/(row.length-i));rows.push(node);}
 let root=rows[rows.length-1];for(let i=rows.length-2;i>=0;i--)root=split(rows[i],root,'vertical',1/(rows.length-i));return{root,activeId:layout.activeId};
}
