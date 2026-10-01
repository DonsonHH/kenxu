$ErrorActionPreference='Stop'
$Launcher=Join-Path $PSScriptRoot 'launch-admin.mjs'
if(!(Test-Path -LiteralPath $Launcher)){throw 'Missing private administration launcher'}
$DesktopDirectory=[Environment]::GetFolderPath('DesktopDirectory')
$ShortcutPath=Join-Path $DesktopDirectory 'Kenxu 管理中心.lnk'
$NodeExecutable=(Get-Command node.exe -ErrorAction Stop).Source
$ShortcutShell=New-Object -ComObject WScript.Shell
$Shortcut=$ShortcutShell.CreateShortcut($ShortcutPath)
if(Test-Path -LiteralPath $ShortcutPath){if($Shortcut.Arguments -notlike ('*'+$Launcher+'*')){throw 'An unrelated desktop shortcut already uses this name; it was not overwritten'}}
$Shortcut.TargetPath=$NodeExecutable
$Shortcut.Arguments='"'+$Launcher+'"'
$Shortcut.WorkingDirectory=Split-Path $PSScriptRoot -Parent
$Shortcut.Description='Open Kenxu private administration through a restricted SSH forwarding key'
$Shortcut.IconLocation=(Join-Path $env:SystemRoot 'System32\shell32.dll')+',47'
$Shortcut.WindowStyle=7
$Shortcut.Save()
[PSCustomObject]@{Created=$true;Path=$ShortcutPath;Target=$Shortcut.TargetPath;PasswordSaved=$false} | ConvertTo-Json -Compress
