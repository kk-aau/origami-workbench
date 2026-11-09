import { computeFlatFold, recomputeFlatLayers } from '../core/flatFold';
import type { FlatWorkerRequest } from '../core/types';
import {flatFoldPublication} from '../app/flatFoldPublication';
import {modelSurfaceTransfer} from '../app/modelSurfaceTransfer';
import {createWorkerRegionCoverageChecker} from '../core/regionParallelChecker';
import {installWorkerRegionCoverageChecker} from '../core/regionCoverageChecker';
import {installFlatComputationProgress,reportFlatComputationProgress} from '../core/flatComputationProgress';
import {installLayerPairScreening} from '../core/layerPairScreening';

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<FlatWorkerRequest>) => void) | null; postMessage(data: unknown,transfer?:ArrayBuffer[]): void };
installWorkerRegionCoverageChecker(createWorkerRegionCoverageChecker(message=>scope.postMessage(message)));
scope.onmessage = event => {
  installLayerPairScreening('auto');
  installFlatComputationProgress(progress=>scope.postMessage({type:'computation-progress',progress}));
  try {
  reportFlatComputationProgress({stage:'preparing',label:'准备平折计算'});
  const request = event.data;
  const result = 'kind' in request
    ? recomputeFlatLayers(request.result,request.options)
    : computeFlatFold(request.doc, geometry => scope.postMessage({ type: 'geometry', result: geometry }), request.options,
      request.includeSource ? graph => scope.postMessage({ type: 'source', graph }) : undefined);
  const publication=flatFoldPublication(result,progress=>{reportFlatComputationProgress({stage:'boundaries',label:'生成正反面轮廓与遮挡'});scope.postMessage({type:'progress',progress});});
  scope.postMessage(publication,modelSurfaceTransfer(publication.surface));
  } finally {
    installFlatComputationProgress();
    installLayerPairScreening('cpu');
  }
};
