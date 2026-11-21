$root = $PSScriptRoot
$port = 8765
$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $existing) {
  Start-Process powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'serve.ps1')) -WindowStyle Hidden
  Start-Sleep -Seconds 3
}
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/index.html" -UseBasicParsing -TimeoutSec 5
  Write-Output ("UP " + $r.StatusCode)
} catch {
  Write-Output ("DOWN " + $_.Exception.Message)
}
