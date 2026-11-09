. "$PSScriptRoot/toolchain-env.ps1"
Push-Location $migrationProjectRoot
try {
  & cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --bin zhezhi-server
  exit $LASTEXITCODE
} finally { Pop-Location }
