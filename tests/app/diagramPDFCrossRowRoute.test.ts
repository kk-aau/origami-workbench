import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramPDFBranchRibbonTracks,defaultDiagramPDFRibbon,ribbonSegments} from '../../src/app/diagramPDFDecoration';
import type {DiagramPDFPage,DiagramPDFOptions} from '../../src/app/diagramPDFLayout';

test('cross-row fork retains the planned gutter instead of cutting diagonally across a sibling',()=>{
 const cell=(id:string,x:number,y:number)=>({branchNodeId:id,stepIndex:0,x,y,width:100,height:100});
 const points:[number,number][]=[[350,200],[350,180],[50,180],[50,150]];
 const page={kind:'steps',columns:3,rows:3,cells:[cell('parent',300,200),cell('child',0,50),cell('sibling',150,200)],branchEdges:[{from:'parent',to:'child',kind:'local',points}]} as DiagramPDFPage;
 const options={readingOrder:'snake',ribbon:defaultDiagramPDFRibbon()} as DiagramPDFOptions;
 const tracks=diagramPDFBranchRibbonTracks(options,{width:500,height:500,gap:20},page,page.branchEdges!,'page');
 assert.deepEqual(tracks[0].nodes.slice(1,-1),points.map(([x,y])=>[x/500,y/500]));
 assert.equal(tracks[0].bounded,true);
 const authored={...options,ribbon:{...options.ribbon!,paths:{[tracks[0].key]:[[.7,.5],[.4,.3],[.1,.2]] as [number,number][]}}};
 assert.deepEqual(diagramPDFBranchRibbonTracks(authored,{width:500,height:500,gap:20},page,page.branchEdges!,'page')[0].nodes,authored.ribbon.paths[tracks[0].key]);
});

test('a settled diagonal continuation is one continuous cubic, not a Z of gutter spans',()=>{
 const cell=(id:string,x:number,y:number)=>({branchNodeId:id,stepIndex:0,x,y,width:100,height:100});
 const page={kind:'steps',columns:2,rows:2,cells:[cell('parent',0,0),cell('other',120,0),cell('lower',0,120),cell('child',120,120)],branchEdges:[{from:'parent',to:'child',kind:'local',points:[[50,100],[50,110],[170,110],[170,120]]}]} as DiagramPDFPage;
 const plan={width:250,height:250,gap:20};
 const [track]=diagramPDFBranchRibbonTracks({readingOrder:'snake',ribbon:defaultDiagramPDFRibbon()} as DiagramPDFOptions,plan,page,page.branchEdges!,'page');
 const curves=ribbonSegments(track.nodes,plan,track.bounded,track.neighbors);
 assert.equal(curves.length,1);
 const c=curves[0];assert.equal(c.c1[0],c.start[0]);assert.equal(c.c2[1],c.end[1]);
 assert.ok(c.c1[1]>c.start[1]&&c.c1[1]<c.end[1]);
 assert.ok(c.c2[0]>c.start[0]&&c.c2[0]<c.end[0]);
});
