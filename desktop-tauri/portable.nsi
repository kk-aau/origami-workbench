Unicode true
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
!addplugindir /x86-unicode "${PLUGIN_DIR}"
Name "折纸工坊 Tauri 便携版"
OutFile "${OUTPUT_EXE}"
Icon "${APP_ICON}"
RequestExecutionLevel user
CRCCheck on
SetCompressor zlib
SetCompress off
AutoCloseWindow true
SilentInstall silent
ShowInstDetails nevershow
WindowIcon off
VIProductVersion "${FILE_VERSION}"
VIAddVersionKey /LANG=2052 "ProductName" "折纸工坊 Tauri"
VIAddVersionKey /LANG=2052 "FileDescription" "折纸工坊独立迁移版便携启动器"
VIAddVersionKey /LANG=2052 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "GPL-3.0-only"
LoadLanguageFile "${NSISDIR}\Contrib\Language files\SimpChinese.nlf"
Var TempBase
Var TempRun
Var RuntimeHome
Var ChildExit
Var SplashWindow
Var SplashBitmap

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "此版本需要 Windows 64 位系统。"
    SetErrorLevel 1
    Quit
  ${EndIf}
  ReadEnvStr $TempBase "ZHEZHI_PORTABLE_TEMP"
  ${If} $TempBase == ""
    IfFileExists "D:\*.*" 0 +3
      StrCpy $TempBase "D:\Temp\Zhezhi-Workbench-Tauri"
      Goto temp_chosen
    StrCpy $TempBase "$EXEDIR\.zhezhi-tauri-temp"
  ${EndIf}
  temp_chosen:
  ; NSIS GetFullPathName returns an empty string for a missing directory.
  ; Validate the drive-qualified input, create it, then canonicalize it.
  StrCpy $0 "$TempBase" 1 1
  StrCpy $1 "$TempBase" 1 2
  ${If} $0 != ":"
  ${OrIf} $1 != "\"
    MessageBox MB_OK|MB_ICONSTOP "便携版临时目录必须是带盘符的绝对路径。"
    SetErrorLevel 2
    Quit
  ${EndIf}
  ClearErrors
  CreateDirectory "$TempBase"
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "无法创建解压目录：$TempBase。请检查磁盘权限。"
    SetErrorLevel 2
    Quit
  ${EndIf}
  GetFullPathName $0 "$TempBase"
  ${If} $0 == ""
    MessageBox MB_OK|MB_ICONSTOP "无法解析解压目录，已停止启动。"
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $TempBase "$0"
  ClearErrors
  GetTempFileName $TempRun "$TempBase"
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "无法创建解压目录：$TempBase。请将便携版放在可写磁盘后重试。"
    SetErrorLevel 2
    Quit
  ${EndIf}
  Delete "$TempRun"
  CreateDirectory "$TempRun"
  GetFullPathName $0 "$TempRun"
  ${GetParent} "$0" $1
  ${If} $1 != $TempBase
    MessageBox MB_OK|MB_ICONSTOP "临时目录未通过安全检查，已停止启动。"
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $TempRun "$0"
  FileOpen $0 "$TempRun\zhezhi-owned-temp.marker" w
  FileWrite $0 "${APP_VERSION}"
  FileClose $0
  ; A portable launcher has no install page. BgImage requires an installer
  ; parent, so use an independent native bitmap window in silent mode.
  InitPluginsDir
  File /oname=$PLUGINSDIR\splash.bmp "${SPLASH_IMAGE}"
  Call ShowExtractionSplash
FunctionEnd

Function ShowExtractionSplash
  System::Call 'User32::LoadImageW(p 0, w "$PLUGINSDIR\splash.bmp", i 0, i 0, i 0, i 0x10) p.r0'
  StrCpy $SplashBitmap $0
  ${If} $SplashBitmap == 0
    Return
  ${EndIf}
  System::Call 'User32::GetSystemMetrics(i 0) i.r0'
  System::Call 'User32::GetSystemMetrics(i 1) i.r1'
  IntOp $0 $0 - ${SPLASH_WIDTH}
  IntOp $0 $0 / 2
  IntOp $1 $1 - ${SPLASH_HEIGHT}
  IntOp $1 $1 / 2
  System::Call 'User32::CreateWindowExW(i 0x88, w "STATIC", w "折纸工坊 · 正在解压", i 0x9000000E, i r0, i r1, i ${SPLASH_WIDTH}, i ${SPLASH_HEIGHT}, p 0, p 0, p 0, p 0) p.r2'
  StrCpy $SplashWindow $2
  System::Call 'User32::SendMessageW(p $SplashWindow, i 0x172, p 0, p $SplashBitmap) p.r0'
  System::Call 'User32::ShowWindow(p $SplashWindow, i 4)'
  System::Call 'User32::UpdateWindow(p $SplashWindow)'
FunctionEnd

Function CloseExtractionSplash
  ${If} $SplashWindow != 0
    System::Call 'User32::DestroyWindow(p $SplashWindow)'
    StrCpy $SplashWindow 0
  ${EndIf}
  ${If} $SplashBitmap != 0
    System::Call 'Gdi32::DeleteObject(p $SplashBitmap)'
    StrCpy $SplashBitmap 0
  ${EndIf}
FunctionEnd

Function CleanupOwnTemp
  ${If} $TempRun == ""
    Return
  ${EndIf}
  GetFullPathName $0 "$TempRun"
  ${GetParent} "$0" $1
  ${If} $1 != $TempBase
    Return
  ${EndIf}
  IfFileExists "$0\zhezhi-owned-temp.marker" 0 done
  SetOutPath "$EXEDIR"
  RMDir /r "$0"
  done:
FunctionEnd

Section
  ; Re-check after plug-in initialization, before writing the large payload.
  GetFullPathName $0 "$TempRun"
  ${GetParent} "$0" $1
  ${If} $1 != $TempBase
    Call CloseExtractionSplash
    SetErrorLevel 2
    Quit
  ${EndIf}
  IfFileExists "$TempRun\zhezhi-owned-temp.marker" +3 0
    SetErrorLevel 2
    Quit
  SetOutPath "$TempRun"
  File /oname=payload.7z "${PAYLOAD_ARCHIVE}"
  CreateDirectory "$TempRun\app"
  SetOutPath "$TempRun\app"
  Nsis7z::Extract "$TempRun\payload.7z"
  IfFileExists "$TempRun\app\zhezhi-workbench-tauri.exe" 0 extract_failed
  IfFileExists "$TempRun\app\resources\runtime-layout.json" 0 extract_failed
  IfFileExists "$TempRun\app\resources\dist\index.html" 0 extract_failed
  IfFileExists "$TempRun\app\resources\engine\zhezhi-tess.exe" 0 extract_failed
  ReadEnvStr $RuntimeHome "ZHEZHI_TAURI_HOME"
  ${If} $RuntimeHome == ""
    StrCpy $RuntimeHome "$EXEDIR\Zhezhi-Tauri-Data"
    System::Call 'Kernel32::SetEnvironmentVariableW(w "ZHEZHI_TAURI_HOME", w "$RuntimeHome") i.r0'
  ${EndIf}
  System::Call 'Kernel32::SetEnvironmentVariableW(w "PORTABLE_EXECUTABLE_DIR", w "$EXEDIR") i.r0'
  System::Call 'Kernel32::SetEnvironmentVariableW(w "PORTABLE_EXECUTABLE_FILE", w "$EXEPATH") i.r0'
  System::Call 'Kernel32::SetEnvironmentVariableW(w "TEMP", w "$TempRun") i.r0'
  System::Call 'Kernel32::SetEnvironmentVariableW(w "TMP", w "$TempRun") i.r0'
  Call CloseExtractionSplash
  ClearErrors
  ExecWait '"$TempRun\app\zhezhi-workbench-tauri.exe"' $ChildExit
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "工作台未能启动。请检查解压目录权限与系统 WebView2 运行时。"
    StrCpy $ChildExit 3
  ${EndIf}
  Call CleanupOwnTemp
  SetErrorLevel $ChildExit
  Goto finished
  extract_failed:
  Call CloseExtractionSplash
  MessageBox MB_OK|MB_ICONSTOP "程序资源未完整解压。请重新下载并核对 SHA256，或检查磁盘空间后重试。"
  Call CleanupOwnTemp
  SetErrorLevel 4
  finished:
SectionEnd
