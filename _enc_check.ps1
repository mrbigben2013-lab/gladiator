$root = 'C:\Users\Solovey\Documents\gladiator-arena\'
$files = @('game.js','data.js','style.css','audio.js','save.js','combat.js','index.html','barracks.css','renderer.js','events.js')
foreach ($f in $files) {
  $path = $root + $f
  if (-not (Test-Path $path)) { continue }
  $t = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  $bad = ([regex]::Matches($t, [string][char]0xFFFD)).Count
  $mojibake = ([regex]::Matches($t, ([string][char]0x0420 + [string][char]0x045F))).Count
  $hasBom = $false
  $b = [System.IO.File]::ReadAllBytes($path)
  if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { $hasBom = $true }
  Write-Output ("{0,-14} fffd={1,-5} mojibake={2,-5} bom={3}" -f $f, $bad, $mojibake, $hasBom)
}
