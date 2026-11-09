$ErrorActionPreference = 'Stop'
$migrationProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$migrationToolRoot = Join-Path $migrationProjectRoot '.toolchain'
if ([IO.Path]::GetPathRoot($migrationToolRoot) -ieq 'C:\') { throw '本迁移工程的下载、依赖和临时文件要求位于 D 盘，请先移动整个目录。' }
foreach ($migrationDirectory in @('tmp','npm-cache','bundler-cache','pip-cache','matplotlib-cache','numba-cache','xdg-cache')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $migrationToolRoot $migrationDirectory) | Out-Null
}
$env:RUSTUP_HOME = Join-Path $migrationToolRoot 'rustup'
$env:CARGO_HOME = Join-Path $migrationToolRoot 'cargo'
$env:CARGO_TARGET_DIR = Join-Path $migrationProjectRoot 'src-tauri/target'
$env:TEMP = Join-Path $migrationToolRoot 'tmp'
$env:TMP = $env:TEMP
$env:NPM_CONFIG_CACHE = Join-Path $migrationToolRoot 'npm-cache'
$env:TAURI_BUNDLER_CACHE_DIR = Join-Path $migrationToolRoot 'bundler-cache'
$env:PIP_CACHE_DIR = Join-Path $migrationToolRoot 'pip-cache'
$env:MPLCONFIGDIR = Join-Path $migrationToolRoot 'matplotlib-cache'
$env:NUMBA_CACHE_DIR = Join-Path $migrationToolRoot 'numba-cache'
$env:XDG_CACHE_HOME = Join-Path $migrationToolRoot 'xdg-cache'
$env:ZHEZHI_TAURI_HOME = Join-Path $migrationProjectRoot '.runtime'
$env:ZHEZHI_DIST_DIR = Join-Path $migrationProjectRoot 'dist'
$env:ZHEZHI_TESS_EXECUTABLE = Join-Path $migrationProjectRoot 'build/tessellation/zhezhi-tess/zhezhi-tess.exe'
$env:PATH = (Join-Path $env:CARGO_HOME 'bin') + ';' + $env:PATH
$migrationMsvcRoot = Join-Path $migrationToolRoot 'msvc'
$migrationCompiler = Get-ChildItem -LiteralPath (Join-Path $migrationMsvcRoot 'VC/Tools/MSVC') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
$migrationSdk = Get-ChildItem -LiteralPath (Join-Path $migrationMsvcRoot 'Windows Kits/10/Lib') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if ($migrationCompiler -and $migrationSdk) {
  $migrationCompilerBin = Join-Path $migrationCompiler.FullName 'bin/Hostx64/x64'
  $migrationSdkRoot = Join-Path $migrationMsvcRoot 'Windows Kits/10'
  $migrationSdkBin = Join-Path $migrationSdkRoot "bin/$($migrationSdk.Name)/x64"
  $env:PATH = "$migrationCompilerBin;$migrationSdkBin;$migrationSdkBin/ucrt;" + $env:PATH
  $env:VCToolsInstallDir = $migrationCompiler.FullName + '\'
  $env:VCINSTALLDIR = (Join-Path $migrationMsvcRoot 'VC') + '\'
  $env:WindowsSdkDir = $migrationSdkRoot + '\'
  $env:WindowsSDKVersion = $migrationSdk.Name + '\'
  $env:VSCMD_ARG_HOST_ARCH = 'x64'
  $env:VSCMD_ARG_TGT_ARCH = 'x64'
  $env:INCLUDE = @((Join-Path $migrationCompiler.FullName 'include'),(Join-Path $migrationSdkRoot "Include/$($migrationSdk.Name)/ucrt"),(Join-Path $migrationSdkRoot "Include/$($migrationSdk.Name)/shared"),(Join-Path $migrationSdkRoot "Include/$($migrationSdk.Name)/um"),(Join-Path $migrationSdkRoot "Include/$($migrationSdk.Name)/winrt")) -join ';'
  $env:LIB = @((Join-Path $migrationCompiler.FullName 'lib/x64'),(Join-Path $migrationSdk.FullName 'ucrt/x64'),(Join-Path $migrationSdk.FullName 'um/x64')) -join ';'
  $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = Join-Path $migrationCompilerBin 'link.exe'
  $env:CC = Join-Path $migrationCompilerBin 'cl.exe'
  $env:CXX = $env:CC
  $env:RC = Join-Path $migrationSdkBin 'rc.exe'
}
