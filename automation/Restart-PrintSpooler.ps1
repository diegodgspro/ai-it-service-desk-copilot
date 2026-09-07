# Default is a dry run. Execute only in an authorized lab after reviewing impact.
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param([switch]$Execute)
$ErrorActionPreference = 'Stop'
if (-not $Execute) {
    Write-Output 'DRY RUN: Restart local Print Spooler; pending printing may be interrupted. No change was made. Use -Execute only with authorization.'
    return
}
if ($PSCmdlet.ShouldProcess('Local Windows endpoint', 'Restart local Print Spooler; pending printing may be interrupted')) {
    Restart-Service -Name Spooler -ErrorAction Stop
}
