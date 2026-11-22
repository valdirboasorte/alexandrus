$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$bin = Join-Path $root 'bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null
$out = Join-Path $bin 'AlexandrusPonte.exe'
$srcs = Get-ChildItem (Join-Path $root 'src') -Filter *.cs | ForEach-Object { $_.FullName }
& $csc /target:exe /platform:x64 /optimize+ /nologo /unsafe /codepage:65001 "/out:$out" /r:System.dll /r:System.Core.dll /r:System.Web.Extensions.dll $srcs
if ($LASTEXITCODE -ne 0) { Write-Host 'Falha na compilacao'; exit 1 }
Write-Host "OK: $out"

# Publica o executavel para a pagina /ponte oferecer o download.
$downloads = Join-Path $root '..\..\apps\web\public\downloads'
New-Item -ItemType Directory -Force -Path $downloads | Out-Null
Copy-Item $out (Join-Path $downloads 'AlexandrusPonte.exe') -Force
Write-Host "Copiado para apps/web/public/downloads"
exit 0
