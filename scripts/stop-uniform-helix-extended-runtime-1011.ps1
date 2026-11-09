param([Parameter(Mandatory=$true)][int[]]$TaskBrowserIds)
$ErrorActionPreference = 'Stop'
$taskWorkspace = (Get-Location).Path
if ($taskWorkspace -ne 'D:\codex\折纸工具\workbench') { throw '须在明确项目目录运行。' }
$taskRecord = Get-Content -LiteralPath 'output/original-uniform-helix-extended-server-pid-1011.json' -Raw | ConvertFrom-Json
$taskServerId = [int]$taskRecord.pid
if ($taskRecord.port -ne 8878 -or $taskRecord.data -ne 'D:/codex/折纸工具/workbench/output/original-uniform-helix-extended-main-server-1011') { throw '服务来源不一致。' }
$taskProcesses = @(Get-CimInstance Win32_Process)
$taskServer = @($taskProcesses | Where-Object ProcessId -eq $taskServerId)
if ($taskServer.Count -ne 1 -or $taskServer[0].CommandLine -notlike '*output/start-original-uniform-helix-extended-server-1011.mjs*') { throw '自有服务进程身份不一致。' }
$taskListeners = @(Get-NetTCPConnection -LocalPort 8878 -State Listen -ErrorAction SilentlyContinue)
if ($taskListeners.Count -lt 1 -or @($taskListeners | Where-Object OwningProcess -ne $taskServerId).Count) { throw '自有端口拥有者不一致。' }
$taskUserBefore = @(Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
$taskBrowsersPresent = @($taskProcesses | Where-Object { $TaskBrowserIds -contains [int]$_.ProcessId })
if ($taskBrowsersPresent.Count) { throw '先通过CLI关闭所有本轮自有浏览器，禁止宽泛终止浏览器。' }
$taskOwned = @($taskServer[0])
$taskSeenIds = @($taskServerId)
do {
    $taskNewChildren = @($taskProcesses | Where-Object { $taskSeenIds -contains [int]$_.ParentProcessId -and $taskSeenIds -notcontains [int]$_.ProcessId })
    foreach ($taskChild in $taskNewChildren) { $taskOwned += $taskChild; $taskSeenIds += [int]$taskChild.ProcessId }
} while ($taskNewChildren.Count)
foreach ($taskChild in @($taskOwned | Sort-Object CreationDate -Descending)) {
    $taskLive = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $taskChild.ProcessId) -ErrorAction SilentlyContinue
    if ($taskLive -and $taskLive.CreationDate -eq $taskChild.CreationDate -and $taskLive.CommandLine -eq $taskChild.CommandLine) {
        Stop-Process -Id ([int]$taskChild.ProcessId) -Force -ErrorAction Stop
    }
}
$taskAfterProcesses = @(Get-CimInstance Win32_Process)
$taskUserAfter = @(Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
$taskListenerAbsent = @(Get-NetTCPConnection -LocalPort 8878 -State Listen -ErrorAction SilentlyContinue).Count -eq 0
$taskBrowsersAbsent = @($taskAfterProcesses | Where-Object { $TaskBrowserIds -contains [int]$_.ProcessId }).Count -eq 0
$taskUserUntouched = (ConvertTo-Json -InputObject $taskUserBefore -Compress) -eq (ConvertTo-Json -InputObject $taskUserAfter -Compress)
if (-not $taskListenerAbsent -or -not $taskBrowsersAbsent -or -not $taskUserUntouched) { throw '清理后核验失败，未输出成功记录。' }
$taskResult = [ordered]@{ verified=$true; serverPort=8878; serverId=$taskServerId; ownTree=@($taskOwned | Select-Object ProcessId,ParentProcessId,CommandLine); ownBrowserIds=$TaskBrowserIds; ownBrowsersAbsent=$taskBrowsersAbsent; ownListenerAbsent=$taskListenerAbsent; userServiceBefore=$taskUserBefore; userServiceAfter=$taskUserAfter; userServiceUntouched=$taskUserUntouched; userServiceComparisonScope='before and after own cleanup'; packed=$false; published=$false }
if (Test-Path -LiteralPath 'output/original-uniform-helix-extended-runtime-stopped-1011.json') { throw '保留现有清理记录。' }
$taskResult | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath 'output/original-uniform-helix-extended-runtime-stopped-1011.json' -Encoding UTF8
ConvertTo-Json -InputObject @{verified=$true; ownListenerAbsent=$true; ownBrowsersAbsent=$true; userServiceUntouched=$true} -Compress

