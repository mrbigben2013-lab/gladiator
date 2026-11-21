$files = @('data.js','combat.js','game.js','save.js','events.js','renderer.js','items.js','audio.js')
foreach ($f in $files) {
  if (Test-Path $f) {
    $c = Get-Content -Raw -Encoding UTF8 $f
    $open = 0; $close = 0; $par = 0; $parC = 0
    foreach ($ch in $c.ToCharArray()) {
      if ($ch -eq '{') { $open++ }
      elseif ($ch -eq '}') { $close++ }
      elseif ($ch -eq '(') { $par++ }
      elseif ($ch -eq ')') { $parC++ }
    }
    Write-Output ("{0,-14} braces={1}  parens={2}  lines={3}" -f $f, ($open - $close), ($par - $parC), (($c -split "`n").Count))
  }
}
