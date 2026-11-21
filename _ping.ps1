try {
  $r = Invoke-WebRequest -UseBasicParsing 'http://localhost:8765/index.html' -TimeoutSec 4
  Write-Output ('status=' + $r.StatusCode)
} catch {
  Write-Output 'down'
}
