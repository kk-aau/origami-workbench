import {analyzeCPPaths,optimizeCPPaths} from '../core/cpPathOptimizer';
import {exportCPProcessingDXFLines,exportCPProcessingDXFR12Polyline,verifyCPProcessingExport} from '../core/cpProcessingExport';
import type {CPProcessingRequest,CPProcessingReply} from '../app/cpProcessingTask';

const scope=self as unknown as {onmessage:((event:MessageEvent<CPProcessingRequest>)=>void)|null;postMessage:(reply:CPProcessingReply)=>void};
scope.onmessage=event=>{
  try {
    const {doc,options}=event.data,analysis=analyzeCPPaths(doc,options);
    if(analysis.overlaps.length&&options.overlapPolicy!=='retain'){
      scope.postMessage({status:'blocked',analysis,message:'检测到重复或局部重叠线。请先在折痕编辑中修正，或明确选择保留重复加工。'});return;
    }
    const plan=optimizeCPPaths(doc,options),continuous=plan.options.pathMode==='continuous';
    const dxf=continuous?exportCPProcessingDXFR12Polyline(doc,plan):exportCPProcessingDXFLines(doc,plan);
    const report=verifyCPProcessingExport(dxf.text,continuous?'dxf-r12-polyline':'dxf-lines',doc,plan);
    scope.postMessage({status:'ready',plan,files:{dxf:dxf.text,report,warnings:dxf.warnings}});
  }catch(cause){scope.postMessage({status:'error',message:cause instanceof Error?cause.message:String(cause)});}
};
