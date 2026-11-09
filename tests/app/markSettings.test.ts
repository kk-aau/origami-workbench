import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MARK_COLORS,MARK_COLOR_KEY,validateMarkColor,readMarkColor,saveMarkColor} from '../../src/app/markSettings';
import {appendMark} from '../../src/app/markTools';
import {exportDocument,importDocument} from '../../src/core/formats';
import {creasePatternSVG} from '../../src/app/creasePatternSVG';
import {defaultCreaseDisplay} from '../../src/app/creaseDisplay';
import {exampleDoc} from '../../src/app/state';

test('mark color roundtrips and invalid preferences fall back without accepting arbitrary values',()=>{
 const store=new Map<string,string>(),storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);}};
 assert.equal(readMarkColor(storage),'orange');
 saveMarkColor('yellow',storage);assert.equal(readMarkColor(storage),'yellow');
 saveMarkColor('orange',storage);assert.equal(readMarkColor(storage),'orange');
 for(const raw of ['{','null','{"version":2,"color":"yellow"}','{"version":1,"color":"red"}']){store.set(MARK_COLOR_KEY,raw);assert.equal(readMarkColor(storage),'orange');}
 for(const invalid of [null,{},false,'Yellow','#ff0'])assert.throws(()=>validateMarkColor(invalid));
 assert.throws(()=>saveMarkColor('yellow',{setItem(){throw Error('disk full');}}),/disk full/);
});

test('orange and yellow remain per-object data across save and image export without changing creases',()=>{
 const doc=exampleDoc(),orange=appendMark(doc,[20,20],[40,40],MARK_COLORS.orange.value);
 const before=structuredClone(orange),yellow=appendMark(orange,[20,40],[40,20],MARK_COLORS.yellow.value);
 assert.deepEqual(orange,before);assert.equal(yellow.segments,doc.segments);
 assert.deepEqual(yellow.objects!.map(o=>o.color),[MARK_COLORS.orange.value,MARK_COLORS.yellow.value]);
 assert.deepEqual(importDocument(exportDocument(yellow,'json').text,'json').doc.objects,yellow.objects);
 const svg=creasePatternSVG(yellow,defaultCreaseDisplay());
 for(const {value} of Object.values(MARK_COLORS))assert.ok(svg.includes(`stroke="${value}"`));
});
