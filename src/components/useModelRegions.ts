import {useEffect,useRef,useState} from 'react';
import type {FlatFoldResult} from '../core/types';
import type {FlatSide} from '../app/flatPresentation';
import {acquireModelSurface,type ModelOverlapReply,type ModelOverlapTask} from '../app/modelOverlapTask';
import {modelRegionSurfaceIssue} from '../app/modelRenderMode';
export function useModelRegions(result:FlatFoldResult|null,side:FlatSide,enabled:boolean){
 return useModelRegionTask(result,side,enabled).reply;
}
export function useModelRegionTask(result:FlatFoldResult|null,side:FlatSide,enabled:boolean,shadows=false){
 const [completed,setCompleted]=useState<{result:FlatFoldResult;side:FlatSide;shadows:boolean;reply:ModelOverlapReply}|null>(null);
 const active=useRef<ModelOverlapTask|null>(null);
 useEffect(()=>{
  if(!enabled||!result)return;
  setCompleted(null);
  let live=true;const task=acquireModelSurface(result,side,shadows);active.current=task;
  task.promise.then(reply=>{if(live){setCompleted({result,side,shadows,reply});if(active.current===task)active.current=null;}});
  return()=>{live=false;task.cancel();if(active.current===task)active.current=null;};
 },[result,side,enabled,shadows]);
 return {reply:enabled&&completed?.result===result&&completed.side===side&&completed.shadows===shadows?completed.reply:null,cancel:()=>active.current?.cancel()};
}
export function modelRegionStatus(reply:ModelOverlapReply|null,shadows=false){
 if(!reply)return '正在计算局部层序…';
 if(reply.status!=='complete')return reply.message;
 const issue=modelRegionSurfaceIssue(reply);
 if(reply.exact)return issue?`纸面未完整确认：${issue}。当前保留线框。`:`精确区域：${reply.exactAnalysis.verifiedCells} 已确认 / 0 未确认 / 0 冲突${shadows?(reply.exact.shadows?' · 局部阴影 '+reply.exact.shadows.strips.length+' 处':' · 局部阴影结果缺失'):''}`;
 const regions=reply.regions??[],ordered=regions.filter(r=>r.layers.status==='ordered').length,conflicts=regions.filter(r=>r.layers.status==='conflict').length;
 return `${issue?`纸面未完整确认：${issue}。当前保留线框。`:''}局部区域：${ordered} 已确认 / ${regions.length-ordered-conflicts} 未确认 / ${conflicts} 冲突${shadows?(reply.shadows?' · 局部阴影 '+reply.shadows.strips.length+' 处'+(reply.shadows.ambiguousEdges?' / '+reply.shadows.ambiguousEdges+' 条边未确认':''):' · 局部阴影结果缺失'):''}`;
}
