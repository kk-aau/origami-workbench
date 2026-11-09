import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {importDocument} from '../src/core/formats';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {readTessParams,canAdoptTess,tessConstructionKey,prepareTessResult} from '../src/app/tessellation';
import {gorePaperSourceValid} from '../src/app/goreData';
import {DXF_LAYERS} from '../src/core/dxf';
const OUT='output/playwright/original-constructible-final-1010/gore';
const DATA='output/original-constructible-server-1010';
const report=path.join(OUT,'download-audit.json');assert.ok(!fs.existsSync(report));
const json=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const checks:string[]=[],files:{file:string;sha256:string}[]=[],cases:any[]=[];
const check=(ok:unknown,label:string)=>{assert.ok(ok,label);checks.push(label);};
const near=(a:number,b:number)=>Number.isFinite(a)&&Math.abs(a-b)<=3e-9*Math.max(1,Math.abs(b));
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const doc=(name:string,format:'json'|'fold'='json')=>{const file=path.join(OUT,name),bytes=fs.readFileSync(file);files.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});return importDocument(bytes.toString('utf8'),format).doc;};
const proof=json(path.join(OUT,'public-responses.json')),ui=json(path.join(OUT,'browser-checks.json'));
check(ui.verified&&ui.errors.length===0&&ui.downloads.length===13,'实际13份用户按钮下载，捕获API不重复计数');
for(const c of proof.responses){
 const p=readTessParams(c.response.stats.parameters)!;check(p?.family==='gore-paper'&&p.petals==='multiple','真实完整多瓣配方');if(p.family!=='gore-paper')throw Error('family');
 const response=c.response,source=response.source,fold=response.fold;
 check(gorePaperSourceValid(source,fold,p),c.name+'严格原完整四组旋转数据及当前CP门禁');
 const points=fold.vertices_coords as number[][],lower=[0,1].map(k=>Math.min(...points.map(v=>v[k]))),upper=[0,1].map(k=>Math.max(...points.map(v=>v[k]))),scale=200/Math.max(...upper.map((v,k)=>v-lower[k]));
 const graphPoints=points.map(v=>v.map((x,k)=>(x-lower[k])*scale));
 const expected=prepareTessResult(structuredClone(response),p);
 check(canAdoptTess(expected,false,tessConstructionKey(p),p),c.name+'真实主入口允许合法多瓣采用');
 let maximumIsometryError=0;
 for(const face of fold.faces_vertices as number[][])for(let i=0;i<face.length;i++)for(let j=i+1;j<face.length;j++){
  const a=face[i],b=face[j],planar=Math.hypot(...points[a].map((x,k)=>x-points[b][k])),spatial=Math.hypot(...source.foldedForm3D[a].map((x:number,k:number)=>x-source.foldedForm3D[b][k]));
  maximumIsometryError=Math.max(maximumIsometryError,Math.abs(planar-spatial));assert.ok(near(planar,spatial),'所有源面完整点对等距');
 }
 const native=doc(c.name+'.zhezhi.json'),material=inspectMaterialTopology(native);check(material.ok,c.name+'实际native材料有效');if(!material.ok)throw Error(material.message);
 const variants=[['native',native],['FOLD',doc(c.name+'.fold','fold')],['JSON重开',doc(c.name+'-json-reopen.zhezhi.json')],['FOLD重开',doc(c.name+'-fold-reopen.zhezhi.json')],['工程库重开',doc(c.name+'-library-reopen.zhezhi.json')]] as const;
 const saved=json(path.join(OUT,c.name+'-saved.json'));assert.match(saved.id,/^[a-f0-9-]{36}$/);const stored=json(path.join(DATA,'projects',saved.id+'.json'));
 check(stored.id===saved.id&&stored.updated===saved.updated,c.name+'实际工程库UUID及时间精确对应保存响应');
 variants.forEach(([label,d])=>{
  const m=inspectMaterialTopology(d);check(m.ok&&m.components.length===8,c.name+'/'+label+'保留8独立原材料部件');if(!m.ok)throw Error(m.message);
  check(same(m.graph.edges_vertices,fold.edges_vertices)&&same(m.graph.faces_vertices,fold.faces_vertices)&&m.graph.vertices_coords.every((v,i)=>v.every((x,k)=>near(x,graphPoints[i][k]))),c.name+'/'+label+'每个原索引、完整面、mm坐标保持');
  const meta=d.metadata!.tessellation as any;check(same(meta.parameters,native.metadata!.tessellation.parameters)&&same(meta.source,source),c.name+'/'+label+'当前配方与完整3D源/四组帮助图不丢失');
  check(!m.foldedVertices,c.name+'/'+label+'不把三维投影写为二维平折');
 });
 check(same(importDocument(JSON.stringify(stored.doc),'json').doc,native)||same(importDocument(JSON.stringify(stored.doc),'json').doc,variants[3][1]),c.name+'服务器存储实际完整用户工程');
 const dxfFile=path.join(OUT,c.name+'.dxf'),bytes=fs.readFileSync(dxfFile);files.push({file:dxfFile,sha256:createHash('sha256').update(bytes).digest('hex')});
 const tokens=bytes.toString().trimEnd().split(/\r?\n/),lines:Record<number,string>[]=[];assert.equal(tokens.length%2,0);
 for(let i=0;i<tokens.length;i+=2)if(tokens[i]==='0'&&tokens[i+1]==='LINE'){const row:Record<number,string>={};for(i+=2;i<tokens.length&&tokens[i]!=='0';i+=2)row[Number(tokens[i])]=tokens[i+1];lines.push(row);i-=2;}
 check(lines.length===native.segments.length,c.name+'普通DXF只有原LINE实体且每边一次');
 lines.forEach((l,i)=>{const s=native.segments[i];assert.equal(l[8],DXF_LAYERS[s.assignment].name);for(const [k,v]of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]],[30,0],[31,0]])assert.ok(Number.isFinite(Number(l[k]))&&Number(l[k])===v,'DXF exact numeric coordinate (+0 and -0 denote the same point)');});
 check(true,c.name+'每条实际DXF独立核毫米位置、方向、零Z及赋型');
 cases.push({name:c.name,materials:8,counts:[points.length,fold.edges_vertices.length,fold.faces_vertices.length],ordinaryLines:lines.length,maximumIsometryError,projectId:saved.id});
}
const original=doc('points-eight.zhezhi.json'),moved=doc('points-eight-moved.zhezhi.json'),a=inspectMaterialTopology(original),b=inspectMaterialTopology(moved);
check(a.ok&&b.ok,'真实材料编辑前后拓扑均有效');if(!a.ok||!b.ok)throw Error('material');
check(same(a.graph.edges_vertices,b.graph.edges_vertices)&&same(a.graph.faces_vertices,b.graph.faces_vertices)&&same(a.edgeSegmentIds,b.edgeSegmentIds)&&b.components.length===8,'第三瓣独立变换后所有索引及部件身份保持');
a.graph.vertices_coords.forEach((p,i)=>{const expected=a.components[2].vertices.includes(i)?[p[0]+13,p[1]-7]:p;assert.deepEqual(b.graph.vertices_coords[i],expected);});
check(true,'实际+13/-7mm只改变第三瓣，其余7瓣逐点不变');
check(!b.foldedVertices&&same(original.metadata!.tessellation.source.foldedForm3D,moved.metadata!.tessellation.source.foldedForm3D),'三维原来源不伪造编辑后的二维FF');
fs.writeFileSync(report,JSON.stringify({verified:true,passed:checks.length,checks,actualUserDownloads:13,files,cases,bundle:ui.bundle,allFacePairsIsometryChecked:true,materialIdentitiesPreserved:true,dxfAppImportSupported:false,thirdPartyCutterImportVerified:false,machineVerified:false},null,2),{flag:'wx'});
console.log(JSON.stringify({verified:true,passed:checks.length,actualUserDownloads:13,bundle:ui.bundle}));
