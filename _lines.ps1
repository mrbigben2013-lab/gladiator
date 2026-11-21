$ErrorActionPreference = 'Stop'
$path = Join-Path (Get-Location) 'renderer.js'
$lines = [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)
Write-Output ("total: " + $lines.Count)
for ($i = 2205; $i -le 2228; $i++) {
  Write-Output ("{0}: {1}" -f $i, $lines[$i - 1])
}
