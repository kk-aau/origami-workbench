"""Read-only hash comparison: copied workspace code and original source isolation."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parent.parent
baseline=json.loads((root/'migration/source-baseline.json').read_text(encoding='utf-8'))
original=root.parent/'workbench'
original_changes=[]
workspace_changes=[]
engine_changes=[]
engine_files=0
for row in baseline['files']:
    rel=Path(row['path'])
    source=original/rel
    if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest()!=row['sha256']:
        original_changes.append(row['path'])
    if rel.parts[0] in ('src','public','simulator'):
        target=root/rel
        if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=row['sha256']:
            workspace_changes.append(row['path'])
    if rel.as_posix().startswith('build/tessellation/'):
        engine_files+=1
        target=root/rel
        if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=row['sha256']:
            engine_changes.append(row['path'])
dependencies=root/'node_modules'
report={'sourceVersion':baseline['version'],'originalFilesCompared':len(baseline['files']),'originalChangesSinceCopy':original_changes,'copiedWorkspaceChanges':workspace_changes,'originalUnchanged':not original_changes,'workspaceCodeUnchanged':not workspace_changes,'offlineEngineFilesCompared':engine_files,'offlineEngineChanges':engine_changes,'offlineEngineUnchanged':not engine_changes,'nodeModulesIsJunction':dependencies.is_symlink() or getattr(dependencies,'is_junction',lambda:False)()}
(root/'migration/isolation-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if original_changes or workspace_changes or engine_changes or report['nodeModulesIsJunction']:raise SystemExit(1)
