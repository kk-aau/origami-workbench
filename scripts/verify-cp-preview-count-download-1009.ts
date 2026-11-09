import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {optimizeCPPaths} from '../src/core/cpPathOptimizer';
import {verifyCPProcessingExport,exportCPProcessingDXFLines} from '../src/core/cpProcessingExport';
import {processingPreviewStatistics,processingPreviewPaths} from '../src/app/cpProcessingPreview';
const read=(file:string)=>fs.readFileSync(file,'utf8'),source=importDocument(read('output/playwright/cp-preview-count-initial-1009.zhezhi.json'),'json').doc,after=importDocument(read('output/playwright/cp-preview-count-after-1009.zhezhi.json'),'json').doc;
assert.deepEqual(after,source);
const cases:Record<string,unknown>={};
for(const [name,expectedBefore,expectedAfter] of [['collinear',9,7],['continuous',9,7],['passes',15,11],['independent',15,15],['excluded',10,10]] as const){
 const file=read(`output/playwright/cp-preview-count-${name}-1009.dxf`),report=JSON.parse(read(`output/playwright/cp-preview-count-${name}-1009.json`)),plan=optimizeCPPaths(source,report.options),checked=verifyCPProcessingExport(file,'dxf-lines',source,plan),statistics=processingPreviewStatistics(plan,checked);
 assert.deepEqual(report.readback,checked);assert.deepEqual(report.displayedStatistics,statistics);assert.deepEqual(report.paths,plan.paths);assert.equal(file,exportCPProcessingDXFLines(source,plan).text);assert.equal(statistics.beforeEntities,expectedBefore);assert.equal(statistics.afterEntities,expectedAfter);assert.equal(processingPreviewPaths(source,plan,false,false).length,expectedAfter);
 const pairs=file.trimEnd().split(/\r?\n/);let line=false,count=0,total=0,points:number[]=[];
 for(let i=0;i<pairs.length;i+=2){const code=Number(pairs[i]),value=pairs[i+1];if(code===0){if(line){assert.equal(points.length,4);total+=Math.hypot(points[2]-points[0],points[3]-points[1]);}line=value==='LINE';if(line){count++;points=[];}}else if(line&&[10,20,11,21].includes(code))points.push(Number(value));}
 assert.equal(count,expectedAfter);assert.ok(Math.abs(total-statistics.afterLength)<1e-10);assert.ok(file.includes('AC1009')&&!/LWPOLYLINE|POLYLINE|XDATA/.test(file));assert.equal(checked.coordinateConvention,'x,-y');assert.equal(checked.units,'mm');assert.equal(checked.machineTrialVerified,false);assert.equal(checked.physicalImportVerified,false);
 cases[name]={beforeLINE:expectedBefore,afterLINE:count,plannedGroups:statistics.plannedGroups,length:total,previewAndSerializedReportMatch:true,exactSourceCoverageAndPasses:checked.sourcePasses};
}
fs.writeFileSync('output/audits/cp-preview-count-download-1009.json',JSON.stringify({verified:true,cases,actualDownloads:true,sourceUnchanged:true,ordinaryR12LINE:true,physicalImportVerified:false,machineTrialVerified:false},null,2));console.log('Verified five actual DXF/report pairs: displayed LINE counts, preview count, independent parsing, lengths, exact coverage and passes; source CP unchanged.');
