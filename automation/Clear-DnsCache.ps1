# Default is a dry run. Execute only in an authorized lab after reviewing impact.
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param([switch]$Execute)
$ErrorActionPreference = 'Stop'
if (-not $Execute) {
    Write-Output 'DRY RUN: Clear local DNS client cache. No change was made. Use -Execute only with authorization.'
    return
}
if ($PSCmdlet.ShouldProcess('Local Windows endpoint', 'Clear local DNS client cache')) {
    Clear-DnsClientCache
}
