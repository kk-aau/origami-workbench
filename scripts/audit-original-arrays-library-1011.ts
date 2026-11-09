import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {importDocument} from '../src/core/formats';
import {readOriginalArraySource,originalArraySourceMatches} from '../src/app/originalArraySource';
const folder='output/playwright/original-arrays-main-1011/downloads-002',read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8')),
 main=read(folder+'/browser-checks.json'),ui=read(folder+'/library-reopen-checks-003.json'),get=read(folder+'/water-edited-library-get.json'),
 actual=folder+'/water-edited-library-reopen.json',original=folder+'/water-edited-original.json',doc=importDocument(fs.readFileSync(actual,'utf8'),'json').doc,base=importDocument(fs.readFileSync(original,'utf8'),'json').doc,
 checks:string[]=[],check=(v:unknown,name:string)=>{if(!v)throw Error(name);checks.push(name);},sha=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
check(ui.verified&&ui.passed&&ui.actualUserDownloads===1,'真实库重开和按钮导出');check(ui.id===main.lastSaved.id&&ui.id===get.id&&get.data.id===ui.id,'实际UUID一致');
check(ui.bundle===main.bundle&&get.status===200,'已验bundle与真实GET成功');check(same(doc,base),'实际库重開完整原Doc保持');check(same(doc,get.data.doc),'实际库GET与按钮文件严格同Doc');
check(originalArraySourceMatches(doc),'公开源守卫覆盖实际库读回');check(same(readOriginalArraySource(doc)?.recipe,main.sourceCases['water-edited']),'最新0.8及mm配方严格保持');
const disk='output/original-arrays-main-server-1011/projects/'+ui.id+'.json';check(same(read(disk).doc,doc),'磁盘保存与库导出严格同Doc');
const files=[actual,original,folder+'/library-reopen-checks-003.json',folder+'/water-edited-library-get.json',disk].map(path=>({path,sha256:sha(path)}));
fs.writeFileSync('output/original-arrays-library-files-1011.json',JSON.stringify({verified:true,passed:true,checks:checks.length,checksDetail:checks,actualUserFiles:1,actualMainChecks:ui.checks,files,id:ui.id,productionWritten:false,actualFilesWritten:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({verified:true,checks:checks.length,actualUserFiles:1}));
