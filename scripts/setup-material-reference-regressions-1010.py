from pathlib import Path
import re
old, new = 'material-properties-model', 'material-reference-model-properties-regression'
for suffix in ['', '-direct', '-download']:
    extension='ts' if suffix=='-download' else 'browser.js'
    source=Path(f'scripts/verify-{old}{suffix}-1009.{extension}')
    target=Path(f'scripts/verify-{new}{suffix}-1010.{extension}')
    assert not target.exists(),target
    s=source.read_text(encoding='utf8').replace(old,new).replace('-1009','-1010')
    s=re.sub(r'material-reference-model-properties-regression-([A-Za-z0-9${}_-]+)-initial-1010',r'material-properties-model-\1-initial-1009',s)
    target.write_text(s,encoding='utf8')
for extension in ['browser.js','ts']:
    suffix='' if extension=='browser.js' else '-download'
    source=Path(f'scripts/verify-material-properties-model-mesh{suffix}-1009.{extension}')
    target=Path(f'scripts/verify-material-reference-model-mesh{suffix}-1010.{extension}')
    assert not target.exists(),target
    target.write_text(source.read_text(encoding='utf8').replace('material-properties-model','material-reference-model').replace('-1009','-1010'),encoding='utf8')
print('Prepared property and mesh regressions with preserved old inputs and independent new evidence.')
