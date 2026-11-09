import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DIAGRAM_SYMBOL_KINDS,type DiagramSymbolKind} from '../../src/app/diagramAnnotations';
import {SYMBOL_CATALOG} from '../../src/app/diagramSymbolCatalog';
import {getDiagramCadSymbol} from '../../src/app/diagramCadSymbolCatalog';
import {getCadSymbolBlock,cadPropertyDefinitions,cadAttributeDefinitions} from '../../src/app/diagramCadSymbols';
const CAD_KINDS=DIAGRAM_SYMBOL_KINDS.filter(kind=>getCadSymbolBlock(kind));

test('the library exposes 33 verified drawing blocks and explicit double step-fold and counterclockwise variants',()=>{
  assert.equal(SYMBOL_CATALOG.length,36);assert.equal(CAD_KINDS.length,35);
  assert.deepEqual(new Set(SYMBOL_CATALOG.map(entry=>entry.kind)),new Set(DIAGRAM_SYMBOL_KINDS));
  assert.equal(new Set(SYMBOL_CATALOG.filter(entry=>entry.cadName).map(entry=>entry.cadName)).size,33);
  for(const entry of SYMBOL_CATALOG.filter(entry=>getCadSymbolBlock(entry.kind))){
    const metadata=getDiagramCadSymbol(entry.kind),block=getCadSymbolBlock(entry.kind);
    assert.ok(metadata&&block,entry.kind);assert.equal(metadata.cadName,entry.cadName);
    assert.equal(block.cadName,entry.cadName);
    assert.equal(metadata.label,entry.label);assert.equal(metadata.group,entry.group);
  }
  assert.ok(!SYMBOL_CATALOG.some(entry=>['2-NMFoldS','0-NCNT','7-NCNTA'].includes(entry.cadName)));
});
test('the source-only additions have faithful names and no fabricated legacy component fields',()=>{
  const required=[['equalDivision','1-NDivLen'],['filledReferencePoint','1-HMkPT'],['repeatMark','5-NMkRept']] as const;
  for(const [kind,cadName] of required){
    const entry=SYMBOL_CATALOG.find(entry=>entry.kind===kind)!;
    assert.equal(entry.cadName,cadName);assert.equal(entry.sourceOnly,true);assert.deepEqual(entry.parameters,[]);
  }
  assert.equal(SYMBOL_CATALOG.find(entry=>entry.kind==='repeatSmall')!.label,'对侧重复');
  assert.equal(SYMBOL_CATALOG.find(entry=>entry.kind==='flapFront')!.label,'纸层向外翻折');
  assert.equal(SYMBOL_CATALOG.find(entry=>entry.kind==='flapBack')!.label,'纸层向内翻折');
});
test('every displayed CAD property retains its source key, type, default, limits and editability',()=>{
  for(const kind of CAD_KINDS){
    const source=cadPropertyDefinitions(kind),metadata=getDiagramCadSymbol(kind)!;
    assert.equal(metadata.parameters.length,source.length,kind);
    for(let i=0;i<source.length;i++){
      const expected=source[i],actual=metadata.parameters[i];
      for(const field of ['key','label','defaultValue','min','max','editable','parameterHandle','description'] as const)
        assert.deepEqual(actual[field],expected[field],`${kind}.${expected.key}.${field}`);
      assert.equal(actual.sourceType,expected.type);
      assert.equal(actual.type,expected.type==='flip'?'boolean':expected.values?.length?'choice':'number');
      assert.deepEqual(actual.values,expected.values);
      assert.equal(actual.unit,expected.type==='angle'&&expected.editable?'°':undefined);
    }
  }
});
test('choices are only original numeric allowed values, not invented arrowhead Lookup states',()=>{
  let choices=0,flips=0;
  for(const kind of CAD_KINDS)for(const parameter of getDiagramCadSymbol(kind)!.parameters){
    if(parameter.type==='choice'){
      choices++;assert.ok(parameter.values!.length);assert.ok(parameter.values!.every(value=>typeof value==='number'&&Number.isFinite(value)));
      assert.ok(cadPropertyDefinitions(kind).some(source=>source.key===parameter.key&&source.values?.length));
    }
    if(parameter.type==='boolean'){flips++;assert.equal(parameter.sourceType,'flip');assert.ok([0,1].includes(parameter.defaultValue));}
  }
  assert.ok(choices>0);assert.ok(flips>0);
  const sink=getDiagramCadSymbol('sink')!.parameters.find(parameter=>parameter.type==='choice');
  assert.deepEqual(sink!.values,[1.5,2,2.5,3,3.5,4]);
});
test('source attributes stay independent, including the two DivLen labels',()=>{
  for(const kind of CAD_KINDS)assert.deepEqual(getDiagramCadSymbol(kind)!.attributes,cadAttributeDefinitions(kind));
  const attributes=getDiagramCadSymbol('equalDivision')!.attributes;
  assert.equal(attributes.length,2);assert.deepEqual(attributes.map(attribute=>attribute.defaultValue),['8','1']);
  assert.equal(new Set(attributes.map(attribute=>attribute.key)).size,2);
  for(const kind of ['repeatSmall','flapFront','flapBack'] as const)assert.deepEqual(getDiagramCadSymbol(kind)!.attributes,[]);
});
test('metadata copies cannot mutate allowed values or original attribute definitions',()=>{
  const first=getDiagramCadSymbol('sink')!,choice=first.parameters.find(parameter=>parameter.values?.length)!;
  const expected=[...choice.values!];choice.values!.push(999);
  assert.deepEqual(getDiagramCadSymbol('sink')!.parameters.find(parameter=>parameter.key===choice.key)!.values,expected);
  const division=getDiagramCadSymbol('equalDivision')!;division.attributes[0].defaultValue='changed';
  assert.equal(getDiagramCadSymbol('equalDivision')!.attributes[0].defaultValue,'8');
  assert.equal(getDiagramCadSymbol('unknown' as DiagramSymbolKind),undefined);
});
