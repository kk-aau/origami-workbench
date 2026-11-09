import type {FlatFoldResult} from '../core/types';
import type {ModelOverlapReply} from './modelOverlapTask';
import {modelRegionSurfaceIssue} from './modelRenderMode';

export type FlatProgressStage='preparing'|'geometry'|'layers';
export interface FlatComputationStatus {
 active:boolean;title:string;detail:string;tone:'busy'|'ready'|'warning';
}

/** A visible wireframe is not evidence that either calculation has finished. */
export function flatComputationStatus({result,busy,stale=false,stage,localRegions=false,regionReply=null,wire=false,xray=false,paperReady=true}:{result:FlatFoldResult|null;busy:boolean;stale?:boolean;stage?:FlatProgressStage;localRegions?:boolean;regionReply?:ModelOverlapReply|null;wire?:boolean;xray?:boolean;paperReady?:boolean}):FlatComputationStatus{
 const status=(active:boolean,title:string,detail:string,tone:FlatComputationStatus['tone']=active?'busy':'warning')=>({active,title,detail,tone});
 if(busy){
  const current=stage??(result?.geometry.status==='ready'?'layers':'geometry');
  if(current==='preparing')return status(true,'计算中 · 准备折痕','正在整理选中的折痕与纸张边界，可以随时停止。');
  if(current==='geometry')return status(true,'计算中 · 折叠几何','正在构建折后位置，随后继续验证纸层顺序。');
  return status(true,'计算中 · 层序求解','线框是中间预览，层序确认后会自动显示纸面。');
 }
 if(stale)return status(false,'结果已过期','折痕已改变，请重新计算。');
 if(!result)return status(false,'尚未计算','开始平折分析后会显示计算状态。');
 if(result.geometry.status!=='ready'){
  const labels={invalid:'输入无效',unsupported:'暂不支持',timeout:'计算超时',cancelled:'已停止',error:'计算失败'};
  return status(false,`计算已结束 · ${labels[result.geometry.status]}`,result.geometry.message);
 }
 if(result.layers.status!=='solved'){
  if(result.layers.status==='unsupported'&&result.layers.message.startsWith('凹面层序构造预算'))return status(false,'计算已结束 · 超出凹面求解范围',`折叠几何已完成，但当前凹面层序算法不支持这个规模（${result.geometry.faces.length.toLocaleString('en-US')} 个纸面）。本次未开始层序搜索，当前保留几何线框。`);
  const labels={'no-solution':'未找到层序解',unknown:'层序未确认',unsupported:'层序暂不支持',timeout:'层序超时',cancelled:'已停止',error:'层序失败'};
  return status(false,`计算已结束 · ${labels[result.layers.status]}`,`${result.layers.message} 当前仅为${xray?'透视几何':'几何线框'}。`);
 }
 if(localRegions){
  if(!regionReply)return status(true,'计算中 · 纸面遮挡','层序关系已确认，正在生成可见纸面；暂时显示线框。');
  if(regionReply.status!=='complete'){
   const labels={timeout:'纸面遮挡超时',cancelled:'纸面显示已停止',error:'纸面遮挡失败'};
   return status(false,`计算已结束 · ${labels[regionReply.status]}`,`${regionReply.message} 保留线框预览。`);
  }
  const issue=modelRegionSurfaceIssue(regionReply);
  if(issue)return status(false,'计算已结束 · 纸面未完整确认',`${issue}。保留线框预览；请重新计算以继续验证。`);
 }
 if(!wire&&!xray&&!paperReady)return status(false,'层序已确认 · 纸面显示暂停','当前保留线框；结束顶点编辑后会继续生成可见纸面。');
 return status(false,wire?'计算完成 · 线框显示':xray?'计算完成 · 透视显示':'计算完成 · 纸面已确认','已确认平折层序；不代表连续折叠路径无碰撞。','ready');
}
