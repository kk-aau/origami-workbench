import {useEffect,useMemo,useRef,useState} from 'react';
import type {Doc} from '../core/types';
import {buildSnapPoints} from './snapPoints';
import {creaseVertices} from './creaseVertices';
import {CREASE_TOPOLOGY_WORKER_THRESHOLD,startCreaseTopology,type CreaseTopology,type CreaseTopologyResult,type CreaseTopologyTask} from './creaseTopologyTask';

const EMPTY:CreaseTopology={points:[],vertices:[]};
/** Identity includes the original readOnly flag, never the temporary edit lock.
 * Old geometry is unusable immediately, before effect cleanup gets a turn. */
export function useCreaseTopology(doc:Doc,readOnly:boolean,includeVertices=true){
 const asynchronous=doc.segments.length>=CREASE_TOPOLOGY_WORKER_THRESHOLD&&(!readOnly||includeVertices);
 const key=useMemo(()=>({segments:doc.segments,paper:{...doc.paper},readOnly,includeVertices}),[doc.segments,doc.paper.width,doc.paper.height,readOnly,includeVertices]);
 const synchronous=useMemo(()=>asynchronous?EMPTY:{points:readOnly?[]:buildSnapPoints(doc),vertices:includeVertices?creaseVertices(doc.segments):[]},[key,asynchronous]);
 const [attempt,retry]=useState(0),[state,setState]=useState<{key:typeof key;attempt:number;result:CreaseTopologyResult}|null>(null);
 const [stage,setStage]=useState('正在准备交点计算');
 const active=useRef<CreaseTopologyTask|null>(null);
 useEffect(()=>{
  if(!asynchronous)return;
  let live=true;
  const task=startCreaseTopology(key,key.readOnly,message=>{if(live)setStage(message);},undefined,key.includeVertices);active.current=task;
  task.promise.then(result=>{if(live)setState({key,attempt,result});if(active.current===task)active.current=null;});
  return()=>{live=false;task.cancel();if(active.current===task)active.current=null;};
 },[key,attempt,asynchronous]);
 const current=state?.key===key&&state.attempt===attempt?state.result:null;
 const ready=!asynchronous||current?.status==='ready';
 return {asynchronous,ready,busy:asynchronous&&!current,
  value:!asynchronous?synchronous:current?.status==='ready'?current.value:EMPTY,
  message:current&&current.status!=='ready'?current.message:stage,
  cancel:()=>active.current?.cancel(),retry:()=>retry(value=>value+1)};
}
