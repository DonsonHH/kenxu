# Run this yourself to create the administrator password without sending it in chat.
param([string]$AdminName='donson',[switch]$Check)
$ErrorActionPreference='Stop'
if($AdminName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,39}$'){throw 'Invalid administrator name'}
$sshExecutable=(Get-Command ssh.exe -ErrorAction Stop).Source
$sshConfig=Join-Path $PSScriptRoot 'admin-ssh.config'
if(!(Test-Path -LiteralPath $sshConfig)){throw 'Missing admin-ssh.config beside this script'}
if(!(Test-Path -LiteralPath 'C:\Program Files\Tailscale\tailscale.exe')){throw 'Tailscale was not found at its expected installation path'}
if($Check){
    # Parse the exact config without connecting, forwarding ports or creating users.
    & $sshExecutable -G -F $sshConfig donson-access
    if($LASTEXITCODE -ne 0){throw 'SSH configuration validation failed'}
    return
}
Write-Host 'This opens a private SSH session and forwards the admin page to http://127.0.0.1:4451.'
Write-Host 'First enter the Jetson SSH password, then set your new portal administrator password.'
Write-Host 'Keep the SSH window open while using the admin page. No password is saved in this script.'
$remoteCommand="export DATA_DIR=/home/jetson/donson-access/private-data; cd /home/jetson/donson-access/current && node src/admin.mjs create-admin $AdminName; exec bash"
& $sshExecutable -t -F $sshConfig donson-access $remoteCommand
if($LASTEXITCODE -ne 0){Write-Warning 'SSH exited with an error. If port 4451 is already in use, close the previous admin SSH session and retry.'}
