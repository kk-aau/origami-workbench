import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const result=spawnSync(python,['-m','unittest','discover','-s','backend','-p','test_tessellation*.py','-v'],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
if(result.error)console.error(result.error.message);
process.exitCode=result.status??1;
