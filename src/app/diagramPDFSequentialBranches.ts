import type {DiagramPDFBranchNode,DiagramPDFBranchPage,DiagramPDFBranchPageSpec,DiagramPDFBranchCell} from './diagramPDFBranchLayout';

/** Rank complete root-to-leaf routes, then print only each route's new suffix.
 * Process figures stay with their step but do not inflate the step count. */
export function diagramPDFSequentialRuns(nodes:readonly DiagramPDFBranchNode[],mainLeafId?:string):DiagramPDFBranchNode[][]{
  const byId=new Map(nodes.map(n=>[n.id,n]));
  if(byId.size!==nodes.length)throw Error('分支图解含有重复步骤。');
  const children=new Map<string,DiagramPDFBranchNode[]>(),roots:DiagramPDFBranchNode[]=[];
  for(const n of nodes){
    if(!n.parentId||!byId.has(n.parentId)){roots.push(n);continue;}
    const list=children.get(n.parentId)??[];list.push(n);children.set(n.parentId,list);
  }
  const depth=new Map<string,number>(),queue=[...roots];
  for(let i=0;i<queue.length;i++){
    const n=queue[i];depth.set(n.id,(depth.get(n.parentId??'')??0)+(n.figureIndex===undefined?1:0));
    queue.push(...(children.get(n.id)??[]));
  }
  if(queue.length!==nodes.length)throw Error('分支步骤引用形成了循环。');
  const leaves=nodes.filter(n=>!children.has(n.id)).sort((a,b)=>Number(b.id===mainLeafId)-Number(a.id===mainLeafId)||depth.get(b.id)!-depth.get(a.id)!);
  const printed=new Set<string>(),runs:DiagramPDFBranchNode[][]=[];
  for(const leaf of leaves){
    const run:DiagramPDFBranchNode[]=[];
    for(let n:DiagramPDFBranchNode|undefined=leaf;n&&!printed.has(n.id);n=byId.get(n.parentId??'')){
      run.push(n);printed.add(n.id);
    }
    if(run.length)runs.push(run.reverse());
  }
  return runs;
}

/** Rows always read left-to-right. Each alternate suffix starts on a new row,
 * including when the previous route ended in the middle of the last row. */
export function layoutDiagramPDFSequentialBranches(nodes:readonly DiagramPDFBranchNode[],pageSpec:(index:number)=>DiagramPDFBranchPageSpec,mainLeafId?:string):DiagramPDFBranchPage[]{
  const pages:DiagramPDFBranchPage[]=[],specs:DiagramPDFBranchPageSpec[]=[];
  let page:DiagramPDFBranchPage|undefined,spec:DiagramPDFBranchPageSpec,slot=0,limit=0;
  for(const run of diagramPDFSequentialRuns(nodes,mainLeafId)){
    if(page)slot=Math.ceil(slot/page.columns)*page.columns;
    for(const node of run){
      if(!page||slot>=page.columns*page.rows||page.cells.length>=limit){
        spec=pageSpec(pages.length);limit=spec.count??spec.columns*spec.rows;
        if(![spec.rows,spec.columns,limit].every(n=>Number.isInteger(n)&&n>0))throw Error('分支图解的行列和每页步数必须是正整数。');
        if(!(spec.bounds.width>0&&spec.bounds.height>0&&spec.gap>=0))throw Error('分支图解的页面空间不足。');
        page={columns:spec.columns,rows:Math.max(spec.rows,Math.ceil(limit/spec.columns)),cells:[],edges:[]};
        pages.push(page);specs.push(spec);slot=0;
      }
      const {bounds,gap}=spec!,pitchX=bounds.width/page.columns,pitchY=bounds.height/page.rows;
      const width=pitchX-Math.min(gap,pitchX/2),height=pitchY-Math.min(gap,pitchY/2);
      const row=Math.floor(slot/page.columns),column=slot%page.columns;
      page.cells.push({...node,row,entrySlot:[row,column],width,height,
        x:bounds.x+(column+.5)*pitchX-width/2,y:bounds.y+(row+.5)*pitchY-height/2});
      slot++;
    }
  }
  const locations=new Map(pages.flatMap((p,index)=>p.cells.map(cell=>[cell.id,{index,cell}] as const)));
  const center=(c:DiagramPDFBranchCell):[number,number]=>[c.x+c.width/2,c.y+c.height/2];
  for(const n of nodes){
    const a=locations.get(n.parentId??''),b=locations.get(n.id)!;if(!a)continue;
    const from=a.cell.id,to=b.cell.id;
    if(a.index===b.index)pages[a.index].edges.push({from,to,kind:'local',points:[center(a.cell),center(b.cell)]});
    else{
      const source=specs[a.index].bounds,target=specs[b.index].bounds;
      pages[a.index].edges.push({from,to,kind:'outgoing',otherPage:b.index,points:[center(a.cell),[source.x+source.width,center(a.cell)[1]]]});
      pages[b.index].edges.push({from,to,kind:'incoming',otherPage:a.index,points:[[target.x,center(b.cell)[1]],center(b.cell)]});
    }
  }
  return pages;
}
