. "$PSScriptRoot/toolchain-env.ps1"
Push-Location $migrationProjectRoot
try {
  & cargo build --manifest-path src-tauri/Cargo.toml --locked --no-default-features --bin zhezhi-server
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $env:ZHEZHI_RUST_SERVER = Join-Path $env:CARGO_TARGET_DIR 'debug/zhezhi-server.exe'
  & node --test --test-concurrency=1 tests/server.test.mjs tests/project-concurrency.test.mjs tests/artwork-recovery-api.test.mjs tests/crease-library-api.test.mjs tests/document-workspace-api.test.mjs
  exit $LASTEXITCODE
} finally { Pop-Location }
