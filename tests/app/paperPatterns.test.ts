import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blankDoc} from '../../src/app/state';
import {readPaperPatterns,withPaperPatterns} from '../../src/app/paperPatterns';
import {paperPrintMatrix} from '../../src/app/diagramPaperPatternSVG';
import {createDiagramProject,importDiagramProject,exportDiagramProject} from '../../src/app/diagramProject';
import {defaultDiagramBasicSettings,initializeDiagramBasicPaper} from '../../src/app/diagramBasicSettings';
import {diagramModelMarkup} from '../../src/app/diagramDrawing';
import {defaultModelView} from '../../src/app/modelViewState';
import {prepareArtworkProject,exportArtworkProject} from '../../src/app/artworkProject';
import {decodeArtworkArchive,encodeArtworkArchive} from '../../src/app/artworkArchive';
import {emptyFoldedModelCollection} from '../../src/app/foldedModelCollection';
import {tessPreset} from '../../src/app/tessellation';

const fiber=(color:string)=>'data:image/webp;base64,'+readFileSync(new URL('../../src/assets/fiber-paper/'+color+'.webp',import.meta.url)).toString('base64');

test('both printed sides travel inside drawing and ORIW files, and remain separately selectable after reload',()=>{
  const patterns={front:fiber('kraft'),back:fiber('teal'),styles:{front:{mode:'color',color:'#955136',texture:'washi',upload:fiber('teal')},back:{mode:'image',color:'#114477',texture:'none'}}} as const;
  const paper=blankDoc('双面纸',120,80),editor=withPaperPatterns(paper,patterns);
  const diagram=initializeDiagramBasicPaper(createDiagramProject(paper),{...defaultDiagramBasicSettings(120,80),paperPatterns:patterns});
  const saved=exportArtworkProject({editor,diagram,models:emptyFoldedModelCollection(),simulation:null,construction:{tessellation:tessPreset('ring'),curve:null}});
  const reopened=prepareArtworkProject(JSON.stringify(decodeArtworkArchive(encodeArtworkArchive(saved))));
  assert.deepEqual(readPaperPatterns(reopened.editor.metadata?.paperPatterns),patterns);
  const drawings=[reopened.diagram!,importDiagramProject(exportDiagramProject(diagram))];
  for(const drawing of drawings){
    assert.deepEqual(drawing.basicSettings?.paperPatterns,patterns);
    for(const side of ['front','back'] as const){
      const svg=diagramModelMarkup(drawing.steps[0].pose!,{...defaultModelView(),side},false,[],undefined,drawing.basicSettings!.paperPatterns);
      assert.match(svg,new RegExp('<use href="#[^"]+-'+side+'"'));
      assert.doesNotMatch(svg,new RegExp('<use href="#[^"]+-'+(side==='front'?'back':'front')+'"'));
    }
  }
  assert.deepEqual(withPaperPatterns(editor,undefined).segments,editor.segments);
  assert.equal(readPaperPatterns({front:'data:image/png;base64,AAAA',back:'https://example.invalid/p.png'}),undefined);
});

test('affine paper coordinates stay attached to all three vertices when the sheet changes pose',()=>{
  const matrix=paperPrintMatrix([[3,5],[9,5],[3,7]],[[1,2],[1,8],[5,3]])!;
  const [a,b,c,d,e,f]=matrix;
  const projected=(x:number,y:number)=>[a*x+c*y+e,b*x+d*y+f];
  assert.deepEqual(projected(3,5),[1,2]);assert.deepEqual(projected(9,5),[1,8]);assert.deepEqual(projected(3,7),[5,3]);
  assert.equal(paperPrintMatrix([[0,0],[1,0],[2,0]],[[1,1],[2,2],[3,3]]),null);
});
