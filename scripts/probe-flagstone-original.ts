import {spawnSync} from 'node:child_process';
import {computeFlatFold} from '../src/core/flatFold';
import {prepareTessResult,tessPreset,type TessParams,type TessResponse} from '../src/app/tessellation';
const cases:TessParams[]=(['square','triangle','hexagon'] as const).flatMap(tiling=>(['original','tuck'] as const).map(junctionAssignment=>({...tessPreset('flagstone'),family:'flagstone' as const,tiling,rows:3,columns:3,width:.25,aspect:1,shrinkage:.8,junctionAssignment})));
const run=spawnSync('.venv/Scripts/python.exe',['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(cases),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8e6});
if(run.status!==0)throw Error(run.stderr);
for(const [i,response] of (JSON.parse(run.stdout) as TessResponse[]).entries()){
 const p=cases[i],result=prepareTessResult(response,p),flat=computeFlatFold(result.doc);
 console.log(JSON.stringify({params:p,geometry:flat.geometry.status,layers:flat.layers.status,message:flat.layers.message}));
}
