param([switch]$Debug,[switch]$SkipFrontend)
. "$PSScriptRoot/toolchain-env.ps1"
Push-Location $migrationProjectRoot
try {
  if (!$SkipFrontend) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
  $migrationBuildArguments = @('build','--manifest-path','src-tauri/Cargo.toml','--locked')
  if (!$Debug) { $migrationBuildArguments += '--release' }
  & cargo @migrationBuildArguments
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if (!$Debug) { & "$PSScriptRoot/sign-windows.ps1" -File (Join-Path $env:CARGO_TARGET_DIR 'release/zhezhi-workbench-tauri.exe') }
} finally { Pop-Location }
