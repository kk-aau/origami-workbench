import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {XMLParser} from 'fast-xml-parser';
import DrawingObjects from '../../src/components/DrawingObjects';
import {defaultCreaseDisplay,validateCreaseDisplay,previewOrieditaDisplay,saveCreaseDisplay,readCreaseDisplay} from '../../src/app/creaseDisplay';
import {creasePatternSVG,DISPLAY_PIXEL_MM} from '../../src/app/creasePatternSVG';
import {exampleDoc} from '../../src/app/state';
const parse=(xml:string)=>new XMLParser({ignoreAttributes:false}).parse(xml);

test('mark width is version-compatible, strictly bounded and persists independently',()=>{
 const current=defaultCreaseDisplay(),{markLineWidth,...legacy}=current;
 assert.equal(validateCreaseDisplay(legacy).markLineWidth,1.3);
 for(const value of [0,-1,21,NaN,Infinity,null,'2'])assert.throws(()=>validateCreaseDisplay({...current,markLineWidth:value}));
 let raw='';const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}};
 const next={...current,markLineWidth:4.5};saveCreaseDisplay(next,storage);assert.deepEqual(readCreaseDisplay(storage),next);
 assert.equal(previewOrieditaDisplay({markLineWidth:4.5},current,true).settings!.markLineWidth,4.5);
 assert.deepEqual(previewOrieditaDisplay({markLineWidth:4.5},current).ignored,['markLineWidth']);
 assert.equal(previewOrieditaDisplay({markLineWidth:0},current,true).settings,null);
});

test('mark width scales on screen and in image export but does not change circles or geometry',()=>{
 const doc=exampleDoc();doc.objects=[{kind:'mark',id:'m',a:[10,10],b:[30,30],color:'#abcdef'},{kind:'circle',id:'c',center:[50,50],radius:10,color:'#123456'}];
 const before=structuredClone(doc),display={...defaultCreaseDisplay(),markLineWidth:4.5};
 const screen=parse(renderToStaticMarkup(createElement(DrawingObjects,{objects:doc.objects,units:2,markLineWidth:display.markLineWidth}))).g.g;
 assert.equal(Number(screen[0].line['@_stroke-width']),9);
 assert.equal(Number(screen[1].circle['@_stroke-width']),2.6);
 const exported=parse(creasePatternSVG(doc,display)).svg;
 assert.equal(Number(exported.line.at(-1)['@_stroke-width']),4.5*DISPLAY_PIXEL_MM);
 assert.equal(Number(exported.circle['@_stroke-width']),.3);
 assert.equal(Number(exported.line[0]['@_stroke-width']),display.lineWidth*DISPLAY_PIXEL_MM);
 assert.deepEqual(doc,before);
});
