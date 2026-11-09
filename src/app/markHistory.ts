import {validateDoc,type Doc,type DrawingObject} from '../core/types';

type Mark=Extract<DrawingObject,{kind:'mark'}>;
/** Session-only history; never serialized into a project. */
export interface MarkHistory {past:Mark[][];present:Mark[];future:Mark[][]}
const marks=(doc:Doc):Mark[]=>structuredClone((doc.objects??[]).filter((o):o is Mark=>o.kind==='mark'));
const same=(a:Mark[],b:Mark[])=>JSON.stringify(a)===JSON.stringify(b);
export function emptyMarkHistory(doc:Doc):MarkHistory{return {past:[],present:marks(doc),future:[]};}

/** Record only changes to marks; crease/text/circle edits retain marker redo. */
export function recordMarkHistory(history:MarkHistory,before:Doc,after:Doc):MarkHistory{
 const previous=marks(before),next=marks(after);
 if(!same(previous,history.present))throw Error('标记历史与当前工程不一致，请重新建立标记历史。');
 if(same(previous,next))return history;
 validateDoc(after);
 return {past:[...history.past.slice(-59),history.present],present:next,future:[]};
}

function withMarks(doc:Doc,target:Mark[]):Doc{
 let index=0;
 // Preserve non-marker order and target marker stacking order independently.
 // Additional restored marks are appended when there are no existing marker slots.
 const objects=(doc.objects??[]).flatMap<DrawingObject>(o=>{
  if(o.kind!=='mark')return [o];
  const replacement=target[index++];return replacement?[structuredClone(replacement)]:[];
 });
 objects.push(...structuredClone(target.slice(index)));
 const next:Doc={...doc,objects};
 // Restoring an old ID must never overwrite a new crease/text/circle using it.
 validateDoc(next);return next;
}

/** Caller installs both values atomically only after this function succeeds. */
export function stepMarkHistory(history:MarkHistory,doc:Doc,direction:'undo'|'redo'):{history:MarkHistory;doc:Doc}{
 if(!same(marks(doc),history.present))throw Error('标记已被其他工程操作修改，不能套用过期历史。');
 const target=direction==='undo'?history.past.at(-1):history.future[0];
 if(!target)return {history,doc};
 const next=withMarks(doc,target);
 // Object ordering can differ after interleaved non-marker edits; track actual order.
 const present=marks(next);
 return {doc:next,history:direction==='undo'
  ?{past:history.past.slice(0,-1),present,future:[history.present,...history.future]}
  :{past:[...history.past.slice(-59),history.present],present,future:history.future.slice(1)}};
}
