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
} finally { Pop-Location }
