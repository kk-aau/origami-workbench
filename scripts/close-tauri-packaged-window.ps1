param([Parameter(Mandatory=$true)][int]$TargetProcessId,[Parameter(Mandatory=$true)][string]$ExpectedExecutable)
$ErrorActionPreference='Stop'
$migrationRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$migrationExpected=[IO.Path]::GetFullPath($ExpectedExecutable)
if (!$migrationExpected.StartsWith($migrationRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Only this migration workspace test application may be closed' }
$migrationProcess=Get-Process -Id $TargetProcessId -ErrorAction Stop
if ($migrationProcess.Path -ine $migrationExpected) { throw 'PID executable identity mismatch' }
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class PackagedMigrationClose {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc fn, IntPtr p);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static int Close(int processId) {
    var found=new List<IntPtr>();
    EnumWindows((h,p)=>{uint owner;GetWindowThreadProcessId(h,out owner);var title=new StringBuilder(256);GetWindowText(h,title,256);if(owner==processId&&title.ToString().StartsWith("折纸工坊"))found.Add(h);return true;},IntPtr.Zero);
    foreach(var h in found)PostMessage(h,0x0010,IntPtr.Zero,IntPtr.Zero);
    return found.Count;
  }
}
'@
$migrationCount=[PackagedMigrationClose]::Close($TargetProcessId)
if (!$migrationCount) { throw 'No native workbench window found' }
Write-Output "Posted native WM_CLOSE to $migrationCount window(s) of verified package PID $TargetProcessId"
