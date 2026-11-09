import fs from 'node:fs';
import {importDocument,exportDocument} from '../src/core/formats';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {cutMaterialEdges} from '../src/core/materialCut';
const recipes=['interior','boundary','cross','hole','partial'].map(name=>{
 const doc=importDocument(fs.readFileSync(`output/playwright/material-weak-cp-${name==='partial'?'cross':name}-1009.zhezhi.json`,'utf8'),'json').doc,m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);doc.name=`独立弱切口-${name}`;
 const ids=m.edgeSegmentIds.filter((_,e)=>m.graph.edges_assignment[e]!=='B').slice(0,name==='partial'?1:undefined),request={kind:'material-cut' as const,segmentIds:ids},expected=cutMaterialEdges(doc,request),pairs=ids.map(id=>({first:id,second:expected.descendants.get(id)![1],assignment:doc.segments.find(s=>s.id===id)!.assignment}));
 fs.writeFileSync(`output/playwright/material-weak-slit-${name}-initial-1009.zhezhi.json`,exportDocument(doc,'json').text);return {name,request,pairs,checkboxes:ids.map(id=>`切开内边 E${m.edgeSegmentIds.indexOf(id)+1}`)};
});
fs.writeFileSync('output/audits/material-weak-slit-recipes-1009.json',JSON.stringify(recipes,null,2));
fs.writeFileSync('output/playwright/material-weak-slit-run-1009.browser.js',fs.readFileSync('scripts/verify-material-weak-slit-1009.browser.js','utf8').replace('const recipes=[];','const recipes='+JSON.stringify(recipes)+';'));
console.log('Prepared five previously verified actual CP inputs; UI performs all cuts, joins and subsequent crossing construction.');
