import {prepareSimulationGraph} from '../engine/simulationGraphPreparation';
import type {Doc} from '../core/types';
import {artworkTransferChunks,createArtworkTransferReceiver} from '../app/artworkImportTransfer';
import type {SimulationGraphPreparationReply,SimulationGraphPreparationRequest} from '../app/simulationGraphPreparation';

const scope=globalThis as unknown as {onmessage:((event:MessageEvent<SimulationGraphPreparationRequest>)=>void)|null;postMessage:(message:SimulationGraphPreparationReply)=>void};
let phase:'idle'|'input'|'output'|'done'='idle',receiver:ReturnType<typeof createArtworkTransferReceiver>|undefined,chunks=0;
let acknowledgement:{index:number;resume:()=>void}|undefined;
const reply=(message:SimulationGraphPreparationReply)=>scope.postMessage(message);
async function send(message:SimulationGraphPreparationReply,index:number){const continued=new Promise<void>(resolve=>{acknowledgement={index,resume:resolve};});reply(message);await continued;}
scope.onmessage=async event=>{
 try{
  const message=event.data;
  if(message?.type==='continue-result'){
   if(phase!=='output'||!acknowledgement||message.index!==acknowledgement.index)throw Error('三维折痕结果确认顺序错误。');
   const {resume}=acknowledgement;acknowledgement=undefined;resume();return;
  }
  if(message?.type==='begin'){
   if(phase!=='idle')throw Error('三维折痕准备已开始。');phase='input';receiver=createArtworkTransferReceiver();reply({type:'continue-input',index:0});return;
  }
  if(phase!=='input'||!receiver)throw Error('三维折痕准备输入状态无效。');
  if(message?.type==='input'){
   if(message.index!==chunks)throw Error('三维折痕输入分批顺序错误。');receiver.receive(message.operations);reply({type:'continue-input',index:++chunks});return;
  }
  if(message?.type!=='input-complete'||message.chunks!==chunks||chunks<1)throw Error('三维折痕输入尚未完整接收。');
  const input=receiver.finish() as {doc:Doc;hasPose:boolean;poseSource?:unknown};receiver=undefined;
  if(!input||typeof input.hasPose!=='boolean'||!input.doc||typeof input.doc!=='object'||input.hasPose&&!Object.hasOwn(input,'poseSource'))throw Error('三维折痕准备输入无效。');
  const result=prepareSimulationGraph(input.doc,input.hasPose,input.poseSource);phase='output';
  await send({type:'result-begin'},0);let sent=0;
  for(const operations of artworkTransferChunks(result)){const index=sent++;await send({type:'result-chunk',index,operations},sent);}
  phase='done';reply({type:'result-complete',chunks:sent});
 }catch(error){phase='done';receiver=undefined;acknowledgement=undefined;reply({type:'error',message:error instanceof Error?error.message:String(error)});}
};
