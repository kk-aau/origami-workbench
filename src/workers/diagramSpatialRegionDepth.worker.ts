import {spatialCellDepths,type SpatialDepthRequest} from '../app/diagramSpatialDepthKernel';

self.onmessage=({data}:MessageEvent<SpatialDepthRequest>)=>{
  try{
    const signs=data.cells.map(cell=>spatialCellDepths(cell,data.planes,data.roundoff));
    self.postMessage({signs},{transfer:signs.map(row=>row.buffer)});
  }catch(error){
    self.postMessage({error:error instanceof Error?error.message:String(error)});
  }
};
