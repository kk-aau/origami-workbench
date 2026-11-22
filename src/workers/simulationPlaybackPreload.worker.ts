import {prepareSinkPhase,type SinkPlaybackInput} from '../engine/simSinkPlayback';

self.onmessage=({data}:MessageEvent<[SinkPlaybackInput,SinkPlaybackInput]>)=>{
  try{self.postMessage({phases:data.map(prepareSinkPhase)});}
  catch(error){self.postMessage({error:error instanceof Error?error.message:'无法准备沉折轨迹。'});}
};
