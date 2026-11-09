from pathlib import Path
import json

root = Path.cwd().resolve()

def edit(text, old, new, count=1):
    assert text.count(old) == count, (old, text.count(old))
    return text.replace(old, new)

def write_new(name, text):
    p = root / name
    assert not p.exists(), name
    p.write_text(text, encoding='utf8')

bundle = (root / 'scripts/verify-cone-apex-bundle-1011.mjs').read_text(encoding='utf8')
bundle = bundle.replace('original-cone-four-plane-apex', 'original-nonuniform-spiral')
bundle = edit(bundle, 'assert.equal(ui.verified,true);assert.equal(ui.bundle,captured.bundle);',
    'assert.equal(ui.verified,true);assert.equal(ui.passed,true);assert.equal(ui.bundle,captured.bundle);')
write_new('scripts/verify-nonuniform-spiral-bundle-1011.mjs', bundle)

preservation = (root / 'scripts/verify-cone-apex-final-preservation-1011.py').read_text(encoding='utf8')
preservation = edit(preservation, 'output/audits/original-cone-four-plane-final-1011.json', 'output/audits/original-cone-four-plane-apex-final-1011.json')
preservation = preservation.replace('3462', '3900')
preservation = edit(preservation, 'original-cone-four-plane-apex-cp-4039-integrated-1010.json', 'original-nonuniform-spiral-cp-3968-integrated-1010.json')
preservation = edit(preservation, 'original-cone-four-plane-apex-parent-spacing-fix-integrated-1010.json', 'original-nonuniform-spiral-root-wiring-integrated-1010.json')
preservation = edit(preservation, 'output/original-cone-four-plane-apex-final-preservation-1011.json', 'output/original-nonuniform-spiral-preservation-1011.json')
preservation = edit(preservation, 'preservedAuthorDeliveryBeforeLayoutFix=True,\n    spacingOnlyAdditionalDelta=True',
    'fiveNewSourceTargets=True,\n    twoExistingConnectionTargets=True')
write_new('scripts/verify-nonuniform-spiral-preservation-1011.py', preservation)
print(json.dumps(dict(prepared=2, productionWritten=False)))
