$ErrorActionPreference = 'Stop'
$path = 'game.js'
$lines = [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)
$newBlock = [System.IO.File]::ReadAllText('_scene.txt', [System.Text.Encoding]::UTF8)

$startIdx = -1
$endIdx = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($startIdx -lt 0 -and $lines[$i].StartsWith('function drawCityScene(c, W, H)')) { $startIdx = $i }
    if ($startIdx -ge 0 -and $lines[$i].Contains('isoCorners(x, y, ax, ay) {')) { $endIdx = $i - 3; break }
}
if ($startIdx -lt 0 -or $endIdx -lt 0) { Write-Output 'MARKERS NOT FOUND'; exit 1 }
Write-Output ("replacing lines " + ($startIdx + 1) + ".." + $endIdx)
Write-Output ("kept from: " + $lines[$endIdx])

$before = if ($startIdx -gt 0) { $lines[0..($startIdx - 1)] } else { @() }
$after = $lines[$endIdx..($lines.Length - 1)]
$out = @()
$out += $before
$out += $newBlock.TrimEnd("`r", "`n")
$out += $after
[System.IO.File]::WriteAllLines($path, $out, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'OK'
