Unicode true
Name "Novel Studio"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Novel Studio"
RequestExecutionLevel user
SetCompressor zlib
ShowInstDetails show
ShowUninstDetails show

!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "MUI2.nsh"
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Novel Studio.exe"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "Novel Studio"
  SetOutPath "$INSTDIR"
  File /r "${SOURCE}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/NOSHORTCUT" $R1
  ${If} ${Errors}
    CreateShortcut "$SMPROGRAMS\Novel Studio.lnk" "$INSTDIR\Novel Studio.exe" "" "$INSTDIR\Novel Studio.exe" 0
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Novel Studio" "DisplayName" "Novel Studio"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Novel Studio" "DisplayIcon" "$INSTDIR\Novel Studio.exe,0"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Novel Studio" "DisplayVersion" "${VERSION}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Novel Studio" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Novel Studio" "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Novel Studio" "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Novel Studio" "NoRepair" 1
  ${EndIf}
SectionEnd

Section "Uninstall"
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Novel Studio" "InstallLocation"
  ${If} $R0 == $INSTDIR
    Delete "$SMPROGRAMS\Novel Studio.lnk"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Novel Studio"
  ${EndIf}
  !include "${UNINSTALL_FILES}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
