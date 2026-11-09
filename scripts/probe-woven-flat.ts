import {spawnSync} from 'node:child_process';
import {computeFlatFold} from '../src/core/flatFold';
import {prepareTessResult,type TessResponse} from '../src/app/tessellation';
import {wovenPreset,type WovenParams} from '../src/app/wovenParams';
const cases:WovenParams[]=(['lines','chord','random'] as const).flatMap(mode=>([1,-1] as const).map(parity=>({...wovenPreset(mode),parity})));
for(const lines of [[[0,0,1],[90,0,1]],[[0,0,1],[60,0,1]],[[0,-.4,1],[0,.4,1],[90,-.4,1],[90,.4,1]]])for(const parity of [1,-1] as const)cases.push({...wovenPreset('lines'),mode:'lines',boundary:[[-1,-1],[1,-1],[1,1],[-1,1]],lines:lines as [number,number,number][],parity});
const run=spawnSync('.venv/Scripts/python.exe',['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(cases),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8e6});
if(run.status!==0)throw Error(run.stderr);
for(const [i,response] of (JSON.parse(run.stdout) as TessResponse[]).entries()){
 const p=cases[i],result=prepareTessResult(response,p),flat=computeFlatFold(result.doc);
 console.log(i,p.mode,p.parity,'lines' in p?p.lines.length:'random',flat.geometry.status,flat.layers.status);
}
