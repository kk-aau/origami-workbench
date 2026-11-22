import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DIAGRAM_EXPORT_VIEW_SYMBOL_SIZE,diagramExportMarkerPosition,diagramExportScaleLayout,diagramExportScaleMarkerSVG,hasDiagramExportScaleSymbol} from '../../src/app/diagramExportScaleMarker';
import {diagramAnnotationMarkup,diagramSymbolPreview,pointHitsDiagramSymbol,resolveDiagramSymbolInk} from '../../src/app/diagramAnnotationSVG';
import {DIAGRAM_SYMBOL_KINDS,type DiagramSymbolAnnotation,type DiagramSymbolKind} from '../../src/app/diagramAnnotations';
import {supportsDiagramSymbolFill,type DiagramSymbolStyles} from '../../src/app/diagramSymbolStyles';

function symbol(kind:DiagramSymbolKind):DiagramSymbolAnnotation {
  return {kind:'symbol',id:'placed',symbol:kind,position:[0,0],size:100,rotation:0,color:'#293d35',width:.7,cadProperties:{},appearanceOverrides:[]};
}
test('print markers share palette geometry, keep clear of the artwork and recognise an authored instruction',()=>{
  for(const rect of [{x:30,y:24,width:100,height:67},{x:0,y:0,width:5,height:12}]){
    const {artworkRect,markerRect}=diagramExportScaleLayout(rect);
    assert.deepEqual(artworkRect,rect);assert.ok(artworkRect.x+artworkRect.width<markerRect.x);
    assert.equal(artworkRect.height,rect.height);
    assert.equal(markerRect.y+markerRect.height/2,rect.y+rect.height/2);
    assert.ok(markerRect.x>=rect.x+rect.width);
    for(const kind of ['zoom','zoomOut'] as const){
      assert.ok(diagramExportScaleMarkerSVG(kind,markerRect).includes(diagramSymbolPreview(kind)));
      assert.match(diagramExportScaleMarkerSVG(kind,markerRect,{[kind]:{fill:'solid',color:'#796432'}}),/color="#796432"/);
      assert.ok(hasDiagramExportScaleSymbol({annotations:[symbol(kind)]},kind));
      assert.ok(!hasDiagramExportScaleSymbol({},kind));
    }
    assert.ok(!hasDiagramExportScaleSymbol({annotations:[symbol('zoom')]},'zoomOut'));
  }
});
test('centre beside the subject, choose the closest clear height, and fall back to the gutter if blocked',()=>{
  const panel={x:20,y:10,width:150,height:100},gutter=diagramExportScaleLayout(panel).markerRect;
  const subject={x:35,y:25,width:50,height:56};
  const place=(obstacles:typeof panel[])=>diagramExportMarkerPosition(panel,gutter,subject,obstacles);
  const centered=place([]),centerY=subject.y+subject.height/2,gap=2;
  assert.equal(centered.y+centered.height/2,centerY);
  assert.equal(centered.x,subject.x+subject.width+gap);
  assert.deepEqual(place([subject]),centered);
  const near={x:centered.x,y:centerY-3,width:12,height:6};
  const upper=place([near]);
  assert.equal(upper.x,centered.x);
  assert.ok(upper.y+upper.height<=near.y);
  const lower=place([near,{...near,y:panel.y,height:near.y-panel.y}]);
  assert.equal(lower.x,centered.x);
  assert.ok(lower.y>=near.y+near.height);
  assert.deepEqual(place([{...near,y:panel.y,height:panel.height}]),{...gutter,y:centered.y});
});
test('automatic view symbols have one print size across paper fits and arbitrary inter-step gaps',async()=>{
  for(const width of [5,100,1000])for(const height of [12,100,600]){
    const box=diagramExportScaleLayout({x:0,y:0,width,height}).markerRect;
    assert.equal(box.width,DIAGRAM_EXPORT_VIEW_SYMBOL_SIZE);assert.equal(box.height,DIAGRAM_EXPORT_VIEW_SYMBOL_SIZE);
  }
  const {blankDoc}=await import('../../src/app/state'),{createDiagramProject,appendDiagramStep}=await import('../../src/app/diagramProject');
  const {defaultDiagramPDFOptions,planDiagramPDF,diagramPDFPanelKey}=await import('../../src/app/diagramPDFLayout'),{diagramExportPagePanels}=await import('../../src/app/diagramExportPanel');
  let p=createDiagramProject(blankDoc('固定大小',100,100));while(p.steps.length<4)p=appendDiagramStep(p);
  const options={...defaultDiagramPDFOptions(p),cover:'none' as const,readingOrder:'snake' as const,scaleIndicators:true,layoutMode:'free' as const};
  const id=diagramPDFPanelKey(p,{stepIndex:1});
  for(const gap of [-.08,0,.15]){
    const settings={...options,panelPlacements:{[id]:{x:gap,y:gap,scale:gap===0?1:.7}}},plan=planDiagramPDF(p,settings);
    for(const panel of diagramExportPagePanels(p,settings,plan,0))if(panel.markerBox){assert.equal(panel.markerBox.width,DIAGRAM_EXPORT_VIEW_SYMBOL_SIZE);assert.equal(panel.markerBox.height,DIAGRAM_EXPORT_VIEW_SYMBOL_SIZE);}
  }
  for(const side of [5,50,200])assert.match(diagramExportScaleMarkerSVG('zoom',{x:0,y:0,width:side,height:side}),/width="16" height="16"/);
});
test('every configurable filled symbol uses its actual placed CAD geometry in both fill modes',()=>{
  for(const kind of DIAGRAM_SYMBOL_KINDS.filter(supportsDiagramSymbolFill)){
    const a=symbol(kind);
    const markup=(fill:'solid'|'outline')=>diagramAnnotationMarkup(a,{units:1,enabled:false,symbolStyles:{[kind]:{fill}}});
    assert.notEqual(markup('outline'),markup('solid'),kind);
    assert.match(markup('solid'),/fill="currentColor"/,kind);
    assert.match(markup('outline'),/data-source-handle=/,kind);
  }
  const styles:DiagramSymbolStyles={fold:{fill:'solid'}};
  const fold=diagramAnnotationMarkup(symbol('fold'),{units:1,enabled:false,symbolStyles:styles});
  assert.doesNotMatch(fold.match(/<path [^>]+data-source-handle="1644"[^>]*>/)![0],/fill="currentColor"/);
  assert.match(fold.match(/<path [^>]+data-source-handle="1670"[^>]*>/)![0],/fill="currentColor"/);
});
test('a filled point can be picked in its centre; a hollow CAD point only along its stroke',()=>{
  for(const kind of ['referencePoint','filledReferencePoint','angleMarker'] as const){
    const a=symbol(kind);
    assert.equal(pointHitsDiagramSymbol(a,[0,0],.001,{symbolStyles:{[kind]:{fill:'solid'}}}),true,kind);
    assert.equal(pointHitsDiagramSymbol(a,[0,0],.001,{symbolStyles:{[kind]:{fill:'outline'}}}),false,kind);
  }
});
test('adaptive symbol weight follows the render scale and preserves the saved manual pen',()=>{
  const a=symbol('fold'),styles:DiagramSymbolStyles={fold:{width:2,color:'#fa5123',adaptive:true}};
  assert.equal(resolveDiagramSymbolInk(a,{units:1,symbolStyles:styles}).width,2);
  assert.ok(resolveDiagramSymbolInk(a,{units:.1,symbolStyles:styles}).width<2);
  assert.equal(resolveDiagramSymbolInk({...a,color:'#abcdef',appearanceOverrides:['color']},{symbolStyles:styles}).color,'#abcdef');
  assert.deepEqual(a,symbol('fold'));
});
