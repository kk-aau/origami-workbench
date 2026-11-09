import {polygonArea} from './geometry';
import {flatLayerEdges} from './flatLayerOrder';
import {validateLayerPreferences} from './layerPreferences';
import {validateLayerSolutionTree,type FaceOrder,type LayerNode} from './layerSolutions';
import type {FlatFoldResult,FlatLayerPreference,Point} from './types';

const pair=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
export function validateRelativeLayerConstraints(required:FlatLayerPreference[],faceCount:number):void {
  try{validateLayerPreferences(required,faceCount);}catch{throw Error('相对层序约束需要当前模型中两个不同纸面的有效编号。');}
}

/** Only a direct, certified overlap relation proves a requested paper pair.
 * Arbitrary global order and transitive paths through local cycles do not. */
export function relativeLayerConstraintsMatch(vertices:Point[],faces:number[][],orders:FaceOrder[],required:FlatLayerPreference[]):boolean {
  validateRelativeLayerConstraints(required,faces.length);
  if(!required.length)return true;
  const normals=faces.map(face=>Math.sign(polygonArea(face.map(v=>vertices[v]))));
  if(required.some(({above,below})=>!Number.isFinite(normals[above])||!normals[above]||!Number.isFinite(normals[below])||!normals[below]))return false;
  const upper=new Map(flatLayerEdges(orders,normals).map(([below,above])=>[pair(below,above),above]));
  return required.every(({below,above})=>upper.get(pair(below,above))===above);
}

/** Restrict genuine AND/OR choices without enumerating their Cartesian
 * product. Each pair belongs to one AND group; alternatives missing a required
 * pair cannot certify it. Counts and indices now describe the restricted tree. */
export function constrainLayerSolutionTree(tree:LayerNode,vertices:Point[],faces:number[][],required:FlatLayerPreference[]):LayerNode {
  validateLayerSolutionTree(tree,faces.length);validateRelativeLayerConstraints(required,faces.length);
  if(!required.length)return tree;
  const empty:LayerNode={orders:[],branches:[[]]},expected=new Map<string,number>();
  for(const {below,above} of required){const key=pair(below,above);if(expected.has(key)&&expected.get(key)!==above)return empty;expected.set(key,above);}
  const normals=faces.map(face=>Math.sign(polygonArea(face.map(v=>vertices[v]))));
  if(normals.some(n=>!Number.isFinite(n)||!n))throw Error('退化纸面无法认证相对层序约束。');
  const scopes=new Map<LayerNode,Set<string>>();
  const scope=(node:LayerNode):Set<string>=>{
    const cached=scopes.get(node);if(cached)return cached;
    const keys=new Set(node.orders.map(([a,b])=>pair(a,b)));
    for(const group of node.branches??[])for(const child of group)for(const key of scope(child))keys.add(key);
    scopes.set(node,keys);return keys;
  };
  const all=scope(tree);
  for(const key of expected.keys())if(!all.has(key))throw Error('指定纸面之间没有可认证的重叠关系，请选择实际重叠的两个纸面。');
  const cache=new Map<LayerNode,LayerNode|null>();
  const prune=(node:LayerNode):LayerNode|null=>{
    if(cache.has(node))return cache.get(node)!;
    for(const [a,b,sign] of node.orders){const want=expected.get(pair(a,b));if(want!==undefined&&want!==(sign*normals[b]>0?a:b)){cache.set(node,null);return null;}}
    const branches:LayerNode[][]=[];
    for(const group of node.branches??[]){
      const needed=new Set<string>();for(const child of group)for(const key of scope(child))if(expected.has(key))needed.add(key);
      const choices:LayerNode[]=[];
      for(const child of group){if([...needed].some(key=>!scope(child).has(key)))continue;const chosen=prune(child);if(chosen)choices.push(chosen);}
      if(!choices.length){cache.set(node,null);return null;}branches.push(choices);
    }
    const chosen={orders:node.orders,...(node.branches?{branches}:{})};cache.set(node,chosen);return chosen;
  };
  return prune(tree)??empty;
}

export function certifyRelativeLayerConstraints(result:FlatFoldResult,required:FlatLayerPreference[]):FlatFoldResult {
  if(!required.length)return result;
  result.layers.relativeConstraints=structuredClone(required);
  try{
    validateRelativeLayerConstraints(required,result.geometry.faces.length);
    if(result.layers.status==='solved'&&!relativeLayerConstraintsMatch(result.geometry.vertices,result.geometry.faces,result.layers.faceOrders??[],required))
      throw Error('层序结果未认证全部指定纸面的上下关系。');
  }catch(error){result.layers={status:'error',message:error instanceof Error?error.message:String(error),relativeConstraints:structuredClone(required),...(result.layers.constraints?{constraints:result.layers.constraints}:{})};}
  return result;
}
