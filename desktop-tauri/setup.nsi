Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
!include "nsDialogs.nsh"
!addplugindir /x86-unicode "${PLUGIN_DIR}"
Name "折纸工坊 Tauri"
OutFile "${OUTPUT_EXE}"
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"
RequestExecutionLevel user
CRCCheck on
SetCompressor zlib
SetCompress off
ShowInstDetails show
ShowUninstDetails show
; Empty until .onInit: NSIS puts an explicit /D= target here before .onInit.
; /D= is removed from $CMDLINE, so parsing it with GetOptions is not reliable.
InstallDir ""
VIProductVersion "${FILE_VERSION}"
VIAddVersionKey /LANG=2052 "ProductName" "折纸工坊 Tauri"
VIAddVersionKey /LANG=2052 "FileDescription" "折纸工坊独立迁移版安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "GPL-3.0-only"
!define MUI_ABORTWARNING
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${APP_LICENSE}"
!insertmacro MUI_PAGE_DIRECTORY
Page custom OptionsPage SaveOptions
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchWorkbench
!define MUI_FINISHPAGE_RUN_TEXT "启动折纸工坊"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZhezhiWorkbenchTauri"
Var SkipIntegration
Var DesktopChoice
Var ProjectChoice
Var OriChoice
Var DeskControl
Var ProjectControl
Var OriControl
Var OldLocation
Var OldVersion
Var Stage
Var LogPath
Var Failure
!define CLASSES "Software\Classes"
!define WVKEY "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

Function LaunchWorkbench
  Exec '"$INSTDIR\zhezhi-workbench-tauri.exe"'
FunctionEnd

Function OptionsPage
  !insertmacro MUI_HEADER_TEXT "安装选项" "选择在 Windows 中打开折纸工坊的方式。"
  nsDialogs::Create 1018
  Pop $0
  ${If} $OldVersion == ""
    StrCpy $1 "安装 ${APP_VERSION}"
  ${ElseIf} $OldLocation != $INSTDIR
    StrCpy $1 "新目录安装 ${APP_VERSION}。原版本 $OldVersion 和数据位于 $OldLocation"
  ${ElseIf} $OldVersion == "${APP_VERSION}"
    StrCpy $1 "修复已安装的 ${APP_VERSION}（检查并恢复程序文件）"
  ${Else}
    StrCpy $1 "已安装 $OldVersion  →  本次安装 ${APP_VERSION}"
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 30u "$1$\r$\n目标目录：$INSTDIR"
  Pop $0
  ${NSD_CreateCheckbox} 0 39u 100% 14u "创建桌面快捷方式"
  Pop $DeskControl
  ${NSD_SetState} $DeskControl $DesktopChoice
  ${NSD_CreateCheckbox} 0 59u 100% 14u "注册折痕工程 (.zcp) 和折序工程 (.zds)"
  Pop $ProjectControl
  ${NSD_SetState} $ProjectControl $ProjectChoice
  ${NSD_CreateCheckbox} 0 79u 100% 14u "将折纸工坊加入 .ori 文件的“打开方式”"
  Pop $OriControl
  ${NSD_SetState} $OriControl $OriChoice
  nsDialogs::Show
FunctionEnd

Function SaveOptions
  ${NSD_GetState} $DeskControl $DesktopChoice
  ${NSD_GetState} $ProjectControl $ProjectChoice
  ${NSD_GetState} $OriControl $OriChoice
FunctionEnd

!macro RegisterFile EXT ID TITLE ICON DEFAULT
  WriteRegStr HKCU "${CLASSES}\${ID}" "" "${TITLE}"
  WriteRegStr HKCU "${CLASSES}\${ID}\DefaultIcon" "" '"$INSTDIR\${ICON}",0'
  WriteRegStr HKCU "${CLASSES}\${ID}\shell\open\command" "" '"$INSTDIR\zhezhi-workbench-tauri.exe" --open "%1"'
  WriteRegBin HKCU "${CLASSES}\.${EXT}\OpenWithProgids" "${ID}" ""
  !if ${DEFAULT} = 1
    ReadRegStr $0 HKCR ".${EXT}" ""
    ${If} $0 == ""
      WriteRegStr HKCU "${CLASSES}\.${EXT}" "" "${ID}"
    ${EndIf}
  !endif
!macroend

!macro RemoveFile EXT ID
  DeleteRegValue HKCU "${CLASSES}\.${EXT}\OpenWithProgids" "${ID}"
  ReadRegStr $0 HKCU "${CLASSES}\.${EXT}" ""
  ${If} $0 == "${ID}"
    DeleteRegValue HKCU "${CLASSES}\.${EXT}" ""
  ${EndIf}
  DeleteRegKey /ifempty HKCU "${CLASSES}\.${EXT}\OpenWithProgids"
  DeleteRegKey /ifempty HKCU "${CLASSES}\.${EXT}"
  DeleteRegKey HKCU "${CLASSES}\${ID}"
!macroend

Function .onInstFailed
  System::Call 'kernel32::SetEnvironmentVariableW(w "ZHEZHI_SETUP_FAILURE", w "$Failure")'
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "[IO.File]::AppendAllText($$env:ZHEZHI_SETUP_LOG,$$env:ZHEZHI_SETUP_FAILURE+[Environment]::NewLine)"'
  MessageBox MB_YESNOCANCEL|MB_ICONSTOP "$Failure$\r$\n安装日志：$LogPath$\r$\n是：在文件夹中显示日志　否：复制日志　取消：关闭" /SD IDCANCEL IDYES reveal IDNO copy
  Return
  reveal:
    Exec '"$WINDIR\explorer.exe" /select,"$LogPath"'
    Return
  copy:
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "Get-Content -Raw -Encoding UTF8 -LiteralPath $$env:ZHEZHI_SETUP_LOG | Set-Clipboard"'
FunctionEnd

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "此版本需要 Windows 64 位系统。"
    SetErrorLevel 1
    Quit
  ${EndIf}
  SetRegView 64
  SetShellVarContext current
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} "$0" "/NOINTEGRATION" $1
  ${IfNot} ${Errors}
    StrCpy $SkipIntegration 1
  ${EndIf}
  StrCpy $DesktopChoice 1
  StrCpy $ProjectChoice 1
  StrCpy $OriChoice 0
  ${If} $SkipIntegration != 1
    ReadRegStr $OldLocation HKCU "${UNINSTALL_KEY}" "InstallLocation"
    ReadRegStr $OldVersion HKCU "${UNINSTALL_KEY}" "DisplayVersion"
    !macro ReadChoice NAME VALUE
      ClearErrors
      ReadRegDWORD $0 HKCU "${UNINSTALL_KEY}" "${NAME}"
      ${IfNot} ${Errors}
        StrCpy ${VALUE} $0
      ${EndIf}
    !macroend
    !insertmacro ReadChoice DesktopShortcut $DesktopChoice
    !insertmacro ReadChoice ProjectFiles $ProjectChoice
    !insertmacro ReadChoice OriOpenWith $OriChoice
  ${EndIf}
  System::Call 'kernel32::GetCurrentProcessId() i.r0'
  StrCpy $LogPath "$TEMP\Zhezhi-Setup-${APP_VERSION}-$0.log"
  System::Call 'kernel32::SetEnvironmentVariableW(w "ZHEZHI_SETUP_LOG", w "$LogPath")'
  ; Isolated QA must name its target; never fall back to a user's installation.
  ${If} $SkipIntegration == 1
  ${AndIf} $INSTDIR == ""
    SetErrorLevel 2
    Quit
  ${EndIf}
  ; Preserve explicit /D= for both normal installs and isolated QA.
  ${If} $INSTDIR == ""
    ReadRegStr $0 HKCU "${UNINSTALL_KEY}" "InstallLocation"
    ${If} $0 != ""
      StrCpy $INSTDIR "$0"
    ${Else}
      StrCpy $INSTDIR "D:\Applications\Zhezhi-Workbench-Tauri"
      IfFileExists "D:\*.*" +2 0
        StrCpy $INSTDIR "$EXEDIR\Zhezhi-Workbench-Tauri"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function .onVerifyInstDir
  ; The Win32 API normalizes not-yet-created paths; the NSIS file command does not.
  System::Call 'Kernel32::GetFullPathNameW(w "$INSTDIR", i ${NSIS_MAX_STRLEN}, w.r0, p 0) i.r2'
  ${If} $2 == 0
    Abort
  ${EndIf}
  ${GetRoot} "$0" $1
  ${If} $0 == "$1\"
  ${OrIf} $0 == "$1"
    Abort
  ${EndIf}
  StrCpy $INSTDIR "$0"
FunctionEnd

!macro AcquireSetupMutex
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\ZhezhiWorkbenchSetup") p.r0 ?e'
  Pop $1
  ${If} $0 == 0
  ${OrIf} $1 == 183
    StrCpy $Failure "另一项折纸工坊安装或卸载正在进行。"
    DetailPrint "$Failure"
    SetErrorLevel 5
    Abort
  ${EndIf}
!macroend

Section "工作台"
  SetRegView 64
  SetShellVarContext current
  ; Silent /D= installs do not necessarily traverse the directory page.
  Call .onVerifyInstDir
  StrCpy $Failure "安装失败。请查看安装日志。"
  SetRegView 32
  ReadRegStr $0 HKLM "${WVKEY}" "pv"
  SetRegView 64
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    ReadRegStr $0 HKCU "${WVKEY}" "pv"
    ${If} $0 == ""
    ${OrIf} $0 == "0.0.0.0"
      StrCpy $Failure "缺少 Microsoft Edge WebView2。联网可使用 Evergreen 引导程序，离线请安装独立 x64 运行库，再重新运行安装包。"
      MessageBox MB_YESNO|MB_ICONEXCLAMATION "$Failure$\r$\n是否打开微软官方下载页？" /SD IDNO IDNO missing_runtime
      ExecShell "open" "https://developer.microsoft.com/microsoft-edge/webview2/"
      missing_runtime:
      SetErrorLevel 3
      Abort
    ${EndIf}
  ${EndIf}
  !insertmacro AcquireSetupMutex
  IfFileExists "$INSTDIR\zhezhi-workbench-tauri.exe" 0 app_not_running
  System::Call 'Kernel32::CreateFileW(w "$INSTDIR\zhezhi-workbench-tauri.exe", i 0x40000000, i 0, p 0, i 3, i 0, p 0) p.r0'
  ${If} $0 == -1
    StrCpy $Failure "请先保存工程并关闭该目录中的折纸工坊，再运行安装包。请同时确认安装目录可写。"
    SetErrorLevel 5
    Abort
  ${EndIf}
  System::Call 'Kernel32::CloseHandle(p r0)'
  app_not_running:
  InitPluginsDir
  File /oname=$PLUGINSDIR\install.ps1 "${INSTALL_SCRIPT}"
  File /oname=$PLUGINSDIR\files.json "${INSTALL_FILES}"
  !macro Transaction ACTION
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install.ps1" -Action ${ACTION} -Destination "$INSTDIR" -Control "$PLUGINSDIR" -Log "$LogPath" -ArchiveBytes ${ARCHIVE_BYTES}'
    Pop $0
    Pop $1
  !macroend
  !insertmacro Transaction Prepare
  StrCmp $0 0 +2
    Goto failed
  FileOpen $0 "$PLUGINSDIR\transaction.txt" r
  FileReadUTF16LE $0 $Stage
  FileClose $0
  StrCmp $Stage "" failed
  File /oname=$PLUGINSDIR\payload.7z "${PAYLOAD_ARCHIVE}"
  SetOutPath "$Stage"
  Nsis7z::Extract "$PLUGINSDIR\payload.7z"
  File /oname=crease-file.ico "${CREASE_ICON}"
  File /oname=diagram-file.ico "${DIAGRAM_ICON}"
  WriteUninstaller "$Stage\Uninstall.exe"
  SetOutPath "$INSTDIR"
  !insertmacro Transaction Commit
  StrCmp $0 0 +2
    Goto failed
  ${If} $SkipIntegration != 1
  ${If} $DesktopChoice == 1
    CreateShortcut "$DESKTOP\折纸工坊 Tauri.lnk" "$INSTDIR\zhezhi-workbench-tauri.exe"
  ${Else}
    Delete "$DESKTOP\折纸工坊 Tauri.lnk"
  ${EndIf}
  ${If} $ProjectChoice == 1
    !insertmacro RegisterFile zcp "ZhezhiWorkbench.Crease" "折纸工坊折痕工程" "crease-file.ico" 1
    !insertmacro RegisterFile zds "ZhezhiWorkbench.Diagram" "折纸工坊折序工程" "diagram-file.ico" 1
  ${Else}
    !insertmacro RemoveFile zcp "ZhezhiWorkbench.Crease"
    !insertmacro RemoveFile zds "ZhezhiWorkbench.Diagram"
  ${EndIf}
  ${If} $OriChoice == 1
    !insertmacro RegisterFile ori "ZhezhiWorkbench.Ori" "折痕图 (.ori)" "crease-file.ico" 0
  ${Else}
    !insertmacro RemoveFile ori "ZhezhiWorkbench.Ori"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000,i 0,p 0,p 0)'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "DesktopShortcut" $DesktopChoice
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "ProjectFiles" $ProjectChoice
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "OriOpenWith" $OriChoice
  CreateDirectory "$SMPROGRAMS\折纸工坊 Tauri"
  CreateShortcut "$SMPROGRAMS\折纸工坊 Tauri\折纸工坊 Tauri.lnk" "$INSTDIR\zhezhi-workbench-tauri.exe"
  CreateShortcut "$SMPROGRAMS\折纸工坊 Tauri\卸载.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "折纸工坊 Tauri（独立迁移版）"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" ${INSTALL_KIB}
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\zhezhi-workbench-tauri.exe"
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  ${EndIf}
  Goto done
  failed:
  StrCpy $Failure "安装文件未能提交。$1"
  SetErrorLevel 4
  Abort
  done:
SectionEnd

Section "Uninstall"
  !insertmacro AcquireSetupMutex
  SetRegView 64
  SetShellVarContext current
  IfFileExists "$INSTDIR\resources\runtime-layout.json" 0 uninstall_refused
  IfFileExists "$INSTDIR\zhezhi-workbench-tauri.exe" 0 uninstall_unlocked
  System::Call 'Kernel32::CreateFileW(w "$INSTDIR\zhezhi-workbench-tauri.exe", i 0x40000000, i 0, p 0, i 3, i 0, p 0) p.r0'
  ${If} $0 == -1
    MessageBox MB_OK|MB_ICONSTOP "请先关闭此目录中的 Tauri 工作台，再卸载。用户数据将保留。"
    SetErrorLevel 5
    Abort
  ${EndIf}
  System::Call 'Kernel32::CloseHandle(p r0)'
  uninstall_unlocked:
  !include "${UNINSTALL_MANIFEST}"
  Delete "$INSTDIR\crease-file.ico"
  Delete "$INSTDIR\diagram-file.ico"
  Delete "$INSTDIR\installed-files.json"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  ReadRegStr $0 HKCU "${UNINSTALL_KEY}" "InstallLocation"
  ${If} $0 == $INSTDIR
    Delete "$DESKTOP\折纸工坊 Tauri.lnk"
    !insertmacro RemoveFile zcp "ZhezhiWorkbench.Crease"
    !insertmacro RemoveFile zds "ZhezhiWorkbench.Diagram"
    !insertmacro RemoveFile ori "ZhezhiWorkbench.Ori"
    System::Call 'shell32::SHChangeNotify(i 0x08000000,i 0,p 0,p 0)'
    Delete "$SMPROGRAMS\折纸工坊 Tauri\折纸工坊 Tauri.lnk"
    Delete "$SMPROGRAMS\折纸工坊 Tauri\卸载.lnk"
    RMDir "$SMPROGRAMS\折纸工坊 Tauri"
    DeleteRegKey HKCU "${UNINSTALL_KEY}"
  ${EndIf}
  Goto uninstall_done
  uninstall_refused:
  MessageBox MB_OK|MB_ICONSTOP "未找到迁移版资源标记，已停止卸载，避免误删其他目录。"
  SetErrorLevel 6
  uninstall_done:
SectionEnd
