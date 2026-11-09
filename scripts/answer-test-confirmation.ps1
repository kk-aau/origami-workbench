param([int]$TargetProcessId,[string]$ResultFile,[string]$Answer='继续')
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TestModalButton {
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$deadline=[DateTime]::UtcNow.AddSeconds(50)
while([DateTime]::UtcNow -lt $deadline){
  $owner=[System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$TargetProcessId)))
  $modal=if($owner){$owner.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'确认操作')))}else{$null}
  if($null -ne $modal){
    $button=$modal.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$Answer)))
    if($null -ne $button){
      $invoke=$null
      if($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$invoke)){$invoke.Invoke()}
      elseif($modal.Current.NativeWindowHandle -ne 0 -and $button.Current.AutomationId -match '^CommandButton_(\d+)$'){
        # Electron uses a Windows TaskDialog; TDM_CLICK_BUTTON closes its real modal loop.
        if(-not [TestModalButton]::PostMessage([IntPtr]$modal.Current.NativeWindowHandle,0x466,[IntPtr][int]$Matches[1],[IntPtr]::Zero)){throw 'Test modal button click failed'}
      }else{throw 'Test modal has no invokable button'}
      [IO.File]::WriteAllText($ResultFile,"Native dialog $Answer invoked for PID $TargetProcessId")
      exit 0
    }
  }
  Start-Sleep -Milliseconds 120
}
[IO.File]::WriteAllText($ResultFile,'Native dialog timed out')
exit 1
