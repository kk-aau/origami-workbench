import {computeTessFlatGeometry} from '../app/tessellationFlatGeometry';
import type {TessFlatInput} from '../app/tessellationFlat';
import type {FlatFoldResult} from '../core/types';
import {continueFlatLayers} from '../core/continueFlatLayers';
import {modelOverlapRegions} from '../app/modelOverlapRegions';
import {modelRegionLayers} from '../app/modelRegionLayers';
import {modelRegionBoundaries} from '../app/modelRegionBoundaries';
import type {TessFlatFrame} from '../app/tessellationFlat';
import type {FlatSide} from '../app/flatPresentation';

type Request={id:number;input:TessFlatInput;side?:FlatSide}|{type:'layers';result:FlatFoldResult};
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<Request>)=>void)|null;postMessage(data:unknown):void};
let previous:FlatFoldResult|null=null;
scope.onmessage=({data})=>{
  if('type' in data){if(data.result.layers.status==='solved')previous=data.result;return;}
  const {id,input,side='front'}=data;
  const geometry=computeTessFlatGeometry(input,previous);
  const result=continueFlatLayers(geometry,previous)??geometry;
  if(result.layers.status==='solved')previous=result;
  let surface:TessFlatFrame['surface'];
  if(result.layers.status==='solved'&&!result.layers.faceOrder){
    try{const analysis=modelOverlapRegions(result),regions=modelRegionLayers(result,analysis,side),boundaries=modelRegionBoundaries(result,regions);surface={side,reply:{status:'complete',analysis,regions,boundaries}};}
    catch{surface={side,reply:{status:'error',message:'当前局部遮挡验证未完成。'}};}
  }
  // Publish geometry and its visible regions atomically; never paint a new
  // shape using arbitrary face IDs while its surface worker is still running.
  scope.postMessage({id,result,surface});
};
