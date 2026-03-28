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

$rootSubject = 'CN=M1L3 Labs CataloGo Root CA, O=M1L3 Labs'
$serverSubject = 'CN=M1L3 Labs CataloGo Server, O=M1L3 Labs'
$rootFriendlyName = 'M1L3 Labs CataloGo Root CA'
$serverFriendlyName = 'M1L3 Labs CataloGo Server v2'
$legacyRootSubjects = @(
  'CN=CataloGo Intranet Root CA'
)
$legacyServerSubjects = @(
  'CN=CataloGo Intranet Server'
)
$legacyRootFriendlyNames = @(
  'CataloGo Intranet Root CA'
)
$legacyServerFriendlyNames = @(
  'CataloGo Intranet Server',
  'M1L3 Labs CataloGo Server'
)
$rootCertificatePath = Join-Path $CertDir 'catalogo-intranet-root-ca.cer'
$serverPfxPath = Join-Path $CertDir 'catalogo-intranet-server.pfx'
$legacyRootCertificatePath = Join-Path $CertDir 'catalogo-root-ca.cer'
$legacyServerCertificatePath = Join-Path $CertDir 'catalogo-intranet-server.cer'

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

function Test-ManagedRootCertificate {
  param(
    [Parameter(Mandatory = $true)]
    $Certificate
  )

  return (
    $Certificate.Subject -eq $rootSubject -or
    $Certificate.Subject -in $legacyRootSubjects -or
    $Certificate.FriendlyName -eq $rootFriendlyName -or
    $Certificate.FriendlyName -in $legacyRootFriendlyNames
  )
}

function Test-ManagedServerCertificate {
  param(
    [Parameter(Mandatory = $true)]
    $Certificate
  )

  return (
    $Certificate.Subject -eq $serverSubject -or
    $Certificate.Subject -in $legacyServerSubjects -or
    $Certificate.FriendlyName -eq $serverFriendlyName -or
    $Certificate.FriendlyName -in $legacyServerFriendlyNames
  )
}

function Test-IsIpAddress {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $address = $null
  return [System.Net.IPAddress]::TryParse($Value, [ref]$address)
}

function Get-ServerSanExtension {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Hosts
  )

  $entries = foreach ($entry in $Hosts) {
    if (Test-IsIpAddress -Value $entry) {
      "IPAddress=$entry"
    }
    else {
      "DNS=$entry"
    }
  }

  "2.5.29.17={text}$($entries -join '&')"
}

function Get-ActiveRootCertificate {
  $now = Get-Date

  Get-ChildItem Cert:\CurrentUser\My |
    Where-Object {
      $_.Subject -eq $rootSubject -and
      $_.FriendlyName -eq $rootFriendlyName -and
      $_.Issuer -eq $rootSubject -and
      $_.NotBefore -le $now -and
      $_.NotAfter -gt $now
    } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1
}

function Test-SignedByRoot {
  param(
    [Parameter(Mandatory = $true)]
    $Certificate,

    [Parameter(Mandatory = $true)]
    $RootCertificate
  )

  $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
  $chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
  $chain.ChainPolicy.VerificationFlags = [System.Security.Cryptography.X509Certificates.X509VerificationFlags]::AllowUnknownCertificateAuthority
  [void]$chain.ChainPolicy.ExtraStore.Add($RootCertificate)
  [void]$chain.Build($Certificate)

  if ($chain.ChainElements.Count -lt 2) {
    return $false
  }

  $chainRoot = $chain.ChainElements[$chain.ChainElements.Count - 1].Certificate
  return $chainRoot.Thumbprint -eq $RootCertificate.Thumbprint
}

function Get-ActiveServerCertificate {
  param(
    [Parameter(Mandatory = $true)]
    $RootCertificate
  )

  $now = Get-Date

  Get-ChildItem Cert:\CurrentUser\My |
    Where-Object {
      $_.Subject -eq $serverSubject -and
      $_.FriendlyName -eq $serverFriendlyName -and
      $_.NotBefore -le $now -and
      $_.NotAfter -gt $now -and
      (Test-SignedByRoot -Certificate $_ -RootCertificate $RootCertificate)
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

function Remove-ManagedCertificates {
  Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { (Test-ManagedRootCertificate -Certificate $_) -or (Test-ManagedServerCertificate -Certificate $_) } |
    ForEach-Object { Remove-Item -LiteralPath $_.PSPath -DeleteKey }

  Get-ChildItem Cert:\CurrentUser\Root |
    Where-Object { Test-ManagedRootCertificate -Certificate $_ } |
    ForEach-Object { Remove-Item -LiteralPath $_.PSPath }
}

function Remove-ServerCertificates {
  Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { Test-ManagedServerCertificate -Certificate $_ } |
    ForEach-Object { Remove-Item -LiteralPath $_.PSPath -DeleteKey }
}

function Ensure-RootArtifacts {
  param(
    [Parameter(Mandatory = $true)]
    $RootCertificate
  )

  Export-Certificate -Cert $RootCertificate -FilePath $rootCertificatePath -Force | Out-Null

  $trustedRoot = Get-ChildItem Cert:\CurrentUser\Root |
    Where-Object { $_.Thumbprint -eq $RootCertificate.Thumbprint } |
    Select-Object -First 1

  if (-not $trustedRoot) {
    Import-Certificate -FilePath $rootCertificatePath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
  }

  if (Test-Path -LiteralPath $legacyServerCertificatePath) {
    Remove-Item -LiteralPath $legacyServerCertificatePath -Force
  }

  if (Test-Path -LiteralPath $legacyRootCertificatePath) {
    Remove-Item -LiteralPath $legacyRootCertificatePath -Force
  }
}

function Ensure-ServerArtifacts {
  param(
    [Parameter(Mandatory = $true)]
    $ServerCertificate
  )

  $password = Get-PfxPassword
  Export-PfxCertificate -Cert $ServerCertificate -FilePath $serverPfxPath -Password $password -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $CertDir)) {
  New-Item -ItemType Directory -Path $CertDir | Out-Null
}

$root = Get-ActiveRootCertificate
$regeneratedRoot = $false

if (-not $root) {
  Remove-ManagedCertificates

  $root = New-SelfSignedCertificate `
    -Type Custom `
    -Subject $rootSubject `
    -FriendlyName $rootFriendlyName `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -KeyUsageProperty Sign `
    -KeyUsage CertSign, CRLSign, DigitalSignature `
    -TextExtension @('2.5.29.19={critical}{text}CA=true') `
    -NotAfter (Get-Date).AddYears(10) `
    -CertStoreLocation 'Cert:\CurrentUser\My'

  $regeneratedRoot = $true
}

Ensure-RootArtifacts -RootCertificate $root

$server = Get-ActiveServerCertificate -RootCertificate $root
$regeneratedServer = $false

if (-not $server) {
  $regeneratedServer = $true
}
elseif (-not (Test-CertificateCoverage -Certificate $server -ExpectedHosts $ServerHosts)) {
  $regeneratedServer = $true
}

if ($regeneratedServer) {
  Remove-ServerCertificates

  $server = New-SelfSignedCertificate `
    -Type Custom `
    -Subject $serverSubject `
    -FriendlyName $serverFriendlyName `
    -Signer $root `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -KeyUsage DigitalSignature, KeyEncipherment `
    -TextExtension @(
      '2.5.29.19={critical}{text}CA=false',
      '2.5.29.37={text}1.3.6.1.5.5.7.3.1',
      (Get-ServerSanExtension -Hosts $ServerHosts)
    ) `
    -NotAfter (Get-Date).AddYears(3) `
    -CertStoreLocation 'Cert:\CurrentUser\My'
}

Ensure-ServerArtifacts -ServerCertificate $server

[pscustomobject]@{
  rootCertificatePath = $rootCertificatePath
  serverPfxPath = $serverPfxPath
  rootThumbprint = $root.Thumbprint
  serverThumbprint = $server.Thumbprint
  regeneratedRoot = $regeneratedRoot
  regeneratedServer = $regeneratedServer
} | ConvertTo-Json -Compress
