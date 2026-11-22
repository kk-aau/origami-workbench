import {buildAutomaticSinkPlaybackProject} from './diagramAutomaticSinkPlayback';
import {DiagramFullAnimationSession,type DiagramFullAnimationEntry} from './diagramFullAnimation';
import type {DiagramProject} from './diagramProject';
import {automaticSinkGuideDocuments,diagramSinkGuide,type AutomaticSinkPattern} from './diagramSinkGuide';
import {createDiagramSpatialPose} from './diagramSpatialPose';

export interface AutomaticSinkPlan {
  project:DiagramProject;
  opening:DiagramFullAnimationEntry;
  closing:DiagramFullAnimationEntry;
}

/** Both fold trajectories must reach their physical endpoints. A valid tray
 * by itself may sit on a different folding branch from the original drawing. */
export function selectAutomaticSinkGuide(source:DiagramProject,index:number,pattern:AutomaticSinkPattern,progress?:(message:string)=>void):AutomaticSinkPlan {
  const before=source.states[index],after=source.states[index+1],step=source.steps[index];
  if(!step||step.beforeId!==before?.id||step.afterId!==after?.id)throw Error('沉折步骤的前后 CP 不完整。');
  let reason='';
  try{
    for(const {direction,doc} of automaticSinkGuideDocuments(before.doc,after.doc,pattern)){
      progress?.(direction==='preferred'?'正在计算沉口的立体中间姿态…':'正在尝试其他外伸折线方向…');
      try{
        const guide={doc,pose:createDiagramSpatialPose(doc)};
        const project=buildAutomaticSinkPlaybackProject(source,index,guide);
        if(!diagramSinkGuide(project,project.steps[0].id))throw Error('生成的中间姿态无法与原来的沉口对应。');
        const session=new DiagramFullAnimationSession(project);
        const report=(leg:number,message:string)=>progress?.((leg===0?'撑开纸层 · ':'向内沉折 · ')+message);
        const opening=session.prepare(0,0,report),closing=session.prepare(1,0,report);
        return {project,opening,closing};
      }catch(error){reason=error instanceof Error?error.message:String(error);}
    }
  }catch(error){reason=error instanceof Error?error.message:String(error);}
  throw Error('已识别沉折，尚未找到能连续撑开并沉入的三维轨迹。'+reason);
}
