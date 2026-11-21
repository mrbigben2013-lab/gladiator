$ErrorActionPreference = 'Stop'
$root = 'C:\Users\Solovey\Documents\gladiator-arena'
$game = Join-Path $root 'game.js'
$block = Join-Path $root '_train_block.js'

$lines = Get-Content -LiteralPath $game -Encoding UTF8
$start = -1
$cutEnd = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($start -lt 0 -and $lines[$i].Contains('let trainingShots')) { $start = $i - 3 }
  if ($start -ge 0 -and $i -gt $start -and $lines[$i].Contains('function renderArenaScreen()')) { $cutEnd = $i - 3; break }
}
if ($start -lt 0 -or $cutEnd -lt 0) { throw "markers not found start=$start cutEnd=$cutEnd" }

$new = Get-Content -LiteralPath $block -Encoding UTF8
$out = @()
if ($start -gt 0) { $out += $lines[0..($start - 1)] }
$out += $new
$out += $lines[($cutEnd + 1)..($lines.Count - 1)]
Set-Content -LiteralPath $game -Value $out -Encoding UTF8
Write-Output "start=$start cutEnd=$cutEnd new=$($new.Count) total=$($out.Count)"
Write-Output ("FIRST: " + $lines[$start])
Write-Output ("LAST: " + $lines[$cutEnd])
Write-Output ("KEEP: " + $lines[$cutEnd + 1])
