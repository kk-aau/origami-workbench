import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLParser} from 'fast-xml-parser';
import {creasePatternSVG,DISPLAY_PIXEL_MM} from '../../src/app/creasePatternSVG';
import {defaultCreaseDisplay} from '../../src/app/creaseDisplay';
import {defaultDisplayLayers} from '../../src/app/displayLayers';
import {defaultGridAppearance} from '../../src/app/gridAppearance';
import {diagonalGridFamilies,paperGridGeometry,triangularGridTile} from '../../src/app/gridGeometry';
import {getPaperBounds,getGridReferenceBounds} from '../../src/app/paper';
import {blankDoc,exampleDoc,line} from '../../src/app/state';
const parse=(text:string)=>new XMLParser({ignoreAttributes:false}).parse(text).svg;

test('square and triangular export grids retain exact spacing through 512 divisions and reject 513',()=>{
 const doc=blankDoc('密网格导出',320,160),before=structuredClone(doc),display=defaultCreaseDisplay();
 for(const pattern of ['square','triangular'] as const){
  for(const divisions of [128,129,256,512]){
   const svg=parse(creasePatternSVG(doc,display,undefined,undefined,undefined,{divisions,pattern})),tile=svg.g.defs.pattern,step=320/divisions;
   assert.equal(Number(tile['@_width']),step);
   const height=pattern==='square'?step:step*Math.sqrt(3);
   assert.ok(Math.abs(Number(tile['@_height'])-height)<1e-12);
   assert.equal(tile['@_patternTransform'],'translate(0 0)');assert.equal(svg.g.path['@_d'],svg.path['@_d']);
  }
  assert.throws(()=>creasePatternSVG(doc,display,undefined,undefined,undefined,{divisions:513,pattern}),/1—512/);
 }
 assert.deepEqual(doc,before);
});

test('grid reference stays fixed through removed, partial, distant and reclosed boundaries',()=>{
 const initial=blankDoc('固定网格参考',300,300),display=defaultCreaseDisplay();
 const empty={...initial,segments:[]},single={...empty,segments:[line([40,50],[210,50],'B')]};
 const distant={...single,segments:[...single.segments,line([100000,-100000],[100100,-99900],'A')],objects:[{id:'far-circle',kind:'circle' as const,center:[-10000,90000] as [number,number],radius:800,color:'#123456'}]};
 const reclosed={...distant,segments:[...distant.segments,line([210,50],[210,230],'B'),line([210,230],[40,230],'B'),line([40,230],[40,50],'B')]};
 const stages=[initial,empty,single,distant,reclosed];
 for(const format of ['square','triangular'] as const){
  const options={divisions:6,pattern:format,rotation:33,diagonal:true};
  const initialSVG=parse(creasePatternSVG(initial,display,undefined,undefined,undefined,options)),expectedPattern=initialSVG.g.defs.pattern;
  assert.equal(Number(expectedPattern['@_width']),50);
  for(const [index,doc] of stages.entries()){
   const before=structuredClone(doc),svg=parse(creasePatternSVG(doc,display,undefined,undefined,undefined,options)),plain=parse(creasePatternSVG(doc,display));
   assert.deepEqual(svg.g.defs.pattern,expectedPattern,'cell size, origin and rotation centre never follow boundary/object edits');
   assert.equal(svg['@_viewBox'],plain['@_viewBox'],'grid fallback does not alter the exported content bounds');
   assert.deepEqual(svg.path,plain.path,'reference rectangle is never fabricated into a white paper face');
   assert.deepEqual(svg.line,plain.line);assert.deepEqual(doc,before);
   assert.equal(svg.g['@_data-export-grid'],'paper');
   if(index>0&&index<4){
    assert.equal(svg.path['@_d'],'');assert.equal(svg.g.path,undefined);
    assert.deepEqual(svg.g.rect,{'@_data-grid-reference-fallback':'true','@_x':'0','@_y':'0','@_width':'300','@_height':'300','@_fill':'url(#cp-export-grid)'});
   }else{assert.equal(svg.g.rect,undefined);assert.equal(svg.g.path['@_d'],svg.path['@_d']);}
  }
  const crop={x:-200,y:-150,width:900,height:800},canvas=parse(creasePatternSVG(distant,display,crop,undefined,undefined,{...options,scope:'canvas'}));
  assert.equal(canvas.g['@_data-export-grid'],'canvas');assert.deepEqual(canvas.g.defs.pattern,expectedPattern);
  assert.deepEqual(canvas.g.rect,{'@_x':'-200','@_y':'-150','@_width':'900','@_height':'800','@_fill':'url(#cp-export-grid)'});
 }
});

test('explicit square and diagonal grid exports keep equal cell sides while rotating about the paper centre',()=>{
 const doc=exampleDoc(),display=defaultCreaseDisplay();
 for(const segment of doc.segments)for(const p of [segment.a,segment.b]){p[0]=p[0]*2-300;p[1]-=50;}
 doc.paper={...doc.paper,width:400,height:200};
 const before=structuredClone(doc),plain=parse(creasePatternSVG(doc,display)),centre=[200,100];
 for(const rotation of [0,22.5,45,90,-30,360])for(const diagonal of [false,true]){
  const normalized=((rotation+180)%360+360)%360-180,radians=normalized*Math.PI/180;
  const origin=[centre[0]-200*Math.cos(radians)+100*Math.sin(radians),centre[1]-200*Math.sin(radians)-100*Math.cos(radians)];
  const text=creasePatternSVG(doc,display,undefined,undefined,undefined,{divisions:8,pattern:'square',diagonal,rotation}),svg=parse(text),pattern=svg.g.defs.pattern;
  assert.equal(Number(pattern['@_width']),50);assert.equal(Number(pattern['@_height']),50,'square cell height does not follow rectangular paper height');
  const match=pattern['@_patternTransform'].match(/^translate\(([^ ]+) ([^)]+)\)(?: rotate\(([^)]+)\))?$/)!;
  assert.ok(match);assert.ok(Math.hypot(Number(match[1])-origin[0],Number(match[2])-origin[1])<1e-9);assert.equal(Number(match[3]??0),normalized);
  const fromTile=(x:number,y:number)=>[Number(match[1])+x*Math.cos(radians)-y*Math.sin(radians),Number(match[2])+x*Math.sin(radians)+y*Math.cos(radians)];
  const anchor=fromTile(200,100);assert.ok(Math.hypot(anchor[0]-centre[0],anchor[1]-centre[1])<1e-9,'paper centre is fixed by the grid transform');
  const a=fromTile(50,0),b=fromTile(0,50),u=[a[0]-origin[0],a[1]-origin[1]],v=[b[0]-origin[0],b[1]-origin[1]];
  assert.ok(Math.abs(Math.hypot(...u)-50)<1e-9&&Math.abs(Math.hypot(...v)-50)<1e-9);assert.ok(Math.abs(u[0]*v[0]+u[1]*v[1])<1e-8);
  if(diagonal)assert.equal(pattern.path[1]['@_d'],'M 0 0 L 50 50 M 50 0 L 0 50');
  else assert.ok(!Array.isArray(pattern.path));
  assert.equal(svg.g.path['@_d'],svg.path['@_d']);assert.deepEqual(svg.line,plain.line);
 }
 assert.deepEqual(doc,before);
});

test('rotated square export leaves clipping and holes unrotated and huge export ranges remain bounded',()=>{
 const doc=exampleDoc(),display=defaultCreaseDisplay();
 doc.segments.push(line([50,50],[150,50],'B'),line([150,50],[150,150],'B'),line([150,150],[50,150],'B'),line([50,150],[50,50],'B'));
 const crop={x:-1e8,y:-1e8,width:2e8,height:2e8},options={divisions:8,pattern:'square' as const,diagonal:true,rotation:45};
 const paper=parse(creasePatternSVG(doc,display,undefined,undefined,undefined,options));
 assert.equal(paper.g.path['@_fill-rule'],'evenodd');assert.equal(paper.g.path['@_d'],paper.path['@_d']);assert.equal(paper.g.path['@_transform'],undefined);
 const text=creasePatternSVG(doc,display,crop,undefined,undefined,{...options,scope:'canvas'}),canvas=parse(text);
 assert.ok(text.length<20000);assert.ok(!Array.isArray(canvas.g.defs.pattern));
 assert.deepEqual(canvas.g.rect,{'@_x':'-100000000','@_y':'-100000000','@_width':'200000000','@_height':'200000000','@_fill':'url(#cp-export-grid)'});
 for(const rotation of [NaN,Infinity,-Infinity,'45',null])assert.throws(()=>creasePatternSVG(doc,display,undefined,undefined,undefined,{...options,rotation:rotation as never}),/旋转/);
});

test('square rotation does not rotate triangular exports, and legacy angle overlays rotate only once',()=>{
 const doc=exampleDoc(),display=defaultCreaseDisplay(),options={divisions:8,pattern:'triangular' as const};
 const triangle=creasePatternSVG(doc,display,undefined,undefined,undefined,options);
 for(const rotation of [0,45,-90,360])assert.equal(creasePatternSVG(doc,display,undefined,undefined,undefined,{...options,rotation}),triangle);
 const rotated=parse(creasePatternSVG(doc,display,undefined,undefined,undefined,{divisions:8,pattern:'square',rotation:30,diagonal:true,diagonalAngle:22.5}));
 const patterns=rotated.g.defs.pattern;assert.equal(patterns.length,3);
 assert.match(patterns[0]['@_patternTransform'],/rotate\(30\)$/);
 assert.equal(Number(patterns[1]['@_data-grid-angle']),7.5);assert.equal(Number(patterns[2]['@_data-grid-angle']),52.5);
 assert.match(patterns[1]['@_patternTransform'],/rotate\(7.5\)$/);assert.match(patterns[2]['@_patternTransform'],/rotate\(52.5\)$/);
 assert.equal(Number(patterns[0]['@_width']),Number(patterns[0]['@_height']));
});

test('triangular export tiles remain equilateral on shifted rectangular paper and share the canvas geometry',()=>{
 const doc=exampleDoc(),display=defaultCreaseDisplay();
 for(const segment of doc.segments)for(const p of [segment.a,segment.b]){p[0]=p[0]*2-300;p[1]-=50;}
 doc.paper={...doc.paper,width:400,height:200};
 const before=structuredClone(doc),options={divisions:8,pattern:'triangular' as const,appearance:{...defaultGridAppearance(),gridColor:'#123456',lineWidth:1.2}};
 const text=creasePatternSVG(doc,display,undefined,undefined,undefined,options),svg=parse(text),pattern=svg.g.defs.pattern;
 const side=50,height=side*Math.sqrt(3)/2;
 assert.equal(svg.g['@_data-grid-pattern'],'triangular');assert.equal(Number(pattern['@_width']),side);
 assert.ok(Math.abs(Number(pattern['@_height'])-height*2)<1e-10,'row spacing comes from equilateral triangles, not the rectangular paper height');
 assert.equal(pattern['@_patternTransform'],'translate(0 0)','grid reference does not follow a shifted boundary');
 assert.equal(pattern.path['@_stroke'],'#123456');assert.equal(Number(pattern.path['@_stroke-width']),1.2*DISPLAY_PIXEL_MM);
 assert.equal(pattern.path['@_d'],triangularGridTile(paperGridGeometry(getGridReferenceBounds(doc),8,{pattern:'triangular'})).path);
 const edges:number[][]=[];let from=[0,0];
 for(const command of pattern.path['@_d'].matchAll(/([MLHV])([^MLHV]+)/g)){
  const numbers=command[2].trim().split(/[ ,]+/).map(Number),next=command[1]==='H'?[numbers[0],from[1]]:command[1]==='V'?[from[0],numbers[0]]:numbers;
  if(command[1]!=='M')edges.push([...from,...next]);from=next;
 }
 const angles=edges.map(([x1,y1,x2,y2])=>Math.atan2(y2-y1,x2-x1)*180/Math.PI);
 assert.ok(angles.every(angle=>Math.abs(angle)<1e-9||Math.abs(Math.abs(angle)-60)<1e-9||Math.abs(Math.abs(angle)-120)<1e-9),'only horizontal and 60-degree line families are present');
 assert.equal(edges.filter(([x1,y1,x2,y2])=>y1===y2).length,3,'both tile borders are stroked to avoid alternating half-width rows');
 const diagonal=edges.filter(([,y1,,y2])=>y1!==y2);assert.equal(diagonal.length,2);
 for(const [x1,y1,x2,y2] of diagonal){assert.ok(Math.abs((x1+x2)/2-side/2)<1e-10);assert.ok(Math.abs((y1+y2)/2-height)<1e-10);}
 assert.equal(svg.g.path['@_d'],svg.path['@_d']);assert.equal(svg.g.path['@_fill-rule'],svg.path['@_fill-rule']);
 assert.deepEqual(svg.line,parse(creasePatternSVG(doc,display)).line);assert.deepEqual(doc,before);
 assert.equal(creasePatternSVG(doc,display,undefined,undefined,undefined,{...options,diagonal:true,diagonalAngle:30}),text,'old diagonal settings cannot overlay square lines on the triangular format');
});

test('triangular export preserves holes and uses one bounded periodic tile even for distant full-canvas crops',()=>{
 const doc=exampleDoc(),display=defaultCreaseDisplay();
 doc.segments.push(line([50,50],[150,50],'B'),line([150,50],[150,150],'B'),line([150,150],[50,150],'B'),line([50,150],[50,50],'B'));
 const paper=parse(creasePatternSVG(doc,display,undefined,undefined,undefined,{divisions:8,pattern:'triangular'}));
 assert.equal(paper.g.path['@_fill-rule'],'evenodd');assert.equal(paper.g.path['@_d'],paper.path['@_d']);
 const crop={x:-1e8,y:-1e8,width:2e8,height:2e8},text=creasePatternSVG(doc,display,crop,undefined,undefined,{divisions:512,pattern:'triangular',scope:'canvas'}),canvas=parse(text);
 assert.ok(text.length<20000);assert.ok(!Array.isArray(canvas.g.defs.pattern));
 assert.deepEqual(canvas.g.rect,{'@_x':'-100000000','@_y':'-100000000','@_width':'200000000','@_height':'200000000','@_fill':'url(#cp-export-grid)'});
 for(const pattern of ['hexagon','',null])assert.throws(()=>creasePatternSVG(doc,display,undefined,undefined,undefined,{divisions:8,pattern:pattern as never}),/网格/);
});

test('custom grid angles export the same periodic line families without unbounded path enumeration',()=>{
 const doc=exampleDoc(),display=defaultCreaseDisplay();
 for(const segment of doc.segments)for(const p of [segment.a,segment.b]){p[0]=p[0]*2-300;p[1]-=50;}
 const before=structuredClone(doc);
 for(const diagonalAngle of [15,22.5,30,45,89.9]){
  const families=diagonalGridFamilies(paperGridGeometry(getPaperBounds(doc),8,{diagonal:true,diagonalAngle}));
  const svg=parse(creasePatternSVG(doc,display,undefined,undefined,undefined,{divisions:8,diagonal:true,diagonalAngle}));
  const patterns=svg.g.defs.pattern;assert.equal(patterns.length,3);
  for(let i=0;i<2;i++){
   const pattern=patterns[i+1];assert.equal(Number(pattern['@_data-grid-angle']),families[i].angle);
   assert.equal(Number(pattern['@_height']),families[i].step);
   assert.equal(pattern['@_patternTransform'],`translate(-300 -50) rotate(${families[i].angle})`);
   assert.equal(svg.g.path[i+1]['@_d'],svg.path['@_d']);assert.equal(svg.g.path[i+1]['@_fill-rule'],svg.path['@_fill-rule']);
  }
 }
 const large=creasePatternSVG(doc,display,{x:-1e8,y:-1e8,width:2e8,height:2e8},undefined,undefined,{divisions:8,diagonal:true,diagonalAngle:89.9,scope:'canvas'});
 assert.ok(large.length<20000);assert.equal(parse(large).g.rect.length,3);
 for(const diagonalAngle of [0,90,NaN])assert.throws(()=>creasePatternSVG(doc,display,undefined,undefined,undefined,{divisions:8,diagonal:true,diagonalAngle}),/角度/);
 const off=creasePatternSVG(doc,display,undefined,undefined,undefined,{divisions:8,diagonal:false,diagonalAngle:30});assert.doesNotMatch(off,/data-grid-angle/);
 assert.deepEqual(doc,before);
});

test('optional export grid follows shifted rectangular paper and crop without changing crease data',()=>{
 const doc=exampleDoc();doc.segments.forEach(s=>{for(const p of [s.a,s.b]){p[0]=p[0]*2-300;p[1]-=50;}});
 const before=structuredClone(doc),display=defaultCreaseDisplay(),crop={x:-240,y:-30,width:80,height:70};
 const plain=creasePatternSVG(doc,display,crop),text=creasePatternSVG(doc,display,crop,undefined,undefined,{divisions:8,diagonal:true,appearance:{...defaultGridAppearance(),gridColor:'#123456',diagonalColor:'#abcdef',lineWidth:1.2}}),svg=parse(text);
 assert.doesNotMatch(plain,/data-export-grid/);assert.deepEqual(svg.line,parse(plain).line);
 assert.equal(svg['@_viewBox'],'-240 -30 80 70');assert.equal(svg.g['@_data-export-grid'],'paper');
 const pattern=svg.g.defs.pattern;assert.equal(Number(pattern['@_width']),50);assert.equal(Number(pattern['@_height']),25);
 assert.equal(pattern['@_patternTransform'],'translate(-300 -50)');assert.equal(pattern.path[0]['@_stroke'],'#123456');assert.equal(pattern.path[1]['@_stroke'],'#abcdef');
 assert.equal(Number(pattern.path[0]['@_stroke-width']),1.2*DISPLAY_PIXEL_MM);
 assert.equal(svg.g.path['@_d'],svg.path['@_d']);assert.equal(svg.g.path['@_fill-rule'],svg.path['@_fill-rule']);
 assert.ok(text.indexOf('data-export-grid')<text.indexOf('<line '),'grid stays behind crease strokes');assert.deepEqual(doc,before);
});

test('full-area grid covers export bounds and paper grid preserves holes without inventing boundaries',()=>{
 const doc=exampleDoc();
 doc.segments.push(line([50,50],[150,50],'B'),line([150,50],[150,150],'B'),line([150,150],[50,150],'B'),line([50,150],[50,50],'B'));
 const paper=parse(creasePatternSVG(doc,defaultCreaseDisplay(),undefined,undefined,undefined,{divisions:4}));
 assert.equal(paper.g.path['@_fill-rule'],'evenodd');assert.equal(paper.g.path['@_d'],paper.path['@_d']);assert.equal(paper.g.defs.pattern.path['@_stroke'],'#d9e1d6');
 const crop={x:-20,y:-10,width:250,height:230},canvas=parse(creasePatternSVG(doc,defaultCreaseDisplay(),crop,undefined,undefined,{divisions:4,scope:'canvas'}));
 assert.deepEqual(canvas.g.rect,{'@_x':'-20','@_y':'-10','@_width':'250','@_height':'230','@_fill':'url(#cp-export-grid)'});
 doc.segments=doc.segments.filter(s=>s.assignment!=='B');
 const open=parse(creasePatternSVG(doc,defaultCreaseDisplay(),crop,undefined,undefined,{divisions:4}));assert.equal(open.path['@_d'],'');assert.ok(open.g.rect);
 for(const divisions of [0,513,1.5,NaN])assert.throws(()=>creasePatternSVG(doc,defaultCreaseDisplay(),undefined,undefined,undefined,{divisions}),/网格/);
});
test('crease image export with adaptation disabled shares exact legacy styles and physical widths, preserving document data',()=>{
 const doc=exampleDoc();doc.segments.push({...line([20,20],[40,40],'A'),displayColor:'#abcdef'});const before=structuredClone(doc);
 const svg=parse(creasePatternSVG(doc,{...defaultCreaseDisplay(),lineWidth:4,auxLineWidth:2,roundedEnds:true,lineStyle:'BLACK_TWO_DOT'},undefined,undefined,{enabled:false}));
 assert.equal(svg['@_width'],'200mm');assert.equal(svg['@_viewBox'],'0 0 200 200');
 const mountain=svg.line.find((stroke:Record<string,string>)=>stroke['@_x1']==='50'&&stroke['@_x2']==='50'),aux=svg.line.find((stroke:Record<string,string>)=>stroke['@_x1']==='20'&&stroke['@_y1']==='20'&&stroke['@_x2']==='40'&&stroke['@_y2']==='40');
 assert.equal(mountain['@_stroke'],'#000000');assert.equal(mountain['@_stroke-linecap'],'round');assert.equal(Number(mountain['@_stroke-width']),4*DISPLAY_PIXEL_MM);
 assert.deepEqual(mountain['@_stroke-dasharray'].split(' ').map(Number),[10,3,3,3,3,3].map(n=>n*DISPLAY_PIXEL_MM));
 assert.equal(aux['@_stroke'],'#abcdef');assert.equal(Number(aux['@_stroke-width']),2*DISPLAY_PIXEL_MM);assert.deepEqual(doc,before);
});
test('solid style removes M/V dashes and crop retains requested origin and physical dimensions',()=>{
 const svg=parse(creasePatternSVG(exampleDoc(),{...defaultCreaseDisplay(),lineStyle:'COLOR'},{x:-10,y:15,width:30,height:40}));
 assert.equal(svg['@_viewBox'],'-10 15 30 40');assert.equal(svg['@_width'],'30mm');assert.equal(svg['@_height'],'40mm');assert.equal(svg['@_overflow'],'hidden');assert.ok(svg.line.every((l:Record<string,unknown>)=>l['@_stroke-dasharray']===undefined));
});

test('auxiliary image strokes follow the selected display style without changing fold data or other strokes',()=>{
 const doc=exampleDoc();doc.segments.push({...line([20,20],[40,40],'A'),displayColor:'#abcdef'});
 const before=structuredClone(doc),display={...defaultCreaseDisplay(),auxLineWidth:3};
 const solid=parse(creasePatternSVG(doc,display)),dashed=parse(creasePatternSVG(doc,{...display,auxLineStyle:'dashed'},undefined,undefined,{enabled:false}));
 const isAux=(stroke:Record<string,string>)=>stroke['@_x1']==='20'&&stroke['@_y1']==='20'&&stroke['@_x2']==='40'&&stroke['@_y2']==='40';
 assert.equal(solid.line.find(isAux)['@_stroke-dasharray'],undefined);
 assert.deepEqual(dashed.line.find(isAux)['@_stroke-dasharray'].split(' ').map(Number),[2,5].map(n=>n*DISPLAY_PIXEL_MM));
 for(const svg of [solid,dashed]){
  assert.equal(svg.line.find(isAux)['@_stroke'],'#abcdef');
  assert.equal(Number(svg.line.find(isAux)['@_stroke-width']),3*DISPLAY_PIXEL_MM);
 }
 assert.deepEqual(solid.line.filter((stroke:Record<string,string>)=>!isAux(stroke)),dashed.line.filter((stroke:Record<string,string>)=>!isAux(stroke)));assert.deepEqual(doc,before);
});
test('export rejects invalid bounds and unvalidated geometry or display values',()=>{
 const doc=exampleDoc(),display=defaultCreaseDisplay();
 for(const width of [0,-1,NaN,Infinity])assert.throws(()=>creasePatternSVG(doc,display,{x:0,y:0,width,height:10}));
 assert.throws(()=>creasePatternSVG(doc,{...display,lineWidth:NaN}));
 doc.segments[0].a[0]=NaN;assert.throws(()=>creasePatternSVG(doc,display));
});

test('image exports preserve explicit point shape and body size without a stroke shell',()=>{
 const doc=exampleDoc(),before=structuredClone(doc);
 for(const pointStyle of ['circle','square'] as const)for(const lineWidth of [1,8]){
  const display={...defaultCreaseDisplay(),pointSize:4,pointStyle,lineWidth};
  const markers=parse(creasePatternSVG(doc,display)).g;
  assert.equal(markers['@_fill'],'#000000');assert.equal(markers['@_stroke'],'none');assert.equal(markers['@_stroke-width'],undefined);
  if(pointStyle==='circle'){
   assert.equal(markers.rect,undefined);
   assert.ok(markers.circle.every((point:Record<string,string>)=>Number(point['@_r'])===4*DISPLAY_PIXEL_MM));
  }else{
   assert.equal(markers.circle,undefined);
   assert.ok(markers.rect.every((point:Record<string,string>)=>Number(point['@_width'])===8*DISPLAY_PIXEL_MM&&Number(point['@_height'])===8*DISPLAY_PIXEL_MM));
  }
  assert.equal(parse(creasePatternSVG(doc,{...display,pointSize:0})).g,undefined);
 }
 assert.deepEqual(doc,before);
});

test('hollow point image export keeps the original colors and puts the ring inside the requested radius',()=>{
 const doc=exampleDoc(),before=structuredClone(doc);
 for(const pointSize of [1,6,12])for(const lineWidth of [.5,8,20]){
  const markers=parse(creasePatternSVG(doc,{...defaultCreaseDisplay(),pointStyle:'hollow',pointSize,lineWidth})).g;
  assert.equal(markers['@_fill'],'#fffefb');assert.equal(markers['@_stroke'],'#5a7365');
  const width=Number(markers['@_stroke-width']);assert.equal(width,1.15*DISPLAY_PIXEL_MM);
  assert.equal(markers.rect,undefined);
  assert.ok(markers.circle.every((point:Record<string,string>)=>Math.abs(Number(point['@_r'])+width/2-pointSize*DISPLAY_PIXEL_MM)<1e-12));
 }
 assert.deepEqual(doc,before);
});

test('image layers hide strokes and annotations without cropping the paper or changing source data',()=>{
 const doc=exampleDoc();doc.segments.push(line([20,20],[40,40],'A'));
 doc.objects=[{id:'note',kind:'text',position:[20,20],text:'说明',fontSize:5,color:'#123456'},
  {id:'mark',kind:'mark',a:[30,30],b:[40,30],color:'#abcdef'},
  {id:'circle',kind:'circle',center:[50,50],radius:10,color:'#fedcba'}];
 const before=structuredClone(doc),display={...defaultCreaseDisplay(),pointSize:3};
 const render=(main:boolean,auxiliary:boolean,marks:boolean,comments:boolean)=>parse(creasePatternSVG(doc,display,undefined,{main,auxiliary,marks,comments}));
 const all=render(true,true,true,true),none=render(false,false,false,false);
 assert.equal(none.line,undefined);assert.equal(none.text,undefined);assert.equal(none.g,undefined);
 assert.equal(none.circle['@_stroke'],'#fedcba'); // Circles remain independently visible, as on canvas.
 assert.deepEqual(none.path,all.path);assert.equal(none['@_viewBox'],all['@_viewBox']);
 const aux=render(false,true,false,false);assert.equal(aux.line['@_x1'],'20');assert.equal(aux.g,undefined);
 const marks=render(false,false,true,false);assert.equal(marks.line['@_stroke'],'#abcdef');
 const text=render(false,false,false,true);assert.equal(text.text.tspan['#text'],'说明');
 const main=render(true,false,false,false);assert.equal(main.line.length,doc.segments.length-1);assert.ok(main.g);
 assert.deepEqual(doc,before);
 assert.deepEqual(parse(creasePatternSVG(doc,display)),all);
 const crop=parse(creasePatternSVG(doc,display,{x:10,y:20,width:30,height:40},{main:false,auxiliary:false,marks:false,comments:false}));
 assert.equal(crop['@_viewBox'],'10 20 30 40');
 assert.throws(()=>creasePatternSVG(doc,display,undefined,{...defaultDisplayLayers(),main:'false' as never}),/布尔值/);
});
