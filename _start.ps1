Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'serve.ps1') -WindowStyle Hidden
Start-Sleep -Seconds 2
try {
  $r = Invoke-WebRequest -Uri 'http://localhost:8765/index.html' -UseBasicParsing -TimeoutSec 5
  Write-Output ('status=' + $r.StatusCode)
} catch {
  Write-Output ('ERR: ' + $_.Exception.Message)
}
