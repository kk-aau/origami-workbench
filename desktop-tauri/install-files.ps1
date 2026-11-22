param(
    [Parameter(Mandatory)][ValidateSet('Prepare','Commit')]$Action,
    [Parameter(Mandatory)][string]$Destination,
    [Parameter(Mandatory)][string]$Control,
    [Parameter(Mandatory)][string]$Log,
    [long]$ArchiveBytes = 0
)
$ErrorActionPreference = 'Stop'
function Log-Line([string]$message) {
    [IO.File]::AppendAllText($Log, "$(Get-Date -Format o) $message" + [Environment]::NewLine)
}
function Check-Path([string]$path) {
    while ($path) {
        if ((Test-Path -LiteralPath $path) -and ((Get-Item -Force -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "不能通过目录联接或符号链接更新文件：$path"
        }
        $path = [IO.Path]::GetDirectoryName($path)
    }
}
function Managed-Path([string]$name) {
    if ($name -notmatch '^(resources/(dist|legal|engine)/.+|resources/(workbench\.ico|runtime-layout\.json|LICENSE|THIRD_PARTY_NOTICES\.md)|zhezhi-workbench-tauri\.exe|使用说明\.txt)$' -or
        ($name.Split('/') | Where-Object {$_ -in '.','..','' -or $_ -match '[\\:*?"<>|]' -or $_ -match '[. ]$'})) { throw "无效的安装清单路径：$name" }
    return [IO.Path]::Combine($root, $name.Replace('/', '\'))
}
function Clean-Stage {
    $full = [IO.Path]::GetFullPath($stage)
    if ([IO.Path]::GetDirectoryName($full) -ne $root -or [IO.Path]::GetFileName($full) -notmatch '^\.zhezhi-setup-[0-9a-f]{32}$') { throw '暂存目录无效。' }
    Check-Path $full
    if ([IO.Directory]::Exists($full)) { Remove-Item -LiteralPath $full -Recurse -Force }
}
function Hash-File([string]$path) {
    $stream = [IO.File]::OpenRead($path)
    try { return [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-','') }
    finally { $stream.Dispose() }
}
$root = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
$state = Join-Path $Control 'transaction.txt'
try {
    if (!$root -or ($root + '\') -eq [IO.Path]::GetPathRoot($Destination)) { throw '请选择专用的安装目录。' }
    Check-Path $root
    if ($Action -eq 'Prepare') {
        [array]$rows = Get-Content -LiteralPath (Join-Path $Control 'files.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $needed = [long](($rows | Measure-Object -Property bytes -Sum).Sum) + 8MB
        $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($Destination))
        $tempDrive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($Control))
        if ($drive.Name -eq $tempDrive.Name) { $needed += $ArchiveBytes }
        if ($tempDrive.AvailableFreeSpace -lt $ArchiveBytes) { throw '临时目录空间不足，无法展开安装包。' }
        if ($drive.AvailableFreeSpace -lt $needed) { throw "安装盘空间不足。需要至少 $([math]::Ceiling($needed/1MB)) MB。" }
        [void][IO.Directory]::CreateDirectory($root)
        $stage = Join-Path $root ('.zhezhi-setup-' + [Guid]::NewGuid().ToString('N'))
        [void][IO.Directory]::CreateDirectory($stage)
        [IO.File]::WriteAllText($state, $stage, [Text.UnicodeEncoding]::new($false,$false))
        Log-Line "已检查空间与写入权限。目标 $root"
        exit 0
    }
    $stage = [IO.File]::ReadAllText($state,[Text.Encoding]::Unicode)
    if ([IO.Path]::GetDirectoryName($stage) -ne $root -or [IO.Path]::GetFileName($stage) -notmatch '^\.zhezhi-setup-[0-9a-f]{32}$') { throw '无效的暂存目录。' }
    $hasher = [Security.Cryptography.SHA256]::Create()
    $inventory = 'installed-files.json'
    $list = Join-Path $Control 'files.json'
    [array]$rows = Get-Content -LiteralPath $list -Raw -Encoding UTF8 | ConvertFrom-Json
    $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $changes = [Collections.Generic.List[string]]::new()
    $obsolete = [Collections.Generic.List[string]]::new()
    foreach ($row in $rows) {
        $target = Managed-Path $row.path
        Check-Path $target
        $source = Join-Path $stage $row.path
        if (!(Test-Path -LiteralPath $source -PathType Leaf) -or (Get-Item -LiteralPath $source).Length -ne $row.bytes -or (Hash-File $source) -ne $row.sha256) {
            throw "安装文件校验失败：$($row.path)"
        }
        if (!$names.Add($row.path)) { throw "重复的安装文件：$($row.path)" }
        if ([IO.File]::Exists($target) -and (Hash-File $target) -eq $row.sha256) { continue }
        $changes.Add($row.path)
    }
    $oldList = Join-Path $root $inventory
    Check-Path $oldList
    if ([IO.File]::Exists($oldList)) {
        try { $previous = Get-Content -LiteralPath $oldList -Raw -Encoding UTF8 | ConvertFrom-Json }
        catch { $previous=@(); Log-Line '旧文件清单无法读取，按当前安装包修复程序文件。' }
        foreach ($old in $previous) {
            if (!$old.path -or $old.sha256 -notmatch '^[0-9a-f]{64}$') { continue }
            try { $target = Managed-Path $old.path } catch { continue }
            if (!$names.Contains($old.path) -and [IO.File]::Exists($target)) {
                Check-Path $target
                if ((Hash-File $target) -eq $old.sha256) { $obsolete.Add($old.path) }
            }
        }
    }
    foreach ($extra in @('Uninstall.exe','crease-file.ico','diagram-file.ico',$inventory)) { Check-Path (Join-Path $root $extra); $changes.Add($extra) }
    [IO.File]::Copy($list,(Join-Path $stage $inventory))
    $backups = Join-Path $stage 'backup'
    [void][IO.Directory]::CreateDirectory($backups)
    $done = [Collections.Generic.List[object]]::new()
    try {
        foreach ($name in @($changes.ToArray()) + @($obsolete.ToArray())) {
            $target = Join-Path $root $name
            $backup = Join-Path $backups ([string]$done.Count)
            $source = Join-Path $stage $name
            [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
            if ($obsolete.Contains($name)) { [IO.File]::Move($target,$backup) }
            elseif ([IO.File]::Exists($target)) { [IO.File]::Replace($source,$target,$backup) }
            else { [IO.File]::Move($source,$target) }
            $done.Add(@{Target=$target; Backup=$backup})
        }
    } catch {
        $failure = $_
        Log-Line "安装中断，开始回滚：$failure"
        for ($i=$done.Count-1; $i -ge 0; $i--) {
            $item=$done[$i]
            if ([IO.File]::Exists($item.Backup)) {
                if ([IO.File]::Exists($item.Target)) { [IO.File]::Delete($item.Target) }
                [IO.File]::Move($item.Backup,$item.Target)
            } else { [IO.File]::Delete($item.Target) }
        }
        Log-Line '已还原本次替换的文件。'
        Clean-Stage
        throw $failure
    }
    Log-Line "安装完成。更新 $($changes.Count) 个文件，移除 $($obsolete.Count) 个旧文件。"
    Clean-Stage
} catch {
    $reason = $_.Exception.Message
    try {
        Log-Line "失败：$reason"
        if ($stage -and [IO.Directory]::Exists($stage)) {
            if ($done -and $done.Count) { Log-Line "保留回滚备份：$stage" } else { Clean-Stage }
        }
    } catch {}
    [Console]::Error.WriteLine($reason)
    exit 1
}
