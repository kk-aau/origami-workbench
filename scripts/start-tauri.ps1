. "$PSScriptRoot/toolchain-env.ps1"
Push-Location $migrationProjectRoot
try {
  $migrationFrontend = Get-Item -LiteralPath (Join-Path $migrationProjectRoot 'dist/index.html') -ErrorAction SilentlyContinue
  $migrationFrontendSources = @('src','public','simulator','index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json') | ForEach-Object {
    $migrationSourcePath = Join-Path $migrationProjectRoot $_
    if (Test-Path -LiteralPath $migrationSourcePath -PathType Container) { Get-ChildItem -LiteralPath $migrationSourcePath -File -Recurse }
    elseif (Test-Path -LiteralPath $migrationSourcePath -PathType Leaf) { Get-Item -LiteralPath $migrationSourcePath }
  }
  if (!$migrationFrontend -or ($migrationFrontendSources | Where-Object { $_.LastWriteTimeUtc -gt $migrationFrontend.LastWriteTimeUtc } | Select-Object -First 1)) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
  $migrationExecutableInfo = @('release','debug') | ForEach-Object { Get-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR "$_/zhezhi-workbench-tauri.exe") -ErrorAction SilentlyContinue } | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  $migrationNativeSources = @('src-tauri/src','src-tauri/bootstrap','vendor/design','src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/build.rs','src-tauri/tauri.conf.json') | ForEach-Object {
    $migrationSourcePath = Join-Path $migrationProjectRoot $_
    if (Test-Path -LiteralPath $migrationSourcePath -PathType Container) { Get-ChildItem -LiteralPath $migrationSourcePath -File -Recurse }
    elseif (Test-Path -LiteralPath $migrationSourcePath -PathType Leaf) { Get-Item -LiteralPath $migrationSourcePath }
  }
  if (!$migrationExecutableInfo -or ($migrationNativeSources | Where-Object { $_.LastWriteTimeUtc -gt $migrationExecutableInfo.LastWriteTimeUtc } | Select-Object -First 1)) {
    & cargo build --manifest-path src-tauri/Cargo.toml --locked --bin zhezhi-workbench-tauri
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $migrationExecutable = Join-Path $env:CARGO_TARGET_DIR 'debug/zhezhi-workbench-tauri.exe'
  } else { $migrationExecutable = $migrationExecutableInfo.FullName }
  $migrationApplication = Start-Process -FilePath $migrationExecutable -WorkingDirectory $migrationProjectRoot -WindowStyle Hidden -PassThru -Wait
  exit $migrationApplication.ExitCode
} finally { Pop-Location }
