$ErrorActionPreference = 'Stop'
$root = 'C:\Users\Solovey\Documents\gladiator-arena'
$game = Join-Path $root 'game.js'
$block = Join-Path $root '_work_block.js'

$lines = Get-Content -LiteralPath $game -Encoding UTF8
$idx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i].Contains('function renderArenaScreen()')) { $idx = $i - 3; break }
}
if ($idx -lt 0) { throw 'marker not found' }

$new = Get-Content -LiteralPath $block -Encoding UTF8
$out = @()
$out += $lines[0..($idx - 1)]
$out += $new
$out += $lines[$idx..($lines.Count - 1)]
Set-Content -LiteralPath $game -Value $out -Encoding UTF8
Write-Output "inserted at $idx; new=$($new.Count) total=$($out.Count)"
