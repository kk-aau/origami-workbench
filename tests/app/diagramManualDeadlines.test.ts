import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

test('manual diagram calculation and layer adjustment explicitly wait for completion',()=>{
 const source=ts.createSourceFile('DiagramWorkspace.tsx',readFileSync(new URL('../../src/components/DiagramWorkspace.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const calls=new Map<string,number>([['compute',0],['adjustLayerOrder',0]]);
 function visit(node:ts.Node,owner=''){
  if(ts.isFunctionDeclaration(node)&&node.name)owner=node.name.text;
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&['startFlatFold','startFlatLayerReanalysis'].includes(node.expression.text)&&calls.has(owner)){
   const options=node.arguments[1];assert.ok(options&&ts.isObjectLiteralExpression(options));
   const timeout=options.properties.find((property):property is ts.PropertyAssignment=>ts.isPropertyAssignment(property)&&ts.isIdentifier(property.name)&&property.name.text==='timeoutMs');
   assert.ok(timeout&&ts.isIdentifier(timeout.initializer)&&timeout.initializer.text==='Infinity',`${owner} must not terminate a manual calculation at a fixed deadline`);
   calls.set(owner,calls.get(owner)!+1);
  }
  ts.forEachChild(node,child=>visit(child,owner));
 }
 visit(source);assert.equal(calls.get('compute'),4);assert.equal(calls.get('adjustLayerOrder'),1);
});
