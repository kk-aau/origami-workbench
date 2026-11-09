/** Actual user-file import/global-layer audit. No backend/producer LP is imported. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {importDocument} from '../src/core/formats';
import {buildFold} from '../src/core/geometry';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {readTessParams,canAdoptTessWithTileLayers,tessConstructionKey} from '../src/app/tessellation';
import {minTotalPleatSourceMatches} from '../src/app/reciprocalMinTotalPleat';
import {tessFlatRoot} from '../src/app/tessellationFlat';

const cli=process.argv.slice(2),rootAcceptance=path.resolve('output/parallel/original-min-total-pleat-1010/root-acceptance');
if(cli.includes('--help')){console.log('tsx audit-user-downloads.ts --out <browserDir> --server-data <ZHEZHI_DATA_DIR> --report <root-acceptance/report.json> [--python-report <audit.py report>]');process.exit(0);}
const arg=(flag:string,optional=false)=>{const at=cli.indexOf(flag);if(at<0){if(optional)return undefined;throw Error('缺少参数 '+flag);}if(!cli[at+1]||cli[at+1].startsWith('--'))throw Error('缺少参数值 '+flag);return path.resolve(cli[at+1]);};
const OUT=arg('--out')!,DATA=arg('--server-data')!,REPORT=arg('--report')!,PY=arg('--python-report',true);
assert.ok(!path.relative(rootAcceptance,REPORT).startsWith('..')&&!path.isAbsolute(path.relative(rootAcceptance,REPORT)),'报告必须写到新的root-acceptance内部');
const checks:string[]=[],files:{path:string;bytes:number;sha256:string}[]=[],layers:any[]=[];
const check=(ok:boolean,label:string)=>{assert.ok(ok,label);checks.push(label);};
const read=(file:string)=>{const bytes=readFileSync(file);files.push({path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});return bytes.toString('utf8');};
const json=(name:string)=>JSON.parse(read(path.join(OUT,name)));
const near=(a:any,b:any,eps=1e-9):boolean=>typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=eps*Math.max(1,Math.abs(b)):
 Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>near(a[i],v,eps)):
 b&&typeof b==='object'?!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).sort().join('|')===Object.keys(b).sort().join('|')&&Object.entries(b).every(([k,v])=>near(a[k],v,eps)):a===b;
const canonical=(a:number[],b:number[],assignment:string)=>JSON.stringify([a.map(v=>Math.round(v*1e8)/1e8),b.map(v=>Math.round(v*1e8)/1e8)].sort()).concat('|'+assignment);
const geometry=(doc:any)=>doc.segments.map((s:any)=>canonical(s.a,s.b,s.assignment)).sort();
const stripElapsed=(r:any)=>{const result=structuredClone(r);delete result.stats.elapsedMs;return result;};
const effective=(p:any)=>{const value=structuredClone(p);if(value?.motherParams?.family==='custom'&&value.motherParams.customOutput===undefined)value.motherParams.customOutput='twist';return value;};
const recipe=(meta:any,r:any,label:string)=>{
 const saved=readTessParams(meta.parameters),actual=readTessParams(r.stats.parameters);check(!!saved&&!!actual&&near(effective(saved),effective(actual),1e-12),label+': public reader preserves all effective recipe parameters');
 check(minTotalPleatSourceMatches(meta.source,saved!,r.mother,r.dual),label+': saved source independently verifies LP optimum/uniqueness/common fit against current recipe');
 check(near(meta.source,r.source,0),label+': complete source/certificate/FF exactly saved');
};
const decodeDxf=(text:string)=>{
 const lines=text.trimEnd().split(/\r?\n/);assert.equal(lines.length%2,0);const entities:any[]=[];let entity:any;
 for(let i=0;i<lines.length;i+=2){const code=Number(lines[i]),value=lines[i+1].trim();
  if(code===0){if(entity?.type==='LINE')entities.push(entity);entity={type:value};}
  else if(entity)entity[code]=value;
 }
 if(entity?.type==='LINE')entities.push(entity);
 return entities;
};
const response=(r:any,label:string)=>{
 const p=readTessParams(r.stats.parameters);check(!!p&&minTotalPleatSourceMatches(r.source,p,r.mother,r.dual),label+': real API source certificate independently verified without producer LP');return p!;
};
const actuals:any[]=[];
for(const kind of ['base','edited']){
 const api=json(kind+'-response.json'),regen=json(kind+'-regenerated-response.json');actuals.push(api);const p=response(api,kind);response(regen,kind+' regenerated');
 check(near(stripElapsed(api),stripElapsed(regen),0),kind+': actual saved recipe regenerated complete API response except elapsed');
 const nativeRaw=read(path.join(OUT,kind+'.json')),foldRaw=read(path.join(OUT,kind+'.fold')),dxfRaw=read(path.join(OUT,kind+'.dxf'));
 const native=importDocument(nativeRaw,'json').doc,fold=importDocument(foldRaw,'fold').doc;
 check(native.name==='MinTotal1010-'+kind&&!native.metadata?.rootAcceptanceInput,kind+': actual ordinary native project, prepared rejection input excluded');
 recipe(native.metadata!.tessellation,api,kind+' native');recipe(fold.metadata!.tessellation,api,kind+' FOLD');
 check(near(geometry(fold),geometry(native),0),kind+': real core FOLD importer preserves every native mm edge and assignment');
 const cp=api.fold.vertices_coords as number[][],low=[0,1].map(k=>Math.min(...cp.map(row=>row[k]))),high=[0,1].map(k=>Math.max(...cp.map(row=>row[k]))),scale=200/Math.max(...high.map((v,k)=>v-low[k]));
 const expected=api.fold.edges_vertices.map(([a,b]:number[],i:number)=>canonical(cp[a].map((v,k)=>(v-low[k])*scale),cp[b].map((v,k)=>(v-low[k])*scale),api.fold.edges_assignment[i])).sort();
 check(native.segments.length===api.stats.edges&&near(geometry(native),expected,0),kind+': every actual API CP edge maps once through independent uniform project-mm normalization');
 const entities=decodeDxf(dxfRaw),kinds:Record<string,string>={CutLine:'B',MountainLine:'M',ValleyLine:'V',AuxiliaryLine:'A',UnassignedLine:'U',FlatLine:'F'};
 check(entities.length===native.segments.length,kind+': ordinary DXF LINE count matches every source segment');
 entities.forEach((line:any,i:number)=>{const s=native.segments[i];check(kinds[line[8]]===s.assignment&&Number(line[10])===s.a[0]&&Number(line[20])===-s.a[1]&&Number(line[11])===s.b[0]&&Number(line[21])===-s.b[1]&&Number(line[30])===0&&Number(line[31])===0,kind+': exact DXF project millimetres x,-y and layer for edge '+i);});
 const docs:[string,any][]=[['native',native],['FOLD',fold]];
 for(const format of ['json','fold']){
  const reopened=importDocument(read(path.join(OUT,kind+'-'+format+'-reopen.json')),'json').doc;
  recipe(reopened.metadata!.tessellation,api,kind+' '+format+' reopen');check(near(geometry(reopened),geometry(native),0)&&reopened.name===native.name,kind+'/'+format+': actual reopened ordinary JSON keeps all CP geometry');
  docs.push([format+' reopen',reopened]);
 }
 const library=importDocument(read(path.join(OUT,kind+'-library-reopen.json')),'json').doc,saved=json(kind+'-saved.json');
 assert.match(saved.id,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
 const stored=JSON.parse(read(path.join(DATA,'projects',saved.id+'.json'))),storedDoc=importDocument(JSON.stringify(stored.doc),'json').doc;
 check(stored.format==='zhezhi-project'&&stored.id===saved.id&&stored.updated===saved.updated,kind+': actual server project matches POST receipt id/timestamp');
 recipe(storedDoc.metadata!.tessellation,api,kind+' server storage');recipe(library.metadata!.tessellation,api,kind+' library reopen');
 check(storedDoc.name===native.name&&library.name===native.name&&near(geometry(storedDoc),geometry(native),0)&&near(geometry(library),geometry(native),0)&&near(storedDoc.metadata!.tessellation,library.metadata!.tessellation,0),kind+': true stored engineering recipe/geometry agrees with actual library-reopened download');
 docs.push(['library reopen',library],['server storage',storedDoc]);
 for(const [label,doc] of docs){
  const built=buildFold(doc),flat=recomputeFlatLayers(computeFlatGeometry(built.graph,2e-6,{startingFace:tessFlatRoot(built.graph)}));
  check(flat.geometry.status==='ready'&&flat.layers.status==='solved',kind+'/'+label+': actual imported user geometry independently computes global solved layers');
  const result={...api,doc};check(canAdoptTessWithTileLayers(result,false,tessConstructionKey(p),p,flat.layers.status),kind+'/'+label+': current normal adoption gate preserves verified method and solved layers');
  layers.push({kind,artifact:label,geometry:flat.geometry.status,layer:flat.layers.status,message:flat.layers.message});
 }
}
check(!near(actuals[0].stats.parameters.dualTargets,actuals[1].stats.parameters.dualTargets,0)&&!near(actuals[0].fold,actuals[1].fold,0),'real edited request/CP changed');
const browser=json('browser-checks.json'),suffixes=['.json','.fold','.dxf','-json-reopen.json','-fold-reopen.json','-library-reopen.json'];
const expectedDownloads=['base','edited'].flatMap(kind=>suffixes.map(suffix=>kind+suffix)).sort();
check(browser.verified===true&&browser.passed>0&&browser.errors.length===0&&browser.downloads.length===12&&near(browser.downloads.map((d:any)=>path.basename(d.path)).sort(),expectedDownloads,0),'real browser12 ordinary downloads and source checks; API/prepared captures excluded');
if(PY){const report=JSON.parse(read(PY));check(path.resolve(report.inputOut)===OUT&&path.resolve(report.serverData)===DATA&&report.passed>0&&report.actualOrdinaryDownloads===12&&report.producerLPImports.length===0,'independent Python report bound to same real output/server data');for(const entry of report.files)check(createHash('sha256').update(readFileSync(entry.path)).digest('hex')===entry.sha256,'independent Python input SHA still current: '+path.basename(entry.path));}
const report={schema:'min-total-actual-user-import-layer-audit-v1',inputOut:OUT,serverData:DATA,passed:checks.length,checks,files,layers,
 actualOrdinaryDownloads:12,actualImportedEngineeringArtifacts:layers.length,actualServerProjects:2,producerLPImports:[],browserExecutedByAuditor:false,dxfImportSupported:false,
 currentApplicationImports:['core/formats','core/geometry','core/flatFold','app/reciprocalMinTotalPleat certificate verifier','app/tessellation ordinary gate'],independentPythonReport:PY??null};
mkdirSync(path.dirname(REPORT),{recursive:true});writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:checks.length,actualOrdinaryDownloads:12,actualImportedEngineeringArtifacts:layers.length,report:REPORT}));
