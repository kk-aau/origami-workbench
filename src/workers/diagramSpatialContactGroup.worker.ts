import {solveSpatialContactGroup,type SpatialContactGroupInput,type SpatialContactGroupResult} from '../app/diagramSpatialContactGroup';

self.onmessage=(event:MessageEvent<SpatialContactGroupInput[]>)=>{
  const results:SpatialContactGroupResult[]=[];
  try{
    for(const input of event.data)results.push(solveSpatialContactGroup(input));
    self.postMessage({results});
  }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
