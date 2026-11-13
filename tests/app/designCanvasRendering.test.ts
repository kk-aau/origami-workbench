import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import DesignCanvas,{defaultDesignLayers} from '../../src/components/DesignCanvas';
import DesignObjectList from '../../src/components/DesignObjectList';
import {newBaseDesign} from '../../src/app/baseDesign';
import {designEdges,designNodes,designSubtree} from '../../src/app/baseDesignInteraction';
import {chunkDesignEdges,chunkDesignMarkers,designCirclePath,designListWindow,indexDesignGraph,pickDesignGraph,readableDesignLabels} from '../../src/app/designCanvasRendering';

function large(){const p=newBaseDesign('tree');if(p.kind!=='tree')throw Error('tree');p.model.nodes=Array.from({length:20000},(_,i)=>({id:i+1,label:`N${i+1}`,loc:{x:(i%200)/200,y:Math.floor(i/200)/100}}));p.model.edges=Array.from({length:19999},(_,i)=>({id:i+1,label:'',nodes:[1,i+2],length:1,strain:0,stiffness:1}));return p;}
const noop=()=>{};
function render(project:ReturnType<typeof large>,selected:number[]=[],view:'tree'|'packing'='tree'){return renderToStaticMarkup(createElement(DesignCanvas,{project,result:null,cp:null,view,selection:{nodes:selected,edges:[]},camera:{x:0,y:0,zoom:1},onCamera:noop,layers:defaultDesignLayers(),tool:'select',branchLength:1,active:true,disabled:false,gesturing:false,onSelect:noop,onSelection:noop,onBegin:()=>true,onPreview:noop,onCommit:noop,onCancel:noop,onAdd:noop,onSplit:noop,onDelete:noop,onRename:noop}));}

test('large skeleton rendering keeps every model item while batching ordinary and selected node geometry',()=>{
 const project=large(),before=JSON.stringify(project),markup=render(project),all=render(project,project.model.nodes.map(node=>node.id));
 assert.ok((markup.match(/<\w+/g)??[]).length<500);assert.ok((all.match(/<\w+/g)??[]).length<500,'select all cannot allocate an interactive subtree for every node');
 assert.equal((all.match(/class="design-batch-node/g)??[]).length,Math.ceil(20000/128));assert.ok(all.includes('20000 节点 · 19999 分支'));
 const packing=render(project,[],'packing');assert.equal((packing.match(/class="design-packing-circle"/g)??[]).length,19999,'all physical leaf circles and their original transparency remain');
 assert.equal(JSON.stringify(project),before);assert.equal(designSubtree(project,1).length,20000);assert.deepEqual(designSubtree(project,20000),[20000]);
});

test('small skeletons retain individual accessible node and edge controls',()=>{
 const project=newBaseDesign('tree');const html=render(project as ReturnType<typeof large>);assert.ok(html.includes('选择节点 N5'));assert.ok(html.includes('选择分支 N1 到 N5'));assert.equal(html.includes('class="design-batch"'),false);
});

test('coordinate picking reaches tail nodes and edges and gives nodes priority',()=>{
 const nodes=[{id:1,name:'a',x:0,y:0},{id:20000,name:'tail',x:1,y:0}],edges=[{id:19999,n1:1,n2:20000,length:1}],index=indexDesignGraph(nodes,edges);
 assert.deepEqual(pickDesignGraph(nodes,edges,index.byId,{x:1,y:0},.02,.01),{node:20000});assert.deepEqual(pickDesignGraph(nodes,edges,index.byId,{x:.5,y:.005},.02,.01),{edge:19999});assert.deepEqual(pickDesignGraph(nodes,edges,index.byId,{x:2,y:2},.02,.01),{edge:undefined});assert.equal(index.degree.get(1),1);
});

test('density only filters unreadable labels and zoomed or active tail labels remain available',()=>{
 const nodes=designNodes(large()),wide=readableDesignLabels(nodes,{minX:0,maxX:1,minY:0,maxY:1},.2,.1),zoom=readableDesignLabels(nodes,{minX:.99,maxX:1,minY:.98,maxY:1},.001,.001,20000);
 assert.ok(wide.length<100);assert.ok(zoom.some(node=>node.id===20000));assert.ok(readableDesignLabels(nodes,{minX:0,maxX:1,minY:0,maxY:1},.2,.1,20000).some(node=>node.id===20000));assert.equal(nodes.length,20000);
});

test('virtual lists render a bounded window and both tail and first rows remain addressable',()=>{
 const nodes=designNodes(large()),html=renderToStaticMarkup(createElement(DesignObjectList,{items:nodes,className:'design-node-list',label:'nodes',selected:new Set<number>(),onSelect:noop,describe:(node:typeof nodes[number])=>String(node.id),render:(node:typeof nodes[number])=>String(node.id)}));
 assert.ok((html.match(/<button/g)??[]).length<30);assert.ok(html.includes('data-design-count="20000"'));
 assert.equal(designListWindow(20000,19999*34,240).end,20000);assert.ok(designListWindow(20000,19999*34,240).start>19980);assert.equal(designListWindow(20000,0,240).start,0);
});

test('bounded marker paths preserve all geometry without creating one interactive subtree per selection',()=>{
 const paths=Array.from({length:20000},(_,i)=>designCirclePath(i/20000,0,.01)),chunks=chunkDesignMarkers(paths);
 assert.equal(chunks.length,157);assert.equal(chunks.join(''),paths.join(''));assert.ok(chunks.every(chunk=>(chunk.match(/M/g)??[]).length<=128));
 const edges=Array.from({length:19999},(_,i)=>`M0 0L${i/20000} 1`),lines=chunkDesignEdges(edges);assert.equal(lines.length,40);assert.equal(lines.join(''),edges.join(''));assert.ok(lines.every(chunk=>(chunk.match(/M/g)??[]).length<=512));
});
