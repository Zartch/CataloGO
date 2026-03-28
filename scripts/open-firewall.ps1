param(
  [ValidateSet('Open', 'Close')]
  [string]$Action = 'Open',
  [string]$PortsCsv = '4173',
  [string]$RuleName = 'CataloGo Intranet HTTPS'
)

$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', ('"' + $PSCommandPath + '"'),
    '-Action', $Action,
    '-PortsCsv', $PortsCsv,
    '-RuleName', ('"' + $RuleName + '"')
  ) -join ' '

  Start-Process -FilePath 'powershell' -Verb RunAs -ArgumentList $arguments | Out-Null
  Write-Output "Solicitando elevacion para gestionar la regla '$RuleName' en Windows Firewall."
  exit 0
}

Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue |
  Remove-NetFirewallRule

if ($Action -eq 'Close') {
  Write-Output "Regla de firewall eliminada: '$RuleName'."
  exit 0
}

$nodeCommand = Get-Command node -ErrorAction Stop
$nodePath = $nodeCommand.Source
$ports = $PortsCsv.Split(',') | Where-Object { $_ } | ForEach-Object { $_.Trim() } | Select-Object -Unique

New-NetFirewallRule `
  -DisplayName $RuleName `
  -Direction Inbound `
  -Action Allow `
  -Enabled True `
  -Profile Any `
  -Protocol TCP `
  -LocalPort $ports `
  -Program $nodePath `
  -RemoteAddress LocalSubnet | Out-Null

Write-Output "Regla de firewall creada: '$RuleName' para TCP/$($ports -join ','), node.exe y LocalSubnet."
