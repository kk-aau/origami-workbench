import type {Doc} from '../core/types';
import {buildSnapPoints} from '../app/snapPoints';
import {creaseVertices} from '../app/creaseVertices';
import {CREASE_TOPOLOGY_CHUNK,type CreaseTopology,type CreaseTopologyReply,type CreaseTopologyRequest} from '../app/creaseTopologyProtocol';

const scope=globalThis as unknown as {onmessage:((event:MessageEvent<CreaseTopologyRequest>)=>void)|null;postMessage(reply:CreaseTopologyReply):void};
let doc:Doc|undefined,count=0,readOnly=false,includeVertices=true,result:CreaseTopology|undefined,pointOffset=0,vertexOffset=0,failed=false;
scope.onmessage=event=>{
 if(failed)return;
 try{
  const request=event.data;
  if(request.type==='begin'){
   if(doc||!Number.isSafeInteger(request.count)||request.count<0)throw new Error('交点计算输入数量无效。');
   count=request.count;readOnly=request.readOnly;includeVertices=request.includeVertices;doc={name:'交点计算',paper:request.paper,segments:[]};return;
  }
  if(!doc)throw new Error('交点计算尚未初始化。');
  if(request.type==='segments'){
   if(result||request.offset!==doc.segments.length||request.segments.length>CREASE_TOPOLOGY_CHUNK||doc.segments.length+request.segments.length>count)throw new Error('交点输入不完整或顺序错误。');
   for(const segment of request.segments)doc.segments.push(segment);return;
  }
  if(request.type==='compute'){
   if(result||doc.segments.length!==count)throw new Error('交点输入未接收完整。');
   result={points:readOnly?[]:buildSnapPoints(doc),vertices:includeVertices?creaseVertices(doc.segments):[]};
   doc.segments=[];scope.postMessage({type:'result-begin',points:result.points.length,vertices:result.vertices.length});return;
  }
  if(request.type!=='next'||!result)throw new Error('交点结果尚未准备完成。');
  if(pointOffset<result.points.length){const points=result.points.slice(pointOffset,pointOffset+CREASE_TOPOLOGY_CHUNK);scope.postMessage({type:'points',offset:pointOffset,points});pointOffset+=points.length;}
  else if(vertexOffset<result.vertices.length){const vertices=result.vertices.slice(vertexOffset,vertexOffset+CREASE_TOPOLOGY_CHUNK);scope.postMessage({type:'vertices',offset:vertexOffset,vertices});vertexOffset+=vertices.length;}
  else scope.postMessage({type:'complete'});
 }catch(error){failed=true;scope.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};
