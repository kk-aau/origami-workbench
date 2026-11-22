import {buildDiagramStepAnimation} from '../app/diagramStepAnimation';
import type {DiagramProject} from '../app/diagramProject';

self.onmessage=({data}:MessageEvent<{project:DiagramProject;stepId:string}>)=>{
  try{
    self.postMessage({clip:buildDiagramStepAnimation(data.project,data.stepId)});
  }catch(error){
    self.postMessage({error:error instanceof Error?error.message:'无法准备本步动画。'});
  }
};
