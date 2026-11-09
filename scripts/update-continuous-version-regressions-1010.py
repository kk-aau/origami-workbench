from pathlib import Path

tasks = [
 ('tests/core/materialClipboardModel.test.ts', 'curves and transforms on imported material retain distinct origin IDs and v9 through later positioning copy', 'curves and transforms on imported material retain distinct origins and v16 through later positioning copy', [("'zhezhi-material-curve-model-v9'", "'zhezhi-material-curve-model-v16'")]),
 ('tests/core/materialNetworkModel.test.ts', 'network then curve preserves curve recipes through earlier-network edit and removal', None, [("'zhezhi-material-curve-model-v2'", "'zhezhi-material-curve-model-v15'")]),
 ('tests/core/materialNetworkModel.test.ts', 'curve v1 upgrades only when a network is recorded, and its old recipe and identity survive', 'persistent curve identities retain v15 when a network is recorded and keep the original recipe', [("'zhezhi-material-curve-model-v1'", "'zhezhi-material-curve-model-v15'"), ("'zhezhi-material-curve-model-v2'", "'zhezhi-material-curve-model-v15'")]),
 ('tests/core/materialTopologyModel.test.ts', 'new network/curve/trace recipes keep v4 after topology edits and preserve all later groups', 'new curve identity upgrades v4 topology history to v15 and preserves later groups', []),
 ('tests/core/materialTraceModel.test.ts', 'all supported recipe kinds preserve mixed model version and material ancestry', None, [("'zhezhi-material-curve-model-v1'", "'zhezhi-material-curve-model-v15'"), ("'zhezhi-material-curve-model-v3'", "'zhezhi-material-curve-model-v15'")]),
]
for path, name, new_name, replacements in tasks:
    p=Path(path);text=p.read_text(encoding='utf8');start=text.index("test('"+name+"'");end=text.find("\ntest('",start+1)
    if end<0:end=len(text)
    block=text[start:end]
    if path.endswith('materialTopologyModel.test.ts'):
        old="d=editMaterialFaces(d,curve).doc;assert.equal(model(d).model.schema,'zhezhi-material-curve-model-v4')"
        assert block.count(old)==1
        block=block.replace(old,old.replace('-v4','-v15'))
    for old,new in replacements:
        assert old in block,(path,old)
        block=block.replace(old,new)
    if new_name:block=block.replace(name,new_name)
    p.write_text(text[:start]+block+text[end:],encoding='utf8')
print('Updated five schema expectations for persistent identities; geometry, ancestry and replay assertions preserved.')
