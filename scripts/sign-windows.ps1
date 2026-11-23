param([Parameter(Mandatory)][string]$File,[switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$thumbprint = $env:ZHEZHI_SIGN_THUMBPRINT
if (!$thumbprint) {
    if ($env:ZHEZHI_REQUIRE_SIGNING -eq '1' -or $env:ZHEZHI_TIMESTAMP_URL) { throw '请配置发布证书 ZHEZHI_SIGN_THUMBPRINT。' }
    return
}
if ($thumbprint -notmatch '^[A-Fa-f0-9]{40}$') { throw '发布证书指纹无效。' }
function Check-Signature {
    $signature = Get-AuthenticodeSignature -LiteralPath $File
    return ($signature.Status -eq 'Valid' -and $signature.SignerCertificate.Thumbprint -eq $thumbprint -and $null -ne $signature.TimeStamperCertificate)
}
if (Check-Signature) { return }
if ($VerifyOnly) { throw "发布文件签名、证书指纹或时间戳验证失败：$File" }
if ($env:ZHEZHI_TIMESTAMP_URL -notmatch '^https?://') { throw '请指定 RFC 3161 时间戳服务 ZHEZHI_TIMESTAMP_URL。' }
$tool = (Get-Command signtool.exe -ErrorAction SilentlyContinue).Source
if (!$tool) {
    $tool = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../.toolchain/msvc/Windows Kits/10/bin') -Filter signtool.exe -Recurse | Where-Object {$_.Directory.Name -eq 'x64'} | Select-Object -Last 1 -ExpandProperty FullName
}
if (!$tool) { throw '缺少 Windows SDK SignTool。' }
$store = @()
if (!(Test-Path "Cert:\CurrentUser\My\$thumbprint") -and (Test-Path "Cert:\LocalMachine\My\$thumbprint")) { $store=@('/sm') }
& $tool sign @store /sha1 $thumbprint /fd SHA256 /tr $env:ZHEZHI_TIMESTAMP_URL /td SHA256 $File
if ($LASTEXITCODE -ne 0 -or !(Check-Signature)) { throw "发布签名失败：$File" }
