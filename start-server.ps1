Start-Process -FilePath "powershell.exe" -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','C:\Users\Solovey\Documents\gladiator-arena\serve.ps1') -WindowStyle Hidden
Start-Sleep -Seconds 2
try {
  $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8765/index.html' -TimeoutSec 5
  Write-Output ("STATUS=" + $r.StatusCode)
} catch {
  Write-Output ("FAIL=" + $_.Exception.Message)
}
