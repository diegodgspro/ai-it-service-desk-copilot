# Run manually on an authorized Windows lab endpoint. Read-only; inspect output before sharing.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Get-NetAdapter | Select-Object Name, Status, LinkSpeed
Get-DnsClientServerAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, ServerAddresses
Get-Service -Name Spooler | Select-Object Name, Status
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
    Select-Object DeviceID, @{Name='FreeGB';Expression={[math]::Round($_.FreeSpace / 1GB, 2)}}, @{Name='SizeGB';Expression={[math]::Round($_.Size / 1GB, 2)}}
