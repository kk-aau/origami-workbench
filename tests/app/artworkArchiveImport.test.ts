import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeArtworkArchive} from '../../src/app/artworkArchive';
import {startProjectImport,type ProjectImportReply} from '../../src/app/projectImportTask';
import {exportArtworkProject} from '../../src/app/artworkProject';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject} from '../../src/app/diagramProject';
import {emptyFoldedModelCollection} from '../../src/app/foldedModelCollection';
import {tessPreset} from '../../src/app/tessellation';

function fixture(){
  const editor=blankDoc('ORIW 独立编辑区',200,100),source=blankDoc('独立绘图来源',120,180);
  editor.metadata=JSON.parse('{"__proto__":{"kept":"数据"},"constructor":"自定义","text":"$ref:unchanged"}');
  editor.metadata!.embedded='图片/Unicode😀'.repeat(12000);
  return exportArtworkProject({editor,models:emptyFoldedModelCollection(),diagram:createDiagramProject(source,(()=>{let n=0;return()=>`archive-${++n}`;})()),simulation:null,construction:{tessellation:tessPreset('ring'),curve:null}});
}

test('actual import Worker restores ORIW through the same complete validators and acknowledged transfer as JSON',async()=>{
  const scope=globalThis as any,oldMessage=scope.onmessage,oldPost=scope.postMessage;
  try{
    await import('../../src/workers/projectImport.worker');
    const handle=scope.onmessage as (event:{data:unknown})=>Promise<void>;
    const run=async(file:File,prepare:boolean=true)=>{
      const delivered:ProjectImportReply[]=[],stages:string[]=[];
      const worker={onmessage:null as ((event:{data:ProjectImportReply})=>void)|null,onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null as (()=>void)|null,
        postMessage(data:unknown){queueMicrotask(()=>{void handle({data:structuredClone(data)}).catch(error=>this.onerror?.({message:String(error)}));});},terminate(){}};
      scope.postMessage=(reply:ProjectImportReply)=>{const data=structuredClone(reply);delivered.push(data);queueMicrotask(()=>worker.onmessage?.({data}));};
      const task=startProjectImport(file,prepare,stage=>stages.push(stage),()=>worker as unknown as Worker);
      const result=await task.promise;return {result,delivered,stages};
    };
    const text=fixture(),archive=encodeArtworkArchive(text);
    const legacy=await run(new File([text],'legacy.zhezhi-artwork.json'));
    const restored=await run(new File([archive],'作品.ORIW'));
    assert.deepEqual(restored.result,legacy.result);
    assert.ok(restored.stages.some(stage=>stage.includes('解包 ORIW')));
    assert.ok(restored.delivered.filter(reply=>reply.type==='artwork-chunk').length>2);
    assert.equal(restored.delivered.some(reply=>reply.type==='result'),false,'a whole artwork graph never bypasses the chunk protocol');
    const damaged=archive.slice();damaged[0]^=1;
    await assert.rejects(run(new File([damaged],'损坏.oriw')),/ORIW|作品包|ZIP/);
    await assert.rejects(run(new File([archive],'追加.oriw'),false),/打开文件/);
    const invalid=JSON.parse(text);invalid.diagram.states[0].doc.paper.width=-1;
    await assert.rejects(run(new File([encodeArtworkArchive(JSON.stringify(invalid))],'错误几何.oriw')));
  }finally{scope.onmessage=oldMessage;scope.postMessage=oldPost;}
});
