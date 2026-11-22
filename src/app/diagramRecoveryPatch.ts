import {validateDiagramProject,type DiagramProject} from './diagramProject';

// A recovery record is relative to a specific immutable library document.
// A caption edit carries only that field. Changed CPs, poses and inserted
// steps carry their own data; unrelated steps keep the original references.
type Row={id:string};
type Fields={set:Record<string,unknown>;unset:string[]};
type Rows={order?:string[];changes:Record<string,Fields>};
export interface DiagramRecoveryPatch {
  version:1;baseKey:string;project:Fields;steps:Rows;states:Rows;
}
const safeKey=(key:string)=>!['__proto__','constructor','prototype'].includes(key);
function fields(before:object,after:object,exclude:readonly string[]=[]):Fields{
  const left=before as Record<string,unknown>,right=after as Record<string,unknown>;
  const set:Record<string,unknown>=Object.create(null),unset:string[]=[];
  for(const key of new Set([...Object.keys(left),...Object.keys(right)])){
    if(exclude.includes(key)||Object.is(left[key],right[key]))continue;
    if(right[key]===undefined)unset.push(key);else set[key]=right[key];
  }
  return {set,unset};
}
function rows<T extends Row>(before:T[],after:T[]):Rows {
  const changes:Record<string,Fields>=Object.create(null);
  if(before===after)return {changes};
  const originals=new Map(before.map(row=>[row.id,row]));
  for(const row of after){
    const base=originals.get(row.id);
    if(base===row)continue;
    const delta=fields(base??{},row,['id']);
    if(!base||Object.keys(delta.set).length||delta.unset.length)changes[row.id]=delta;
  }
  const reordered=before.length!==after.length||after.some((row,i)=>row.id!==before[i].id);
  return {changes,...reordered&&{order:after.map(row=>row.id)}};
}
export function makeDiagramRecoveryPatch(baseKey:string,base:DiagramProject,next:DiagramProject):DiagramRecoveryPatch {
  return {version:1,baseKey,project:fields(base,next,['steps','states']),steps:rows(base.steps,next.steps),states:rows(base.states,next.states)};
}
function applyFields<T extends object>(base:T,delta:Fields):T {
  const next={...base};
  for(const key of delta.unset){if(!safeKey(key))throw Error('恢复字段无效。');delete (next as Record<string,unknown>)[key];}
  for(const [key,value] of Object.entries(delta.set)){if(!safeKey(key))throw Error('恢复字段无效。');(next as Record<string,unknown>)[key]=value;}
  return next;
}
function applyRows<T extends Row>(base:T[],patch:Rows):T[] {
  const originals=new Map(base.map(row=>[row.id,row]));
  return (patch.order??base.map(row=>row.id)).map(id=>{
    const original=originals.get(id),delta=Object.hasOwn(patch.changes,id)?patch.changes[id]:undefined;
    if(!delta&&!original)throw Error('恢复记录缺少纸面或步骤。');
    return delta?applyFields(original??{id} as T,delta):original!;
  });
}
export function restoreDiagramRecoveryPatch(baseKey:string,base:DiagramProject,raw:string|null):DiagramProject {
  if(!raw)throw Error('折序自动恢复记录缺失。');
  const patch:DiagramRecoveryPatch=JSON.parse(raw);
  if(patch?.version!==1||patch.baseKey!==baseKey)throw Error('折序自动恢复记录与原绘图不匹配。');
  const next={...applyFields(base,patch.project),steps:applyRows(base.steps,patch.steps),states:applyRows(base.states,patch.states)};
  validateDiagramProject(next);return next;
}
