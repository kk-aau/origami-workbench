import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import type {DiagramAnnotation,DiagramLineAnimationTiming,DiagramLineAnnotation} from '../../src/app/diagramAnnotations';

const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);}});
const {default:DiagramCreaseTimingControls,diagramCreaseTimingChoices}=await import('../../src/components/DiagramCreaseTimingControls');cssHook.deregister();
const line=(id:string,animationTiming?:DiagramLineAnimationTiming):DiagramLineAnnotation=>({id,kind:'line',a:[0,0],b:[100,100],style:'valley',color:'#293d35',width:.7,...(animationTiming?{animationTiming}:{})});
const callbacks={onChange(){},onSelect(){}};
const render=(annotations:readonly DiagramAnnotation[],selectedIds:readonly string[])=>renderToStaticMarkup(createElement(DiagramCreaseTimingControls,{annotations,selectedIds,...callbacks}));

test('timing inspector keeps legacy folds simultaneous until an explicit timing edit',()=>{
  const annotations=[line('a'),line('b')],before=structuredClone(annotations),html=render(annotations,['b']);
  assert.match(html,/动画启动/);assert.match(html,/折痕 2 · 谷折/);
  assert.match(html,/<option value="together" selected="">同时开始<\/option>/);
  assert.match(html,/aria-label="折痕动画开始方式"/);assert.doesNotMatch(html,/参考折痕完成百分比/);
  assert.deepEqual(annotations,before);
});

test('80 percent timing identifies the reference and exposes a locate action',()=>{
  const html=render([line('a'),line('b',{afterLineId:'a',startAfter:.8})],['b']);
  assert.match(html,/<option value="after" selected="">按折痕进度开始<\/option>/);
  assert.match(html,/<option value="a" selected="">折痕 1 · 谷折<\/option>/);
  assert.match(html,/aria-label="参考折痕完成百分比"[^>]*value="80"/);
  assert.match(html,/定位参考折痕/);assert.match(html,/参考折痕完成八成后，本折痕才开始/);
});

test('mixed selected settings stay visibly mixed without applying an arbitrary timing',()=>{
  const annotations=[line('a'),line('b',{afterLineId:'a',startAfter:.8}),line('c')],before=structuredClone(annotations),html=render(annotations,['b','c']);
  assert.match(html,/<option value="mixed" disabled="" selected="">所选折痕设置不同<\/option>/);
  assert.match(html,/已选 2 条折痕/);assert.match(html,/修改后统一应用到所选折痕/);assert.deepEqual(annotations,before);
  const differing=render([line('a'),line('b',{afterLineId:'a',startAfter:.8}),line('c',{afterLineId:'a',startAfter:.5})],['b','c']);
  assert.match(differing,/placeholder="不同"/);assert.match(differing,/value=""/);
});

test('reference choices exclude the target group, suspended lines, and circular dependencies',()=>{
  const annotations=[line('a'),line('b',{afterLineId:'a',startAfter:.8}),line('c',{afterLineId:'b',startAfter:.5}),line('d'),{...line('paused'),foldFaces:[]},line('cp-existing:old-fold')];
  assert.deepEqual(diagramCreaseTimingChoices(annotations,['a']).map(choice=>choice.line.id),['d']);
  assert.deepEqual(diagramCreaseTimingChoices(annotations,['b','d']).map(choice=>choice.line.id),['a']);
  const mutual=[line('x',{afterLineId:'y',startAfter:.8}),line('y',{afterLineId:'x',startAfter:1}),line('z')];
  assert.deepEqual(diagramCreaseTimingChoices(mutual,['z']),[]);
});

test('missing references can be repaired and precrease progress is explicitly the full action',()=>{
  const html=render([line('a',{afterLineId:'removed',startAfter:.8})],['a']);
  assert.match(html,/没有可用参考折痕/);assert.match(html,/原参考折痕不可用/);assert.match(html,/不会形成循环等待/);
  const precrease=render([{...line('a'),foldAction:'precrease'},line('b',{afterLineId:'a',startAfter:1})],['b']);
  assert.match(precrease,/折痕 1 · 谷折（预折）/);assert.match(precrease,/预折进度包含折起与展开的完整动作/);assert.match(precrease,/value="100"/);
});

test('suspended targets explain layer participation and ordinary selection renders no timing panel',()=>{
  const paused=render([{...line('a'),foldFaces:[]}],['a']);
  assert.match(paused,/所选折痕尚未参与折叠/);assert.doesNotMatch(paused,/折痕 0/);assert.match(paused,/<fieldset disabled="">/);
  assert.equal(render([{...line('mark'),style:'auxiliary'}],['mark']),'');
});
