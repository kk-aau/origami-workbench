import {createDiagramSpatialPose,prepareDiagramSpatialHistory,reprojectDiagramSpatialPose,adjustDiagramSpatialLayers,type DiagramSpatialPose} from '../app/diagramSpatialPose';
import {createDiagramSpatialPreviewModel} from '../app/diagramSpatialPreviewSession';
import type {SpatialLayerRequest} from '../app/diagramSpatialLayerSolver';
import type {DiagramPose} from '../app/diagramProject';
import {drawingSVG} from '../app/diagramDrawing';
import {defaultDiagramLineDefaults} from '../app/diagramLineStyles';
import {serializeDiagramSpatialError} from '../app/diagramSpatialDiagnostic';
type Request={mode?:'create';args:Parameters<typeof createDiagramSpatialPose>;history:(DiagramPose|null|undefined)[]}|{mode:'camera'|'preview'|'preview-init'|'preview-sync';pose:DiagramPose;camera:DiagramSpatialPose['camera'];history:DiagramPose[];drawingRotation?:number}|{mode:'preview-frame'|'preview-project';camera:DiagramSpatialPose['camera']}|{mode:'layers';pose:DiagramPose;history:DiagramPose[];request:SpatialLayerRequest};
let previewSession:ReturnType<typeof createDiagramSpatialPreviewModel>|undefined;
self.onmessage=(event:MessageEvent<Request>)=>{
  try{
    const request=event.data;
    if(request.mode==='preview-init'){
      previewSession=createDiagramSpatialPreviewModel(request.pose,request.history,request.drawingRotation??0);self.postMessage({ok:true,value:null});
    }else if(request.mode==='preview-sync'){
      if(!previewSession)throw Error('视角预览尚未准备完成。');
      previewSession.sync(request.pose,request.history,request.drawingRotation??0);self.postMessage({ok:true,value:null});
    }else if(request.mode==='preview-frame'){
      if(!previewSession)throw Error('视角预览尚未准备完成。');
      self.postMessage({ok:true,value:previewSession.frame(request.camera)});
    }else if(request.mode==='preview-project'){
      if(!previewSession)throw Error('视角预览尚未准备完成。');
      self.postMessage({ok:true,value:previewSession.project(request.camera)});
    }else if(request.mode==='layers')self.postMessage({ok:true,value:adjustDiagramSpatialLayers(request.pose,request.request,request.history)});
    else if(request.mode==='preview'){
      const next={...request.pose,...reprojectDiagramSpatialPose(request.pose,request.camera,request.history)};
      self.postMessage({ok:true,value:drawingSVG(next,[],'','',undefined,[],true,defaultDiagramLineDefaults(),[],undefined,undefined,undefined,request.drawingRotation??0)});
    }else if(request.mode==='camera')self.postMessage({ok:true,value:reprojectDiagramSpatialPose(request.pose,request.camera,request.history)});
    else if('args' in request){prepareDiagramSpatialHistory(request.history);self.postMessage({ok:true,value:createDiagramSpatialPose(...request.args)});}
  }
  catch(error){self.postMessage(serializeDiagramSpatialError(error));}
};
