import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultDiagramCanvas,type DiagramStep} from '../../src/app/diagramProject';
import {diagramExportObstacles} from '../../src/app/diagramExportObstacles';
import {annotationBounds} from '../../src/app/diagramAnnotationSVG';
import type {DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import type {DiagramImage} from '../../src/app/diagramImages';
import type {DiagramPDFRect} from '../../src/app/diagramPDFLayout';

const step:DiagramStep={id:'test',title:'',description:'',pose:null,beforeId:'a',afterId:'b'};
const square={x:0,y:0,width:100,height:100};
const flip:DiagramSymbolAnnotation={kind:'symbol',symbol:'flip',id:'flip',position:[700,600],size:40,rotation:0,width:.7,color:'#293d35'};
function close(actual:DiagramPDFRect|undefined,expected:DiagramPDFRect){
  assert.ok(actual);
  for(const key of ['x','y','width','height'] as const)assert.ok(Math.abs(actual[key]-expected[key])<1e-8,`${key}: ${actual[key]} / ${expected[key]}`);
}

test('external flip occupies its fitted PDF slot and respects the output aspect fit and page origin',()=>{
  const source=annotationBounds([flip])!,fit=.2,width=.35;
  const inkWidth=(source.width-flip.width)*fit+width,inkHeight=(source.height-flip.width)*fit+width;
  const bounds={x:90-inkWidth/2,y:50-inkHeight/2,width:inkWidth,height:inkHeight};
  const layout={paper:square,main:[],symbols:[{annotation:flip,side:'right' as const,x:90,y:50,source,bounds,scale:fit,penWidth:width,maxPenWidth:width}]};
  const geometry=diagramExportObstacles({...step,annotations:[flip]},{x:30,y:20,width:400,height:200},square,{layout,cpBounds:square});
  assert.equal(geometry.symbols.length,1);
  close(geometry.subject,{x:130,y:20,width:200,height:200});
  close(geometry.symbols[0],{x:130+bounds.x*2,y:20+bounds.y*2,width:bounds.width*2,height:bounds.height*2});
});

test('quarter turn applies to all authored images before taking their combined extent',()=>{
  const image:DiagramImage={id:'a',dataUrl:'',name:'',position:[0,0],width:20,height:10,pixelWidth:20,pixelHeight:10,rotation:90,source:'file'};
  const geometry=diagramExportObstacles({...step,canvas:{...defaultDiagramCanvas(),drawingRotation:90},images:[
    image,{...image,id:'b',position:[30,15],rotation:0}
  ]},square,square);
  // First image extends to y=-5 before the quarter turn and is clipped at the right of the viewport.
  close(geometry.subject,{x:75,y:5,width:25,height:45});
});

test('local zoom clips magnifiers and preserves the exterior independently rendered symbols',()=>{
  const outside={...flip,position:[85,50] as [number,number],size:8};
  const geometry=diagramExportObstacles({...step,annotations:[outside],callouts:[{
    id:'cp',source:{kind:'cp',stateId:'a',center:[40,40],radius:4,locator:{center:[48,50],radius:1}},target:{center:[90,80],radius:3}
  }]},square,square,{zoom:{kind:'circle',center:[50,50],radius:10}});
  close(geometry.subject,{x:40,y:40,width:20,height:20});
  assert.equal(geometry.symbols.length,2);
  close(geometry.symbols[0],annotationBounds([outside])!);
  close(geometry.symbols[1],{x:46.65,y:48.65,width:2.7,height:2.7});
});

test('a blank panel has no fabricated subject or obstacles',()=>{
  assert.deepEqual(diagramExportObstacles(step,square,square),{symbols:[]});
});
