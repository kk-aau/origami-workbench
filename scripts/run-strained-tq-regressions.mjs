import {spawnSync} from 'node:child_process';
import path from 'node:path';
const result=spawnSync(path.join(process.cwd(),'.venv/Scripts/python.exe'),['-m','unittest','discover','-s','backend','-p','test_tessellation_strain_tq_practical.py','-v'],{cwd:process.cwd(),windowsHide:true,stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
if(result.error)console.error(result.error);
process.exitCode=result.status??1;
