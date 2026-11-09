from pathlib import Path
import hashlib
import json
import math
import sys

assert sys.dont_write_bytecode, 'Run with python -B.'
root = Path.cwd().resolve()
out = root / 'output/parallel/original-cone-four-plane-native-zero-domain-1011'
assert not out.exists()
source_query = root / 'output/parallel/original-reflection-neighbor-source-gap-1011/native-query.json'
query = json.loads(source_query.read_text(encoding='utf8'))
query['transverseStart'] = 0
sys.path.insert(0, str(root / 'backend'))
from tessellation_curved_planar_sequence_generic import query_planar_sequence_generic

result = query_planar_sequence_generic(query)
c = math.cos(math.pi / 6)
a = math.sin(math.pi / 6) * math.tan(math.pi / 18)
errors = []
checks = 0
for row in result['sample']['rows']:
    u = row['s']
    expected = [0, 1 / c, 2 / (c - a * math.sin(u)), 3 / (c + a * math.cos(u)), 4 / c]
    assert len(row['stages']) == 5
    checks += 1
    for stage, distance in zip(row['stages'], expected):
        errors.append(abs(stage['parameter'] - distance))
        assert errors[-1] <= 1e-13
        checks += 1
    assert row['stages'][0]['parameter'] == 0
    checks += 1
assert result['source']['normalNormalized'] is False
assert result['source']['interpolationReproduced'] is False
assert result['source']['symbolicOptionsReproduced'] is False
checks += 3
for field in ['cutOrderVerified', 'globalInjectivityChecked', 'selfCollisionChecked', 'exactStraightCreaseFOLD', 'adoptableCreasePattern']:
    assert result['certification'][field] is False
    checks += 1
out.mkdir(parents=True)
record = dict(
    verified=True, checks=checks, query=query, response=result,
    maximumLiteralCutError=max(errors), nativeRows=len(result['sample']['rows']),
    normalization=result['normalization'],
    sourceQuerySHA=hashlib.sha256(source_query.read_bytes()).hexdigest(),
    backendSHA=hashlib.sha256((root / 'backend/tessellation_curved_planar_sequence_generic.py').read_bytes()).hexdigest(),
    originalNativeDomainIncludesApex=True,
    localPositivePaperMustBeProvedSeparately=True,
    sourceKernelOnly=True, HTTPExecuted=False, CPProducerImported=False,
    productionWritten=False, userFilesWritten=False, noFlatFoldOrPoseCertificate=True,
)
file = out / 'native-zero-domain-readback.json'
file.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf8')
frozen = dict(files=[dict(path=file.name, sha256=hashlib.sha256(file.read_bytes()).hexdigest())], sourceKernelOnly=True, productionWritten=False)
(out / 'freeze.json').write_text(json.dumps(frozen, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(dict(verified=True, checks=checks, sourceDomain='original transverseStart=0', maximumLiteralCutError=max(errors), normalizationScale=result['normalization']['scale'], certification=result['certification'])))
