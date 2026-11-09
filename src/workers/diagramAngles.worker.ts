import {diagramSimulationGraph,applyDiagramSimulationAngles} from '../app/diagramSimulationAngles';
self.onmessage=event=>{
 try{const {doc,pose,options}=event.data;self.postMessage({ok:true,value:pose?applyDiagramSimulationAngles(doc,pose,options):diagramSimulationGraph(doc)});}
 catch(error){self.postMessage({ok:false,message:error instanceof Error?error.message:String(error)});}
};
