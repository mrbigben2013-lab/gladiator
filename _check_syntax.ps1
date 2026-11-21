$files = @('data.js','game.js','combat.js','renderer.js','events.js','save.js','items.js','audio.js')
foreach ($f in $files) {
  $out = node --check $f 2>&1
  if ($LASTEXITCODE -eq 0) { Write-Output "$f OK" } else { Write-Output "$f FAIL"; Write-Output $out }
}
