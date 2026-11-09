import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {DiagramAnnotation,DiagramLineAnnotation,DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {prepareDiagramZoomInteraction} from '../../src/app/diagramZoomInteraction';
import type {DiagramZoomRegion} from '../../src/app/diagramZoomGeometry';
import {annotationBounds} from '../../src/app/diagramAnnotationSVG';
import {diagramEraseHits} from '../../src/app/diagramDrawingTools';

const region:DiagramZoomRegion={kind:'circle',center:[30,30],radius:10};
const line=(id:string,a:[number,number],b:[number,number]):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'auxiliary',color:'#334455',width:.2});
const source:DiagramAnnotation[]=[line('crossing',[-100,30],[100,30]),line('hidden',[0,0],[5,0])];

test('box selection and deletion test only visible line pieces, including a rotated viewport',()=>{
  const view=prepareDiagramZoomInteraction(region),snapshot=structuredClone(source);
  assert.deepEqual(view.boxIds(source,[-100,29],[10,31]),[],'an invisible extension cannot select or delete its source line');
  assert.deepEqual(view.boxIds(source,[29,29],[31,31]),['crossing']);
  assert.deepEqual(view.boxIds(source,[-100,29],[10,31],90,[30,30]),[]);
  assert.deepEqual(view.boxIds(source,[29,29],[31,31],90,[30,30]),['crossing']);
  const proxy=view.clipped(source);assert.equal(proxy.length,1);assert.deepEqual(proxy[0],{...source[0],a:[20,30],b:[40,30]});assert.deepEqual(source,snapshot);
});

test('eraser clips both the pointer sweep and line artwork so hidden source geometry survives',()=>{
  const view=prepareDiagramZoomInteraction(region);
  assert.deepEqual(view.eraseIds(source,[0,0],[5,0],.5),[]);
  assert.deepEqual(view.eraseIds(source,[-80,30],[15,30],.5),[]);
  assert.deepEqual(view.eraseIds(source,[-80,30],[80,30],.5),['crossing']);
  assert.deepEqual(view.eraseIds(source,[30,30],[30,30],.5),['crossing']);
});

test('paper-exterior instruction symbols keep their full native selection and eraser hit regions',()=>{
  const symbol:DiagramSymbolAnnotation={id:'outside-zoom-out',kind:'symbol',symbol:'zoomOut',position:[70,70],size:10,rotation:0,color:'#123456',width:.3},box=annotationBounds([symbol])!;
  const wave:DiagramZoomRegion={kind:'wave',points:[[50,0],[40,25],[60,50],[40,75],[50,100]],side:'left',bounds:{x:0,y:0,width:100,height:100}};
  for(const scope of [region,wave]){
    const view=prepareDiagramZoomInteraction(scope),annotations=[source[0],line('outside-line',[90,90],[95,90]),symbol],snapshot=structuredClone(annotations);
    assert.equal(view.contains(symbol.position),false);
    assert.deepEqual(view.boxIds(annotations,[box.x-1,box.y-1],[box.x+box.width+1,box.y+box.height+1]),[symbol.id]);
    assert.deepEqual(view.boxIds(annotations,[box.x-1,box.y-1],[box.x+box.width+1,box.y+box.height+1],90,symbol.position),[symbol.id]);
    const a:[number,number]=[box.x-1,box.y+box.height/2],b:[number,number]=[box.x+box.width+1,box.y+box.height/2],expected=diagramEraseHits([symbol],a,b,.5);
    assert.deepEqual(expected,[symbol.id],'the sweep crosses actual native symbol ink');
    assert.deepEqual(view.eraseIds(annotations,a,b,.5),expected,'the eraser reaches instructions outside the paper crop');
    assert.deepEqual(view.boxIds(annotations,[89,89],[96,91]),[],'hidden paper lines stay protected');
    assert.deepEqual(view.eraseIds(annotations,[90,90],[95,90],.5),[],'hidden paper lines cannot be erased');
    assert.deepEqual(annotations,snapshot,'selection and eraser proxies do not change stored coordinates');
  }
});

test('wave side selection filters hidden lines without trimming stored CP or instruction coordinates',()=>{
  const wave:DiagramZoomRegion={kind:'wave',points:[[50,0],[40,25],[60,50],[40,75],[50,100]],side:'left',bounds:{x:0,y:0,width:100,height:100}},view=prepareDiagramZoomInteraction(wave),lines=[line('across',[0,50],[100,50])];
  const visible=view.clipped(lines);assert.equal(visible.length,1);assert.ok(visible[0].kind==='line');
  const part=visible[0];assert.ok(Math.abs(part.b[0]-part.a[0])<100);
  assert.deepEqual(view.boxIds(lines,[49,49],[51,51]),['across']);assert.deepEqual(view.boxIds(lines,[80,49],[90,51]),[]);
  assert.deepEqual(lines[0].a,[0,50]);assert.deepEqual(lines[0].b,[100,50]);
});
