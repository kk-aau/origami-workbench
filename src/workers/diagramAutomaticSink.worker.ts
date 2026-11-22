import {selectAutomaticSinkGuide} from '../app/diagramAutomaticSinkPlan';
import {diagramSinkDisplay} from '../app/diagramSinkDisplay';
import type {AutomaticSinkPattern} from '../app/diagramSinkGuide';
import type {DiagramProject} from '../app/diagramProject';

self.onmessage=({data}:MessageEvent<{project:DiagramProject;pattern:AutomaticSinkPattern}>)=>{
  try{
    const {project,opening,closing}=selectAutomaticSinkGuide(data.project,0,data.pattern,
      message=>self.postMessage({type:'progress',message}));
    const {camera,cameraFrame}=diagramSinkDisplay(opening,closing,data.pattern.ring);
    const entries=[opening,closing].map(entry=>({...entry,cameraFrame,clip:{...entry.clip,camera}}));
    self.postMessage({type:'ready',project,entries});
  }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:'无法计算沉折的撑开姿态。'});}
};
