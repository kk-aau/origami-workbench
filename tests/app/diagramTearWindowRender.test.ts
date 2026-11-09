import test from 'node:test';
import assert from 'node:assert/strict';
import {XMLParser} from 'fast-xml-parser';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';
import {createDiagramProject,adoptDiagramPose,type DiagramPose} from '../../src/app/diagramProject';
import type {DiagramAnnotation,DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import type {DiagramFoldPreviewSegment} from '../../src/app/diagramFoldLinkTypes';
import {diagramModelMarkup,drawingSVG} from '../../src/app/diagramDrawing';
import {diagramTearWindowRender} from '../../src/app/diagramTearWindowRender';
import {diagramTearWindowPath} from '../../src/app/diagramTearWindowGeometry';
import {diagramPDFCoverSVG,diagramPDFStepSVG} from '../../src/app/diagramPDF';

function fixture(){
  const doc=blankDoc('局部撕纸透视',100,100);
  doc.segments.push({id:'retained-valley',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(result.geometry.status,'ready');assert.equal(result.geometry.faces.length,2);
  const pose:DiagramPose={sourceStateId:'source',sourceRevision:0,sourceDoc:doc,result,view:defaultModelView()};
  const window:DiagramSymbolAnnotation={id:'window',kind:'symbol',symbol:'tearWindow',position:[25,50],size:100,rotation:0,color:'#483b24',width:.7,params:{radius:12},cutawayFaces:[0]};
  return {doc,result,pose,window};
}
const parse=(markup:string)=>new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@'}).parse(markup);
function nodes(tree:unknown,predicate:(node:Record<string,unknown>)=>boolean):Array<{node:Record<string,unknown>;masks:string[]}>{
  const found:Array<{node:Record<string,unknown>;masks:string[]}>=[];
  function visit(value:unknown,inherited:string[]){
    if(Array.isArray(value)){for(const item of value)visit(item,inherited);return;}
    if(!value||typeof value!=='object')return;
    const node=value as Record<string,unknown>,mask=typeof node['@mask']==='string'?node['@mask']:undefined,masks=mask?[...inherited,mask]:inherited;
    if(predicate(node))found.push({node,masks});
    for(const [key,child] of Object.entries(node))if(!key.startsWith('@'))visit(child,masks);
  }
  visit(tree,[]);return found;
}
function validReferences(svg:string){
  const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,'mask/window IDs are unique within this SVG');
  const references=[...svg.matchAll(/(?:mask|href)="(?:url\(#([^)]*)\)|#([^"]*))"/g)].map(match=>match[1]??match[2]);
  for(const reference of references)assert.ok(ids.includes(reference),`resolved SVG resource ${reference}`);
  return ids;
}

test('a tear window clips only selected original paper faces and never changes the material snapshot',()=>{
  const {pose,window}=fixture(),saved=structuredClone({pose,window});
  const markup=diagramModelMarkup(pose,undefined,false,[window]),tree=parse(`<svg>${markup}</svg>`);
  const first=nodes(tree,node=>node['@data-diagram-paper-face']==='0'),second=nodes(tree,node=>node['@data-diagram-paper-face']==='1');
  assert.equal(first.length,1);assert.equal(second.length,1);
  assert.equal(first[0].masks.length,1,'the selected original face uses a local mask');
  assert.equal(second[0].masks.length,0,'the original lower paper remains intact');
  assert.ok(markup.includes(`d="${diagramTearWindowPath(window)}"`));
  assert.match(markup,/maskUnits="userSpaceOnUse"/);assert.match(markup,/mask-type="luminance"/);
  validReferences(markup);assert.deepEqual({pose,window},saved);
  assert.equal(diagramModelMarkup(pose),diagramModelMarkup(pose,undefined,false,[]));
  assert.equal(diagramModelMarkup(pose),diagramModelMarkup(pose,undefined,false,[{...window,cutawayFaces:[]}]));
});

test('overlapping windows hide their union on a face and multi-layer lines retain any surviving contributing paper',()=>{
  const {pose,window}=fixture(),right:DiagramSymbolAnnotation={...window,id:'right',position:[35,50],cutawayFaces:[1]};
  const annotations:DiagramAnnotation[]=[window,right,{id:'both',kind:'line',a:[0,50],b:[50,50],style:'crease',foldFaces:[0,1],color:'#012345',width:.7}];
  const renderer=diagramTearWindowRender(pose,annotations),first=renderer.maskForFaces([0]),second=renderer.maskForFaces([1]),combined=renderer.maskForFaces([0,1]);
  assert.ok(first&&second&&combined);assert.notEqual(first,second);assert.notEqual(combined,first);
  assert.equal(renderer.maskForFaces([1,0,1]),combined,'source face ordering does not alter intersection semantics');
  const tree=parse(`<svg><defs>${renderer.definitions}</defs></svg>`),maskId=combined.slice(5,-1);
  const composite=nodes(tree,node=>node['@id']===maskId)[0].node;
  assert.equal(nodes(composite,node=>node['@fill']==='black').length,1,'the combined mask starts hidden');
  const layers=nodes(composite,node=>node['@fill']==='white');assert.equal(layers.length,2);
  assert.deepEqual(new Set(layers.map(({node})=>node['@mask'])),new Set([first,second]),'visible face complements are united, so only jointly hidden regions disappear');
  const oneWindow=diagramTearWindowRender(pose,[window]);assert.equal(oneWindow.maskForFaces([0,1]),undefined,'an uncut underlying face keeps its shared crease');
  const overlap=diagramTearWindowRender(pose,[window,{...right,cutawayFaces:[0]}]);
  const overlapMaskId=overlap.maskForFaces([0])!.slice(5,-1),overlapTree=parse(`<svg><defs>${overlap.definitions}</defs></svg>`);
  const sameFace=nodes(overlapTree,node=>node['@id']===overlapMaskId)[0].node;
  assert.equal(nodes(sameFace,node=>typeof node['@href']==='string').length,2,'both black window regions are painted, including their overlap');
  assert.equal(nodes(sameFace,node=>node['@fill-rule']==='evenodd').length,0,'overlapping windows must not become an XOR hole');
  validReferences(`<svg><defs>${renderer.definitions}</defs>${renderer.wrapFaces([0,1],'<line/>')}</svg>`);
});

test('global visibility, transformed windows and repeated thumbnail namespaces remain independent',()=>{
  const {pose,window}=fixture(),transformed={...window,rotation:37,mirrored:true,size:150},hidden={...pose,hiddenFaces:[1]};
  const renderer=diagramTearWindowRender(hidden,[transformed]);
  assert.ok(renderer.maskForFaces([0,1]),'a globally hidden face cannot restore the cut line of another face');
  assert.ok(renderer.definitions.includes(`d="${diagramTearWindowPath(transformed)}"`));
  const fullyHidden=diagramTearWindowRender({...pose,hiddenFaces:[0]},[transformed]);assert.equal(fullyHidden.definitions,'');
  const first=diagramModelMarkup(pose,undefined,false,[transformed]),second=diagramModelMarkup(pose,undefined,false,[transformed]);
  const firstIds=validReferences(first),secondIds=validReferences(second);
  assert.ok(firstIds.length>0&&secondIds.length>0);assert.ok(firstIds.every(id=>!secondIds.includes(id)),'multiple inline SVGs cannot bind another thumbnail’s mask');
});

test('SVG and PDF step artwork mask face-bound folds while independent lines and symbols keep their normal artwork',()=>{
  const {doc,result,pose,window}=fixture();
  const linked:DiagramAnnotation={id:'linked',kind:'line',a:[0,25],b:[50,25],style:'valley',foldFaces:[0],color:'#dd1122',width:1};
  const direct:DiagramAnnotation={id:'direct',kind:'line',a:[0,50],b:[50,50],style:'crease',foldFaces:[0],color:'#2233dd',width:1};
  const lower:DiagramAnnotation={...direct,id:'lower',foldFaces:[1],color:'#44aa33'};
  const free:DiagramAnnotation={...direct,id:'independent',foldFaces:[],color:'#aa22bb'};
  const arrow:DiagramSymbolAnnotation={id:'arrow',kind:'symbol',symbol:'fold',position:[25,50],size:25,rotation:18,color:'#118899',width:1};
  const annotations=[window,linked,direct,lower,free,arrow],saved=structuredClone({pose,annotations});
  const preview:DiagramFoldPreviewSegment[]=[{face:0,a:[0,25],b:[50,25],assignment:'V',visibility:'visible'}];
  function validate(svg:string){
    const tree=parse(svg);
    for(const color of ['#dd1122','#2233dd'])assert.ok(nodes(tree,node=>node['@stroke']===color).some(({masks})=>masks.length===1),`face-bound ink ${color} is locally clipped`);
    for(const color of ['#44aa33','#aa22bb','#118899','#483b24']){const artwork=nodes(tree,node=>node['@stroke']===color||node['@color']===color);assert.ok(artwork.length>0&&artwork.every(({masks})=>masks.length===0),`independent/lower artwork ${color} stays intact`);}
    validReferences(svg);
  }
  validate(drawingSVG(pose,annotations,'撕纸透视','仅为步骤图示，不切割原纸',preview));
  let project=createDiagramProject(doc);project=adoptDiagramPose(project,project.activeStepId,project.states[0].id,result);
  project.steps[0].annotations=annotations;
  const pdf=diagramPDFStepSVG(project,project.steps[0]);
  // No CP-link preview was requested for this project; direct source lines
  // still carry their same original-face masks through the PDF SVG decoder.
  validate(pdf);assert.match(pdf,/data-pdf-main-artwork/);
  assert.doesNotMatch(diagramPDFCoverSVG(project,project.steps[0]),/diagram-cutaway-|data-diagram-cutaway-clipped/,'completion covers remain a saved-material overview, without instruction cutaways');
  assert.deepEqual({pose,annotations},saved);
});
