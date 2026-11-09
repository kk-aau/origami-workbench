import {preferenceStorage} from './preferenceStorage';
export const SELECTION_PERSISTENCE_KEY='zhezhi.selection-persistence.v1';
export function readSelectionPersistence(storage?:Pick<Storage,'getItem'>):boolean{
 try{const raw=(storage??preferenceStorage).getItem(SELECTION_PERSISTENCE_KEY);if(!raw)return false;const value=JSON.parse(raw);return value?.version===1&&value.enabled===true;}catch{return false;}
}
export function saveSelectionPersistence(enabled:boolean,storage:Pick<Storage,'setItem'>=preferenceStorage){
 if(typeof enabled!=='boolean')throw Error('保持选择设置须为布尔值。');
 storage.setItem(SELECTION_PERSISTENCE_KEY,JSON.stringify({version:1,enabled}));
}
/** Explicit deselection and document replacement must not use this automatic-operation policy. */
export function selectionAfterOperation(selected:ReadonlySet<string>,enabled:boolean,existingIds:Iterable<string>):Set<string>{
 if(!enabled)return new Set();
 const existing=new Set(existingIds);
 return new Set([...selected].filter(id=>existing.has(id)));
}
/** Resolve the operation's source IDs through the same split map used by the document commit. */
export function selectionAfterCommit(selected:ReadonlySet<string>,descendants:ReadonlyMap<string,readonly string[]>,completedSelection:ReadonlySet<string>|undefined,enabled:boolean):Set<string>{
 if(completedSelection!==undefined&&!enabled)return new Set();
 return new Set([...(completedSelection??selected)].flatMap(id=>descendants.get(id)??[]));
}
