import {prepareDiagramSimulationEditable} from '../app/diagramSimulationEditable';
self.onmessage=event=>{
 try{self.postMessage({ok:true,value:prepareDiagramSimulationEditable(event.data.doc,event.data.pose)});}
 catch(error){self.postMessage({ok:false,message:error instanceof Error?error.message:String(error)});}
};
