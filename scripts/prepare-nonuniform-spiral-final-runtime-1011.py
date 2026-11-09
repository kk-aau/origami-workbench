from pathlib import Path
import json

root = Path.cwd().resolve()

def edit(text, old, new, count=1):
    assert text.count(old) == count, (old, text.count(old))
    return text.replace(old,new)

def write_new(name,text):
    p=root/name
    assert not p.exists(),name
    p.write_text(text,encoding='utf8')

server=(root/'scripts/start-original-nonuniform-spiral-server-1011.mjs').read_text(encoding='utf8')
server=edit(server,"['original-nonuniform-spiral-cp-3968','original-nonuniform-spiral-root-wiring']",
    "['original-nonuniform-spiral-cp-3968','original-nonuniform-spiral-root-wiring','original-nonuniform-spiral-preview-performance','original-nonuniform-spiral-readable-rulers']")
write_new('scripts/start-original-nonuniform-spiral-final-server-1011.mjs',server)
preservation=(root/'scripts/verify-nonuniform-spiral-preservation-1011.py').read_text(encoding='utf8')
preservation=edit(preservation,"    'output/parallel/original-nonuniform-spiral-root-wiring-integrated-1010.json',",
    "    'output/parallel/original-nonuniform-spiral-root-wiring-integrated-1010.json',\n"
    "    'output/parallel/original-nonuniform-spiral-preview-performance-integrated-1010.json',\n"
    "    'output/parallel/original-nonuniform-spiral-readable-rulers-integrated-1010.json',")
preservation=edit(preservation,'output/original-nonuniform-spiral-preservation-1011.json','output/original-nonuniform-spiral-final-preservation-1011.json')
write_new('scripts/verify-nonuniform-spiral-final-preservation-1011.py',preservation)
bundle=(root/'scripts/verify-nonuniform-spiral-bundle-1011.mjs').read_text(encoding='utf8')
bundle=edit(bundle,"record='output/original-nonuniform-spiral-bundle-1011.json',runFile='output/original-nonuniform-spiral-checks-1011.json'",
    "record='output/original-nonuniform-spiral-final-bundle-1011.json',runFile='output/original-nonuniform-spiral-final-checks-1011.json'")
bundle=edit(bundle,'output/original-nonuniform-spiral-checks-1011.log','output/original-nonuniform-spiral-final-checks-1011.log')
bundle=edit(bundle,'output/original-nonuniform-spiral-bundle-verified-1011.json','output/original-nonuniform-spiral-final-bundle-verified-1011.json')
write_new('scripts/verify-nonuniform-spiral-final-bundle-1011.mjs',bundle)
print(json.dumps(dict(prepared=3,productionWritten=False)))
