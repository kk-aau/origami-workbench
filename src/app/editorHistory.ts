import type {Doc} from '../core/types';
import {historyReducer,type History,type Action} from './state';
import {emptyMarkHistory,recordMarkHistory,stepMarkHistory,type MarkHistory} from './markHistory';

export interface EditorHistory extends History {
 marks:MarkHistory;pastMarks:MarkHistory[];futureMarks:MarkHistory[];error:string|null;
}
export type EditorAction=Action|{type:'markundo'}|{type:'markredo'};
export function emptyEditorHistory(doc:Doc):EditorHistory{
 return {past:[],present:doc,future:[],marks:emptyMarkHistory(doc),pastMarks:[],futureMarks:[],error:null};
}
/** Every whole-document frame retains the matching marker history frame. */
export function editorHistoryReducer(state:EditorHistory,action:EditorAction):EditorHistory{
 if(action.type==='replace')return emptyEditorHistory(action.doc);
 try{
  if(action.type==='markundo'||action.type==='markredo'){
   const result=stepMarkHistory(state.marks,state.present,action.type==='markundo'?'undo':'redo');
   if(result.doc===state.present)return state;
   return {...historyReducer(state,{type:'commit',doc:result.doc}),marks:result.history,
    pastMarks:[...state.pastMarks.slice(-59),state.marks],futureMarks:[],error:null};
  }
  const next=historyReducer(state,action);if(next===state)return state;
  if(action.type==='commit')return {...next,marks:recordMarkHistory(state.marks,state.present,action.doc),
   pastMarks:[...state.pastMarks.slice(-59),state.marks],futureMarks:[],error:null};
  if(action.type==='undo')return {...next,marks:state.pastMarks.at(-1)!,pastMarks:state.pastMarks.slice(0,-1),futureMarks:[state.marks,...state.futureMarks],error:null};
  return {...next,marks:state.futureMarks[0],pastMarks:[...state.pastMarks,state.marks],futureMarks:state.futureMarks.slice(1),error:null};
 }catch(error){return {...state,error:error instanceof Error?error.message:String(error)};}
}
