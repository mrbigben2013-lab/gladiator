$port = 8765
try {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
} catch {}
Start-Sleep -Milliseconds 500

Start-Process -FilePath "powershell.exe" -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','C:\Users\Solovey\Documents\gladiator-arena\serve.ps1') -WindowStyle Hidden
Start-Sleep -Seconds 2

foreach ($h in @('localhost','127.0.0.1')) {
  $u = "http://" + $h + ":" + $port + "/index.html"
  try {
    $r = Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 5
    Write-Output ("OK " + $h + " status=" + $r.StatusCode + " len=" + $r.RawContentLength)
  } catch {
    Write-Output ("FAIL " + $h + " : " + $_.Exception.Message)
  }
}
