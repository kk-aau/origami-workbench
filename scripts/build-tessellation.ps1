#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $taskRoot
$pythonExe = Join-Path $taskRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) { throw 'Build-only Python environment missing. See README.' }
# The JSON engine uses the Python geometry path. Optional JIT and plotting
# dependencies remain available in the development environment, not this bundle.
$packageArgs = @(
    '-m', 'PyInstaller', '--noconfirm', '--onedir', '--console',
    '--name', 'zhezhi-tess', '--distpath', 'build/tessellation',
    '--workpath', 'build/pyinstaller', '--specpath', 'build',
    '--paths', 'vendor/pleat',
    '--exclude-module', 'tkinter', '--exclude-module', 'IPython',
    '--exclude-module', 'numba', '--exclude-module', 'llvmlite',
    '--exclude-module', 'matplotlib', '--exclude-module', 'PIL',
    'backend/tessellate.py'
)
& $pythonExe @packageArgs
if ($LASTEXITCODE -ne 0) { throw 'Tessellation packaging failed.' }
