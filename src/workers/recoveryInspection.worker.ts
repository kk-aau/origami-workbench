import {inspectRecoveryBlobs,type RecoveryInspectionRequest,type RecoveryInspectionReply} from '../app/recoveryInspection';
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<RecoveryInspectionRequest>)=>Promise<void>)|null;postMessage(reply:RecoveryInspectionReply):void};
scope.onmessage=async event=>{
 try{scope.postMessage({type:'result',choice:await inspectRecoveryBlobs(event.data.server,event.data.browser)});}
 catch(error){scope.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};
