import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {importDocument} from '../src/core/formats';
import {validateDoc,type Doc} from '../src/core/types';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {readOriginalArraySource,originalArraySourceMatches} from '../src/app/originalArraySource';

const root=process.cwd(),directory=path.resolve('output/playwright/original-arrays-main-1011/downloads-002');
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),sha=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const browser=read(path.join(directory,'browser-checks.json')),checks:string[]=[],errors:string[]=[],files:any[]=[],docs=new Map<string,Doc>();
const check=(v:unknown,name:string)=>{if(!v)throw Error(name);checks.push(name);};
function lines(p:string){
 const raw=fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'').trimEnd().split(/\r?\n/);check(raw.length%2===0,'DXF成对组码');
 const pairs=Array.from({length:raw.length/2},(_,i)=>[raw[2*i].trim(),raw[2*i+1].trim()]),result:Record<string,string>[]=[];let section='';
 for(let i=0;i<pairs.length;i++){
  if(pairs[i][0]==='0'&&pairs[i][1]==='SECTION'){section=pairs[++i][1];continue;}
  if(pairs[i][0]==='0'&&pairs[i][1]==='ENDSEC'){section='';continue;}
  if(section==='ENTITIES'&&pairs[i][0]==='0'){
   check(pairs[i][1]==='LINE','普通DXF只含LINE');const row:Record<string,string>={};
   while(i+1<pairs.length&&pairs[i+1][0]!=='0'){const [k,v]=pairs[++i];check(!Object.hasOwn(row,k),'LINE无重复组码');row[k]=v;}
   result.push(row);
  }
 }
 check(pairs.some((p,i)=>p[0]==='9'&&p[1]==='$ACADVER'&&pairs[i+1]?.[1]==='AC1009'),'普通R12版本保留');
 check(pairs.some(p=>p[0]==='999'&&p[1].includes('1 drawing unit = 1 mm')&&p[1].includes('Y=-y')),'原毫米及一次Y转换说明');
 return result;
}
let result:any={verified:false,passed:false,errors,productionWritten:false,actualFilesWritten:false,browserStarted:false,mathRerun:false};
try{
 check(browser.verified&&browser.passed&&browser.errors.length===0&&browser.bundle==='/assets/main-BFPpAiGy.js','真实主App通过且bundle绑定');
 check(browser.mainApplication&&!browser.stagingCallbackUsed&&!browser.fixtureResponseUsed&&!browser.fakeDOMUsed,'未使用模拟界面/响应');
 check(browser.actualUserDownloads===29&&browser.downloads.length===29,'真实29按钮文件');
 for(const row of browser.downloads){
  const file=path.resolve(row.path);check(file.startsWith(directory+path.sep)&&fs.existsSync(file)&&row.actualUserExport===true,'实际按钮身份/目录');
  files.push({...row,sha256:sha(file)});
  if(row.format!=='dxf'){
   const doc=importDocument(fs.readFileSync(file,'utf8'),row.format).doc;validateDoc(doc);
   if(row.kind==='baseline'){if(row.suffix==='before-cancel')docs.set('baseline',doc);else check(same(doc,docs.get('baseline')),'窗口取消完整原工程不变');continue;}
   const source=readOriginalArraySource(doc),material=inspectMaterialTopology(doc);check(source!==null&&material.ok,'实际导入来源/有限材料有效');
   check(originalArraySourceMatches(doc),'公开守卫核当前真实源、几何、赋型、目标角 '+row.kind+'/'+row.suffix);
   check(same(source!.recipe,browser.sourceCases[row.kind]),'真实保存配方逐字段保持 '+row.kind+'/'+row.suffix);
   if(!material.ok)throw Error('材料未通过');
   check(material.foldedVertices===undefined&&!Object.hasOwn(doc,'flatFold'),'没有附带假FF/层序位置');
   const g=material.graph,n=g.vertices_coords.length,e=g.edges_vertices.length,f=g.faces_vertices!.length;
   check(n-e+f===1&&material.components.length===1&&material.components[0].boundaryLoops.length===1,'有限连通纸域及Euler');
   check(g.edges_assignment.every((a:string)=>['B','M','V'].includes(a)),'保原山谷和纸边赋型');
   if(source!.kind==='wave-grid'){
    const r=source!.recipe;check(n===(r.columns+1)*(r.rows+1)&&f===r.columns*r.rows&&e===r.columns*(r.rows+1)+r.rows*(r.columns+1),'实际原波纹格索引计数');
   }else if(source!.kind==='waterbomb'){
    const r=source!.recipe;check(f===6*r.nx*r.ny&&doc.paper.width===r.nx*r.unitSizeMm&&doc.paper.height===r.ny*r.unitSizeMm,'原水雷实际三角面/一次毫米尺寸');
   }
   if(row.suffix==='original'&&row.format==='json')docs.set(row.kind,doc);
   else{const original=docs.get(row.kind)!;check(same(doc.paper,original.paper)&&same(doc.segments,original.segments),'JSON/FOLD真实重开几何和尺度/位置 '+row.kind+'/'+row.suffix);}
  }else{
   const original=docs.get(row.kind)!;check(!!original,'DXF对应已读实际JSON');const entities=lines(file);check(entities.length===original.segments.length,'每有效原边恰有一LINE '+row.kind);
   const layers={B:'CutLine',M:'MountainLine',V:'ValleyLine',U:'UnassignedLine',F:'FlatLine',A:'AuxiliaryLine'},colors={B:250,M:1,V:5,U:8,F:3,A:4};
   entities.forEach((r,i)=>{const s=original.segments[i];check(r['8']===layers[s.assignment]&&Number(r['62'])===colors[s.assignment],'原LINE层与颜色');check(Number(r['10'])===s.a[0]&&Number(r['20'])===-s.a[1]&&Number(r['11'])===s.b[0]&&Number(r['21'])===-s.b[1],'LINE原位置/毫米/一次Y翻转严格保持');check(Number(r['30'])===0&&Number(r['31'])===0&&r['6']==='CONTINUOUS','原普通二维实体格式');});
  }
 }
 check(browser.receipts.length===9,'九次真实工程保存');const lastById=new Map<string,any>();
 for(const row of browser.receipts){check(row.status===200&&row.response.id===row.id,'实际POST回执UUID');check(same(row.request.doc,docs.get(row.kind)),'实际保存POST即所采用原CP');lastById.set(row.id,row);}
 for(const row of lastById.values()){const file=path.resolve('output/original-arrays-main-server-1011/projects',row.id+'.json'),value=read(file);check(value.id===row.id&&same(value.doc,row.request.doc),'独立磁盘按最后真实UUID/版本保存');files.push({path:file,sha256:sha(file),actualUserExport:false,role:'actual-private-project'});}
 for(const group of browser.identityGroups)check(group.type.startsWith('same-')?group.before===group.after:group.before!==group.after,'实际同源/跨原模型身份 '+group.type);
 check(files.every(r=>sha(r.path)===r.sha256),'实际文件回读未修改');
 result={...result,verified:true,passed:true,actualUserFiles:29,actualMainChecks:69,ordinaryDXFFiles:6,actualSavedProjects:lastById.size,files,bundle:browser.bundle,identityGroups:browser.identityGroups,sourceCases:browser.sourceCases,
  browserReport:{path:path.join(directory,'browser-checks.json'),sha256:sha(path.join(directory,'browser-checks.json'))},notVerified:['physical cutter software import','machine impression','original Miura/Yoshimura 3D FoldGraph3D','continuous motion/collision','whole-sheet layer order','new portable package']};
}catch(e){errors.push(e instanceof Error?e.message:String(e));result.files=files;}
result.checks=checks.length;result.checksDetail=checks;
const target=path.resolve('output/original-arrays-actual-files-002-1011.json');fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({verified:result.verified,checks:checks.length,files:result.actualUserFiles,errors}));process.exitCode=result.verified?0:1;
