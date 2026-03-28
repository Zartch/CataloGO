param(
  [Parameter(Mandatory = $true)]
  [string]$CertDir,

  [Parameter(Mandatory = $true)]
  [string]$PasswordFile,

  [Parameter(Mandatory = $true)]
  [string]$ServerHostsCsv
)

$ErrorActionPreference = 'Stop'
$ServerHosts = $ServerHostsCsv.Split(',') | Where-Object { $_ } | Select-Object -Unique

$serverSubject = 'CN=CataloGo Intranet Server'
$certificatePath = Join-Path $CertDir 'catalogo-intranet-server.cer'
$serverPfxPath = Join-Path $CertDir 'catalogo-intranet-server.pfx'

function New-PasswordFile {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [Convert]::ToBase64String($bytes) | Set-Content -LiteralPath $PasswordFile -NoNewline
}

function Get-PfxPassword {
  if (-not (Test-Path -LiteralPath $PasswordFile)) {
    New-PasswordFile
  }

  $passwordText = Get-Content -LiteralPath $PasswordFile -Raw
  ConvertTo-SecureString -String $passwordText -AsPlainText -Force
}

function Get-ActiveServerCertificate {
  $now = Get-Date

  Get-ChildItem Cert:\CurrentUser\My |
    Where-Object {
      $_.Subject -eq $serverSubject -and
      $_.NotBefore -le $now -and
      $_.NotAfter -gt $now
    } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1
}

function Test-CertificateCoverage {
  param(
    [Parameter(Mandatory = $true)]
    $Certificate,

    [Parameter(Mandatory = $true)]
    [string[]]$ExpectedHosts
  )

  $certificateHosts = @(
    $Certificate.DnsNameList |
      ForEach-Object { $_.Unicode.ToLowerInvariant() }
  )

  foreach ($expectedHost in $ExpectedHosts) {
    if ($certificateHosts -notcontains $expectedHost.ToLowerInvariant()) {
      return $false
    }
  }

  return $true
}

function Remove-ServerCertificates {
  Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $serverSubject } |
    ForEach-Object { Remove-Item -LiteralPath $_.PSPath -DeleteKey }

  Get-ChildItem Cert:\CurrentUser\Root |
    Where-Object { $_.Subject -eq $serverSubject } |
    ForEach-Object { Remove-Item -LiteralPath $_.PSPath }
}

function Ensure-CertificateArtifacts {
  param(
    [Parameter(Mandatory = $true)]
    $Certificate
  )

  Export-Certificate -Cert $Certificate -FilePath $certificatePath -Force | Out-Null

  $trustedCertificate = Get-ChildItem Cert:\CurrentUser\Root |
    Where-Object { $_.Thumbprint -eq $Certificate.Thumbprint } |
    Select-Object -First 1

  if (-not $trustedCertificate) {
    Import-Certificate -FilePath $certificatePath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
  }

  $password = Get-PfxPassword
  Export-PfxCertificate -Cert $Certificate -FilePath $serverPfxPath -Password $password -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $CertDir)) {
  New-Item -ItemType Directory -Path $CertDir | Out-Null
}

$server = Get-ActiveServerCertificate
$regenerated = $false

if (-not $server) {
  $regenerated = $true
}
elseif (-not (Test-CertificateCoverage -Certificate $server -ExpectedHosts $ServerHosts)) {
  $regenerated = $true
}

if ($regenerated) {
  Remove-ServerCertificates

  $server = New-SelfSignedCertificate `
    -Type SSLServerAuthentication `
    -Subject $serverSubject `
    -DnsName $ServerHosts `
    -FriendlyName 'CataloGo Intranet Server' `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(3) `
    -CertStoreLocation 'Cert:\CurrentUser\My'
}

Ensure-CertificateArtifacts -Certificate $server

[pscustomobject]@{
  certificatePath = $certificatePath
  serverPfxPath = $serverPfxPath
  thumbprint = $server.Thumbprint
  regenerated = $regenerated
} | ConvertTo-Json -Compress
