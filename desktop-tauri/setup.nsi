Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
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
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZhezhiWorkbenchTauri"
Var SkipIntegration

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

Section "工作台"
  SetRegView 64
  SetShellVarContext current
  ; Silent /D= installs do not necessarily traverse the directory page.
  Call .onVerifyInstDir
  IfFileExists "$INSTDIR\zhezhi-workbench-tauri.exe" 0 app_not_running
  System::Call 'Kernel32::CreateFileW(w "$INSTDIR\zhezhi-workbench-tauri.exe", i 0x40000000, i 0, p 0, i 3, i 0, p 0) p.r0'
  ${If} $0 == -1
    MessageBox MB_OK|MB_ICONSTOP "无法更新当前工作台。请先关闭该目录中的 Tauri 迁移版，并确认安装目录可写。"
    SetErrorLevel 5
    Abort
  ${EndIf}
  System::Call 'Kernel32::CloseHandle(p r0)'
  app_not_running:
  InitPluginsDir
  File /oname=$PLUGINSDIR\payload.7z "${PAYLOAD_ARCHIVE}"
  CreateDirectory "$INSTDIR"
  SetOutPath "$INSTDIR"
  Nsis7z::Extract "$PLUGINSDIR\payload.7z"
  IfFileExists "$INSTDIR\zhezhi-workbench-tauri.exe" 0 failed
  IfFileExists "$INSTDIR\resources\runtime-layout.json" 0 failed
  IfFileExists "$INSTDIR\resources\dist\index.html" 0 failed
  IfFileExists "$INSTDIR\resources\engine\zhezhi-tess.exe" 0 failed
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  ${If} $SkipIntegration != 1
  CreateDirectory "$SMPROGRAMS\折纸工坊 Tauri"
  CreateShortcut "$SMPROGRAMS\折纸工坊 Tauri\折纸工坊 Tauri.lnk" "$INSTDIR\zhezhi-workbench-tauri.exe"
  CreateShortcut "$SMPROGRAMS\折纸工坊 Tauri\卸载.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "折纸工坊 Tauri（独立迁移版）"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\zhezhi-workbench-tauri.exe"
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  ${EndIf}
  Goto done
  failed:
  MessageBox MB_OK|MB_ICONSTOP "程序资源未完整解压。请核对下载文件 SHA256 和磁盘空间后重试。已存在的用户数据不会删除。"
  SetErrorLevel 4
  Abort
  done:
SectionEnd

Section "Uninstall"
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
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  ReadRegStr $0 HKCU "${UNINSTALL_KEY}" "InstallLocation"
  ${If} $0 == $INSTDIR
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
