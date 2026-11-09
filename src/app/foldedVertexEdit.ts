import type { FlatFoldResult, Point } from '../core/types';

export interface FoldedVertexSelection {
  /** Unfolded vertex IDs whose folded positions coincide with the clicked point. */
  group: number[];
  /** Explicitly selected members, not necessarily every overlapping vertex. */
  selected: number[];
  /** Transient straight-stretch followers; displacements are relative to selected[0]. */
  followers?: {vertex:number;weight:number}[];
}
const validPoint = (p: Point) => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && Math.abs(n) <= 1_000_000);
function requireVertex(vertices: Point[], index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= vertices.length || !validPoint(vertices[index])) throw new Error('折叠顶点不存在或坐标无效。');
}
function validateSelection(vertices: Point[], selection: FoldedVertexSelection) {
  for (const index of [...selection.group, ...selection.selected]) requireVertex(vertices, index);
  if (new Set(selection.group).size !== selection.group.length || new Set(selection.selected).size !== selection.selected.length ||
      selection.selected.some(i => !selection.group.includes(i))) throw new Error('折叠顶点选择状态无效。');
  if(selection.followers){
    const seen=new Set(selection.selected);
    if(selection.selected.length!==1)throw new Error('直线拉伸需要一个移动端点。');
    for(const {vertex,weight} of selection.followers){
      requireVertex(vertices,vertex);
      if(seen.has(vertex)||!Number.isFinite(weight)||weight<=0||weight>=1)throw new Error('直线拉伸的跟随节点无效。');
      seen.add(vertex);
    }
  }
}

/** Preserve spacing along a stretched line instead of collapsing its intermediate nodes. */
export function foldedVertexPositions(vertices:Point[],selection:FoldedVertexSelection,destination:Point):Point[]{
  validateSelection(vertices,selection);
  if(!validPoint(destination))throw new Error('折叠顶点目标坐标无效或超出范围。');
  const next=vertices.map(p=>[...p] as Point),anchor=vertices[selection.selected[0]];
  for(const index of selection.selected)next[index]=[...destination];
  for(const {vertex,weight} of selection.followers??[]){
    const p=vertices[vertex];next[vertex]=[p[0]+(destination[0]-anchor[0])*weight,p[1]+(destination[1]-anchor[1])*weight];
    if(!validPoint(next[vertex]))throw new Error('直线拉伸超出有效坐标范围。');
  }
  return next;
}

/** Mirrors mode 101: unfolded clicks toggle members, folded clicks preserve an active subset. */
export function selectFoldedVertex(vertices: Point[], previous: FoldedVertexSelection, index: number, location: 'unfolded' | 'folded'): FoldedVertexSelection {
  requireVertex(vertices, index);validateSelection(vertices, previous);
  if (location !== 'unfolded' && location !== 'folded') throw new Error('未知的顶点选择视图。');
  if (previous.group.includes(index)) {
    if (location === 'folded' && previous.selected.length) return previous;
    return {group:[...previous.group],selected:previous.selected.includes(index)?previous.selected.filter(i=>i!==index):[...previous.selected,index]};
  }
  const p=vertices[index];
  const group=vertices.flatMap((q,i)=>Math.hypot(q[0]-p[0],q[1]-p[1])<1e-7?[i]:[]);
  return {group,selected:[index]};
}

/** Move selected coincident members to one destination, like PointSet.statePointMove. */
export function moveFoldedVertices(result: FlatFoldResult, selection: FoldedVertexSelection, destination: Point): FlatFoldResult {
  if (result.geometry.status !== 'ready') throw new Error('请先生成有效的折叠模型。');
  if (!validPoint(destination)) throw new Error('折叠顶点目标坐标无效或超出范围。');
  validateSelection(result.geometry.vertices,selection);
  if (!selection.selected.length || selection.selected.every(i=>result.geometry.vertices[i][0]===destination[0]&&result.geometry.vertices[i][1]===destination[1])) return result;
  const next=structuredClone(result);
  next.geometry.vertices=foldedVertexPositions(result.geometry.vertices,selection,destination);
  if(next.geometry.graph){
    next.geometry.graph.vertices_coords=next.geometry.vertices.map(p=>[...p]);
    // These coordinates no longer have the old ordering, normal or matrix solution.
    delete next.geometry.graph.faceOrders;
    delete next.geometry.graph.faces_normal;
    delete next.geometry.graph.faces_matrix2;
    delete next.geometry.graph.faces_matrix;
  }
  next.geometry.modified=true;
  next.geometry.message='折叠结果顶点已手工修改；这是结果几何，不代表原折痕的等距折叠。';
  next.layers={status:'unknown',message:'模型顶点已修改，原层序解已失效，需重新分析修改后的模型。',...(next.layers.relativeConstraints?{relativeConstraints:next.layers.relativeConstraints}:{})};
  const warning='手工结果变形可能改变边长、面形或产生自交；尚未证明层序、连续折叠路径或实际可折性。';
  if(!next.warnings.includes(warning))next.warnings.push(warning);
  return next;
}
