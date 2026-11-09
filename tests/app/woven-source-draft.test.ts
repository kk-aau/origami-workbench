import assert from 'node:assert/strict';import test from 'node:test';import fs from 'node:fs';
import {wovenPreset,type WovenParams} from '../../src/app/wovenParams';
import {commitWovenLineDraft,commitWovenBoundaryDraft,previewWovenSource,translateWovenLine,rotateWovenLine,wovenLineFrame,type EditableWovenLines} from '../../src/app/wovenSourceDraft';
const data=JSON.parse(fs.readFileSync(new URL('../fixtures/woven-source-editor-backend.json',import.meta.url),'utf8')),near=(a:number[],b:number[],t=2e-13)=>a.length===b.length&&a.every((x,i)=>Math.abs(x-b[i])<=t);
for(const c of data.cases)test(`现Python后端对照：${c.name}`,()=>{
 const p={...wovenPreset(c.mode),...Object.fromEntries(Object.entries(c).filter(([k])=>!['name','expected'].includes(k)))} as EditableWovenLines,source=JSON.stringify(p),preview=previewWovenSource(p);
 assert.equal(preview.expanded.length,c.expected.physicalLines.length);assert.equal(preview.boundary.length,c.expected.boundary.length);
 assert.ok(preview.boundary.every(p=>c.expected.boundary.some((q:number[])=>near(p,q))));
 for(let i=0;i<preview.expanded.length;i++){const row=preview.expanded[i],expected=c.expected.physicalLines[i];assert.ok(near([row.line[0],row.line[1],row.physicalReferenceWidth],expected));const ends=c.expected.clipped[i];assert.equal(!!row.ends,!!ends);if(ends)assert.ok(near(row.ends![0],ends[0])&&near(row.ends![1],ends[1]));}
 assert.equal(JSON.stringify(p),source,'预览不归一化源角、距离或原点集');
});
test('拖线法向移动与旋转源角，raw分支、倍率及距离不暗改',()=>{
 const line:[number,number,number]=[-45,.3,1.7],f=wovenLineFrame(line),along=translateWovenLine(line,f.tangent),normal=translateWovenLine(line,f.normal);assert.ok(Math.abs(along[1]-.3)<1e-15);assert.ok(Math.abs(normal[1]-1.3)<1e-15);assert.equal(normal[0],-45);assert.equal(normal[2],1.7);
 const copy=translateWovenLine([0,.4,1],[1,0],90);assert.ok(Math.abs(copy[1]+.6)<1e-15,'旋转副本的左法线正确回写本源距离');
 const rotated=rotateWovenLine([360,.4,1],[1,0],[0,1]);assert.deepEqual(rotated,[450,.4,1]);assert.throws(()=>commitWovenLineDraft(wovenPreset('lines') as EditableWovenLines,[rotated]),/360/,'超当前接口不静默mod');
});
test('只有真实源几何改变清period/逐边h，倍率精调保全部源引用',()=>{
 const p={...wovenPreset('lines'),periodicity:[[0,1] as [number,number]],periodicityEnabled:true,stationaryFace:2,fullEdgeInsets:{edgeCount:3,entries:[{edge:0,line:0,from:[-1,-.25],to:[1,-.25],inset:.1},{edge:1,line:-1,from:[-1,-1],to:[1,-1],inset:0},{edge:2,line:-1,from:[1,-1],to:[1,1],inset:0}]}} as EditableWovenLines,source=JSON.stringify(p);
 const ratios=structuredClone(p.lines);ratios[0][2]=2;const sameGeometry=commitWovenLineDraft(p,ratios);assert.deepEqual(sameGeometry.periodicity,p.periodicity);assert.deepEqual(sameGeometry.fullEdgeInsets,p.fullEdgeInsets);assert.equal(sameGeometry.stationaryFace,2);
 const distances=structuredClone(p.lines);distances[0][1]=-.2;const changed=commitWovenLineDraft(p,distances);for(const k of ['periodicity','periodicityEnabled','fullEdgeInsets','segmentInsets'])assert.ok(!(k in changed));assert.equal(changed.stationaryFace,0);assert.equal(changed.lines[1][2],p.lines[1][2]);assert.equal(JSON.stringify(p),source);
});
test('凸边界有序插删保持源点；非法凹/自交不默默采用凸包',()=>{
 const p=wovenPreset('lines') as Extract<WovenParams,{mode:'lines'}>,inserted=[[-1,-1],[0,-1],[1,-1],[1,1],[-1,1]] as [number,number][],next=commitWovenBoundaryDraft(p,inserted);assert.deepEqual(next.boundary,inserted);assert.equal(next.mode,p.mode);assert.deepEqual(next.lines,p.lines);assert.deepEqual(commitWovenBoundaryDraft(next,[[-1,-1],[1,-1],[1,1],[-1,1]]).boundary,p.boundary);
 assert.throws(()=>commitWovenBoundaryDraft(p,[[-1,-1],[.1,0],[1,-1],[1,1],[-1,1]]));assert.throws(()=>commitWovenBoundaryDraft(p,[[-1,-1],[1,1],[1,-1],[-1,1]]));
});
test('圆弦0点与原1/2源点按字段语义保存，预览凸包不替换源',()=>{
 const p=wovenPreset('chord') as Extract<WovenParams,{mode:'chord'}>,circle=commitWovenBoundaryDraft(p,[]);assert.ok(!('boundary' in circle));
 for(const points of [[[1,0]],[[1,0],[0,.5]]] as [number,number][][]){const next=commitWovenBoundaryDraft(p,points),before=JSON.stringify(next);assert.deepEqual(next.boundary,points);const preview=previewWovenSource(next as EditableWovenLines);assert.ok(preview.boundary.length>=3);assert.notDeepEqual(preview.boundary,points);assert.equal(JSON.stringify(next),before);assert.ok(!('boundary' in commitWovenBoundaryDraft(next,[])));}
 assert.throws(()=>commitWovenBoundaryDraft(p,[[1,0],[1,0]]));assert.throws(()=>commitWovenBoundaryDraft(p,Array.from({length:33},(_,i)=>[i/33,1])));
});
test('数量、角度及圆弦源限制保现guard，预览不是CP采用结果',()=>{
 const p=wovenPreset('chord') as EditableWovenLines;assert.throws(()=>commitWovenLineDraft(p,Array(5).fill([30,.2,1])));assert.throws(()=>previewWovenSource(p,[[0,0,1]]),/非零/);assert.throws(()=>previewWovenSource(p,[[0,1.2,1]]),/小于/);assert.throws(()=>previewWovenSource(p,[[0,.4,1],[180,-.4,1]]),/重合/);assert.deepEqual(p.lines,[[0,.4,1]]);
});
