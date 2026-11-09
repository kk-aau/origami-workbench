from pathlib import Path
import json,hashlib,shutil,difflib
root=Path.cwd().resolve();producer=root/'output/parallel/private-yoshimura-six-cylinder-1011';base=root/'output/parallel/original-six-root-delivery-1011'
assert not base.exists();base.mkdir(parents=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
raw=json.loads((producer/'delivery/manifest.json').read_text(encoding='utf8'));files=[];patch=''
for row in raw['targets']:
 name=row['path'];source=producer/row['fullAfter'];target=base/'files'/name
 assert not (root/name).exists() and sha(source)==row['afterSHA256']
 target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
 files.append({'target':name,'baselineSha256':None,'sha256':sha(target),'source':str(target.resolve()),'kind':'new'})
def edited(name,changes):
 global patch
 current=root/name;before=current.read_text(encoding='utf8');text=before
 for a,b in changes:
  assert text.count(a)==1,(name,a[:100],text.count(a));text=text.replace(a,b)
 saved=base/'before'/name;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(current,saved)
 target=base/'files'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text,encoding='utf8',newline='\n')
 files.append({'target':name,'baselineSha256':sha(current),'sha256':sha(target),'source':str(target.resolve()),'kind':'modified'})
edited('src/App.tsx',[
 ("import WaterbombTessellation2604Dialog", "import YoshimuraSixCP2507Dialog from './components/YoshimuraSixCP2507Dialog';\nimport WaterbombTessellation2604Dialog"),
 ("    {originalArrayDialog?.kind==='waterbomb'", "    {originalArrayDialog?.kind==='yoshimura-six'&&<YoshimuraSixCP2507Dialog initial={originalArrayDialog.edit&&originalArraySource?.kind==='yoshimura-six'?originalArraySource.recipe:undefined} onAdoptCP={adoptOriginalArrayCP} onClose={()=>setOriginalArrayDialog(null)}/>}\n    {originalArrayDialog?.kind==='waterbomb'")])
edited('src/components/TessellationPanel.tsx',[
 ("<button onClick={()=>onOpenArray('waterbomb')}>水雷阵列</button>","<button onClick={()=>onOpenArray('waterbomb')}>水雷阵列</button><button onClick={()=>onOpenArray('yoshimura-six')}>六度折筒</button>")])
edited('src/app/originalArraySource.ts',[
 ("import {readWaterbombTessellation2604Recipe", "import {readYoshimuraSixRecipe,yoshimuraSixSourceMatches,type YoshimuraSixRecipe} from './yoshimuraSixCP2507';\nimport {readWaterbombTessellation2604Recipe"),
 ("|'waterbomb';", "|'waterbomb'|'yoshimura-six';"),
 (" | {kind:'waterbomb';recipe:WaterbombTessellation2604Recipe};", " | {kind:'waterbomb';recipe:WaterbombTessellation2604Recipe}\n | {kind:'yoshimura-six';recipe:YoshimuraSixRecipe};"),
 ("'originalWaterbombTessellation2604'];", "'originalWaterbombTessellation2604','originalYoshimuraSix2507'];"),
 ("  const recipe=readWaterbombTessellation2604Recipe(doc);", "  if(Object.hasOwn(metadata,sourceKeys[3])){const recipe=readYoshimuraSixRecipe(doc);return recipe?{kind:'yoshimura-six',recipe}:null;}\n  const recipe=readWaterbombTessellation2604Recipe(doc);"),
 ("source.kind==='yoshimura-miura'?yoshimuraMiuraSourceMatches(doc):waterbombTessellation2604SourceMatches(doc);", "source.kind==='yoshimura-miura'?yoshimuraMiuraSourceMatches(doc):\n  source.kind==='yoshimura-six'?yoshimuraSixSourceMatches(doc):waterbombTessellation2604SourceMatches(doc);"),
 (" return left.kind==='waterbomb'&&right.kind==='waterbomb';", " if(left.kind==='yoshimura-six'&&right.kind==='yoshimura-six')return left.recipe.seed===right.recipe.seed;\n return left.kind==='waterbomb'&&right.kind==='waterbomb';")])
for row in files:
 name=row['target'];before=(base/'before'/name).read_text(encoding='utf8') if row['baselineSha256'] else '';after=Path(row['source']).read_text(encoding='utf8')
 patch+=''.join(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),fromfile='a/'+name if row['baselineSha256'] else '/dev/null',tofile='b/'+name))
patch_path=base/'six.patch';patch_path.write_text(patch,encoding='utf8',newline='\n')
(base/'manifest.json').write_text(json.dumps({'files':files,'patchSha256':sha(patch_path),'producerManifestSHA256':sha(producer/'delivery/manifest.json'),'CPOnly':True,'static3DReproduced':False,'productionUnchanged':True},ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared 5 original six-degree targets and 3 exact-baseline root entry/source changes.')
