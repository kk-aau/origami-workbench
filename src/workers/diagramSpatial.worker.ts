import {createDiagramSpatialPose,prepareDiagramSpatialHistory,reprojectDiagramSpatialPose,createDiagramSpatialProjector,adjustDiagramSpatialLayers,type DiagramSpatialPose} from '../app/diagramSpatialPose';
import type {SpatialLayerRequest} from '../app/diagramSpatialLayerSolver';
import type {DiagramPose} from '../app/diagramProject';
import {drawingSVG} from '../app/diagramDrawing';
import {defaultDiagramLineDefaults} from '../app/diagramLineStyles';
type Request={mode?:'create';args:Parameters<typeof createDiagramSpatialPose>;history:(DiagramPose|null|undefined)[]}|{mode:'camera'|'preview'|'preview-init';pose:DiagramPose;camera:DiagramSpatialPose['camera'];history:DiagramPose[];drawingRotation?:number}|{mode:'preview-frame';camera:DiagramSpatialPose['camera']}|{mode:'layers';pose:DiagramPose;history:DiagramPose[];request:SpatialLayerRequest};
let previewSession:{pose:DiagramPose;project:ReturnType<typeof createDiagramSpatialProjector>;drawingRotation:number}|undefined;
self.onmessage=(event:MessageEvent<Request>)=>{
  try{
    const request=event.data;
    if(request.mode==='preview-init'){
      previewSession={pose:request.pose,project:createDiagramSpatialProjector(request.pose,request.history),drawingRotation:request.drawingRotation??0};self.postMessage({ok:true,value:null});
    }else if(request.mode==='preview-frame'){
      if(!previewSession)throw Error('视角预览尚未准备完成。');
      const next={...previewSession.pose,...previewSession.project(request.camera)};
      self.postMessage({ok:true,value:drawingSVG(next,[],'','',undefined,[],true,defaultDiagramLineDefaults(),[],undefined,undefined,undefined,previewSession.drawingRotation)});
    }else if(request.mode==='layers')self.postMessage({ok:true,value:adjustDiagramSpatialLayers(request.pose,request.request,request.history)});
    else if(request.mode==='preview'){
      const next={...request.pose,...reprojectDiagramSpatialPose(request.pose,request.camera,request.history)};
      self.postMessage({ok:true,value:drawingSVG(next,[],'','',undefined,[],true,defaultDiagramLineDefaults(),[],undefined,undefined,undefined,request.drawingRotation??0)});
    }else if(request.mode==='camera')self.postMessage({ok:true,value:reprojectDiagramSpatialPose(request.pose,request.camera,request.history)});
    else if('args' in request){prepareDiagramSpatialHistory(request.history);self.postMessage({ok:true,value:createDiagramSpatialPose(...request.args)});}
  }
  catch(error){self.postMessage({ok:false,message:error instanceof Error?error.message:String(error)});}
};
