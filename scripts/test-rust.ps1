param([string[]]$CargoArguments = @())
. "$PSScriptRoot/toolchain-env.ps1"
Push-Location $migrationProjectRoot
try {
  & cargo test --manifest-path src-tauri/Cargo.toml --no-default-features @CargoArguments
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
