from pathlib import Path
root=Path.cwd().resolve()
source=(root/'scripts/run-practical-editors-checks-1011.mjs').read_text(encoding='utf-8')
replacements={
 "const baseFile='output/original-uniform-helix-extended-final-checks-1011.json';":"const baseFile='output/practical-editors-checks-1011.json';",
 "const recordFile='output/practical-editors-checks-1011.json',logFile='output/practical-editors-checks-1011.log';":"const recordFile='output/original-arrays-checks-1011.json',logFile='output/original-arrays-checks-1011.log';",
 '["practical-editors-root-delivery"]':'["original-arrays-root-delivery"]',
 'integrationRecords[0].files.length,6':'integrationRecords[0].files.length,18',
}
for before,after in replacements.items():
    assert source.count(before)==1,before
    source=source.replace(before,after,1)
start=source.index("reason:'");end=source.index("'}};",start)
reason=('Three original practical array constructors: direct Miura/Mars/Huffman grids, Yoshimura/Miura signed columns and runs with the double spiral source, and Waterbomb arrays. '
        'New source helpers, visual parameter dialogs, fixtures and focused regressions; two existing App/Panel files connect a direct creative entry and explicit recipe reconstruction. '
        'Source models and overloads have distinct project identities; same-source parameter edits retain the project UUID. '
        'No original geometry is snapped, normalized to 200mm or flipped by construction; exports keep the existing format conversion. '
        'All backend/core/export/dependency inputs remain exact SHA-identical. 1337 backend results are reused under the same input guard from P67. '
        'Seven other project stages plus the 24 planar scripts are executed afresh. '
        'Programmatic source checks do not replace subsequent real App adoption, saved-source reopen, ordinary user-file readback or layout checks. '
        'Existing v0.13.6 release artifacts remain unchanged; this check does not package or publish.')
source=source[:start]+"reason:'"+reason+source[end:]
out=root/'scripts/run-original-arrays-checks-1011.mjs';assert not out.exists();out.write_text(source,encoding='utf-8')
print('prepared 8-stage array checks; not executed')
