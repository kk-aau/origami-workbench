from pathlib import Path
import hashlib,json,shutil,difflib

root=Path.cwd().resolve()
folder=root/'output/parallel/path-array-core-root-1012'
assert not folder.exists()
groups=[
 ('semigeneral-miura-cp-1011','candidate',[
  ('src/app/semigeneralMiuraCP.ts','0f83c693981d289c6cb6834bf8c81d5b21e88816c3c97f335bb70dd30289f70c'),
  ('tests/app/semigeneralMiuraCP.test.ts','b9c47d801efb7e417f51ad942cb9837618b078697f688016a53d838944606ba7'),
  ('tests/fixtures/semigeneral-miura-source-1011.json','5262679eade0c5b8375d21f8dec5b92f8cb61884dcea93d248ef5f953315c6a5')]),
 ('linear-space-polyhedral-cp-1011','candidate',[
  ('src/app/linearSpacePolyhedralCP.ts','41a846c15d1c6949016b3c225dc2530c79733bb510aa4c161f3e9a93beb380a7'),
  ('tests/app/linearSpacePolyhedralCP.test.ts','a7c75afd92c850b40538d88cc5cde919017bb8e363dbbe659a1191ea8ea1e85e'),
  ('tests/fixtures/linear-space-polyhedral-source-20261011.json','3a5481899139f7ae75df27b5cfeb835c4c12c7444c8fceeba1b342d5011ecd9d')]),
 ('general-spacer-miura-cp-1011','delivery',[
  ('src/app/generalSpacerMiuraCP.ts','5ea03fd223f31ddc2e5254aebd6f3b69a37cbda742da610bf554f5b6602c55d8'),
  ('tests/app/generalSpacerMiuraCP.test.ts','6dda83fc8d785b11b6477bdf21c1f83303568b586f1f586d41d8b88d7c1a8df6'),
  ('tests/app/fixtures/general-spacer-miura-source-1011.json','99bd2b2fe3a9af5c0a8b5334d0081bbea245d3d00bf4507aa75edb7f7012a32d')])]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name,prefix,entries in groups:
 for target,digest in entries:
  p=root/'output/parallel'/name/prefix/target
  assert sha(p)==digest,str(p)
  assert not (root/target).exists(),target
folder.mkdir(parents=True)
rows=[];patch=[]
for name,prefix,entries in groups:
 for target,digest in entries:
  source=root/'output/parallel'/name/prefix/target
  delivery=folder/'files'/target;delivery.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,delivery)
  rows.append(dict(target=target,source=str(delivery),baselineSha256=None,sha256=digest,kind='new',upstream=str(source)))
  patch.extend(difflib.unified_diff([],source.read_text(encoding='utf8').splitlines(keepends=True),fromfile='/dev/null',tofile='b/'+target))
(folder/'candidate.patch').write_text(''.join(patch),encoding='utf8')
(folder/'manifest.json').write_text(json.dumps(dict(files=rows,patchSha256=sha(folder/'candidate.patch'),note='Core only; production UI and standard-angle delta still require acceptance.'),ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared 9 exact new files; upstream SHA and absent production targets checked.')
