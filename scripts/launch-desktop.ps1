#requires -Version 5.1
[CmdletBinding()]
param([switch]$FallbackToBrowser)

# Keep this source ASCII so Windows PowerShell 5.1 can read it without a BOM.
$ErrorActionPreference = 'Stop'
$workbenchRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

try {
    $package = Get-Content -LiteralPath (Join-Path $workbenchRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $version = $package.version
    if ($version -isnot [string] -or $version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$') {
        throw 'package.json does not contain a valid application version.'
    }

    $desktopPath = Join-Path $workbenchRoot ('release\Zhezhi-Workbench-' + $version + '-Portable-x64.exe')
    if (-not (Test-Path -LiteralPath $desktopPath -PathType Leaf)) {
        if ($FallbackToBrowser) {
            Write-Host ('Desktop package v' + $version + ' is unavailable; opening the browser workbench.')
            & (Join-Path $workbenchRoot 'launch.ps1')
            exit $LASTEXITCODE
        }
        throw ('Desktop package v' + $version + ' was not found. Build it with npm run package:desktop in workbench.')
    }

    Start-Process -FilePath $desktopPath -WorkingDirectory $workbenchRoot | Out-Null
    exit 0
} catch {
    Write-Host ('[ERROR] ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
