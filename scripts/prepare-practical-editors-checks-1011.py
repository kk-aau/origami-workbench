from pathlib import Path

root = Path.cwd()
s = (root / 'scripts/run-original-uniform-helix-extended-checks-1011.mjs').read_text(encoding='utf-8')
replacements = {
    "const baseFile='output/original-nonuniform-helix-general-checks-1011.json';":
    "const baseFile='output/original-uniform-helix-extended-final-checks-1011.json';",
    "const recordFile='output/original-uniform-helix-extended-checks-1011.json',logFile='output/original-uniform-helix-extended-checks-1011.log';":
    "const recordFile='output/practical-editors-checks-1011.json',logFile='output/practical-editors-checks-1011.log';",
    '["original-uniform-helix-extended-root-delivery"]': '["practical-editors-root-delivery"]',
    'integrationRecords[0].files.length,10': 'integrationRecords[0].files.length,6',
}
for before, after in replacements.items():
    assert s.count(before) == 1, before
    s = s.replace(before, after, 1)
start, end = s.index("reason:'"), s.index("'}};", s.index("reason:'"))
reason = ('Practical visual editing only: existing TileAssemblyEditor and DiscreteCurveCPControls, '
          'new discrete source-editing helper/Dialog/CSS and eight focused regressions. '
          'Source vectors retain their original amplitudes; view navigation never changes geometry. '
          'Core/backend, source formulae, coordinate conversion, package dependencies and all existing fixtures remain SHA-identical. '
          '1337 backend checks are reused from the final P66 result under exact protected input SHA. '
          'All seven other project stages and the 24 planar scripts are rerun. '
          'Isolated component checks are not substitutes for subsequent main App adoption/save/export acceptance. '
          'The already accepted 0.13.6 Portable and Source artifacts remain unchanged; no new pack or publication is implied.')
s = s[:start] + "reason:'" + reason + s[end:]
target = root / 'scripts/run-practical-editors-checks-1011.mjs'
assert not target.exists()
target.write_text(s, encoding='utf-8')
