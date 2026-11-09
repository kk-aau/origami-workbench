import type {FlatConflictKind,FlatFoldConflict,FoldGraph,Issue} from './types';

const messages:Record<FlatConflictKind,string>={
 maekawa:'内部顶点的山折与谷折数量之差不满足完全平折的必要条件。',
 taco_taco:'两组折叠纸层的上下关系相互交错，不能同时满足折叠接触约束。',
 taco_tortilla:'第三张纸面被夹入同一折叠的两侧纸面之间，与折叠接触约束冲突。',
 tortilla_tortilla:'相交纸面两侧的上下关系不一致，不能在交叉处互换层次。',
 transitivity:'同一重叠区域内的上下关系形成循环，无法排成纸层顺序。',
 adjacent:'相邻纸面的折痕要求互相矛盾的上下顺序。',
 'relative-order':'指定的纸层上下关系与当前几何、山谷或其他层序约束无法同时满足。',
 'visible-face':'没有合法层序能使所选候选纸面以指定的正背面位于最上层。',
 global:'当前约束无法同时满足，求解器尚未提供可准确定位的局部原因。',
};
export function makeLayerConflict(kind:FlatConflictKind,scope:FlatFoldConflict['scope'],faces:readonly number[],extra:Partial<Pick<FlatFoldConflict,'vertices'|'edges'|'relations'|'message'>>={}):FlatFoldConflict{
 return {kind,scope,faces:[...new Set(faces)].sort((a,b)=>a-b),message:messages[kind],...extra};
}

/** Rabbit Ear preserves the exact violated root rule in Error.cause. Parse
 * only that structured library format; arbitrary error text is not evidence
 * of a contradictory face, and branch errors swallowed by it stay unknown. */
export function conflictsFromLayerError(error:unknown,faceCount:number):FlatFoldConflict[]{
 const visited=new Set<unknown>();let current=error;
 while(current instanceof Error&&!visited.has(current)){
  visited.add(current);
  const match=/^(?:invalid|conflict) (taco_taco|taco_tortilla|tortilla_tortilla|transitivity) \d+:(\d+(?:,\d+)*)$/.exec(current.message);
  if(match){
   const kind=match[1] as FlatConflictKind,faces=match[2].split(',').map(Number),expected=kind==='taco_taco'||kind==='tortilla_tortilla'?4:3;
   if(faces.length===expected&&faces.every(f=>Number.isSafeInteger(f)&&f>=0&&f<faceCount))return [makeLayerConflict(kind,'root',faces)];
  }
  current=current.cause;
 }
 return [];
}

/** Issue points are in CP coordinates. Match that graph before transferring
 * vertex/face IDs to the folded view; never project a CP point as folded XY. */
export function maekawaConflicts(issues:readonly Issue[],source:FoldGraph,epsilon:number):FlatFoldConflict[]{
 const conflicts:FlatFoldConflict[]=[];
 for(const issue of issues){
  if(issue.code!=='maekawa'||issue.severity!=='error'||!issue.point)continue;
  const [x,y]=issue.point;
  const vertex=source.vertices_coords.findIndex(([a,b])=>Math.hypot(a-x,b-y)<=epsilon);
  if(vertex<0)continue;
  const edges:number[]=[],faces=new Set<number>();
  source.edges_vertices.forEach(([a,b],e)=>{if((a===vertex||b===vertex)&&['M','V'].includes(source.edges_assignment[e])){edges.push(e);for(const f of source.edges_faces?.[e]??[])if(Number.isInteger(f)&&f>=0)faces.add(f);}});
  if(!faces.size)source.faces_vertices?.forEach((row,f)=>{if(row.includes(vertex))faces.add(f);});
  conflicts.push(makeLayerConflict('maekawa','condition',[...faces],{vertices:[vertex],edges,message:issue.message}));
  if(conflicts.length>=4)break;
 }
 return conflicts;
}
