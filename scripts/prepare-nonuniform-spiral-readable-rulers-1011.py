from pathlib import Path
import difflib
import hashlib
import json

root = Path.cwd().resolve()
base = root / 'output/parallel/original-nonuniform-spiral-readable-rulers-1011'
assert not base.exists()
base.mkdir(parents=True)
sha = lambda data: hashlib.sha256(data).hexdigest()
name = 'src/components/NonuniformSpiralCP3968Dialog.tsx'
before = (root / name).read_bytes()
assert sha(before) == 'c3deeb5df032494de4cdfa701db7d743226865ca4bbc8cdcfc49e075f2854b1a'
text = before.decode('utf8')

def edit(old, new, count=1):
    global text
    assert text.count(old) == count, (old, text.count(old))
    text = text.replace(old, new)

edit('margin=span*.14,size=span*.025,stroke=span*.002', 'margin=span*.14,size=span*.025,labelSize=span*.045,stroke=span*.002')
edit('fontSize={size}', 'fontSize={labelSize}', 3)
edit('y={minY-margin*.78}', 'y={minY-margin*.65}')
edit('x={points[i][0]+size} y={points[i][1]+size*1.5}',
    "x={points[i][0]+(points[i][0]>(minX+maxX)/2?-size:size)} y={points[i][1]+(points[i][1]>(minY+maxY)/2?-size:labelSize*1.25)} textAnchor={points[i][0]>(minX+maxX)/2?'end':'start'}")
edit('当前左宽上限 {Number(maxLeft.toPrecision(7))}', '当前左宽上限约 {Number(maxLeft.toPrecision(7))}')
after = text.encode('utf8')
target = base / 'files' / name
target.parent.mkdir(parents=True, exist_ok=True)
target.write_bytes(after)
patch = base / 'readable-rulers.patch'
patch.write_bytes(''.join(difflib.unified_diff(before.decode('utf8').splitlines(True), text.splitlines(True), fromfile='a/'+name, tofile='b/'+name)).encode('utf8'))
manifest = base / 'manifest.json'
manifest.write_text(json.dumps(dict(files=[dict(target=name,baselineSha256=sha(before),sha256=sha(after),source=str(target),kind='modified')],
    patchSha256=sha(patch.read_bytes()),scope='SVG annotation font sizes, inward source endpoint labels and approximate bound display only; no CP geometry, source values, constraints, request, metadata or material changes',
    productionWritten=False),ensure_ascii=False,indent=2),encoding='utf8')
note = base / 'scope.json'
note.write_text(json.dumps(dict(verified=True,oldMinimumTextPixels=340/1.28*.025,newMinimumTextPixels=340/1.28*.045,
    sourceGeometryUnchanged=True,pointMarkersUnchanged=True,labelsPlacedInward=True,actualBrowserLayoutPending=True),indent=2),encoding='utf8')
listed = [target, patch, manifest, note]
(base / 'freeze.json').write_text(json.dumps(dict(verified=True,files=[dict(path=p.relative_to(base).as_posix(),sha256=sha(p.read_bytes())) for p in listed]),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(prepared=True,targets=1,files=4,freezeSha256=sha((base/'freeze.json').read_bytes()),productionWritten=False)))
