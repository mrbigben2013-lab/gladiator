$path = 'data.js'
$lines = Get-Content -Path $path -Encoding UTF8
$start = -1
$end = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^const CLASS_ITEM_TIERS') { $start = $i; break }
}
for ($j = $start; $j -lt $lines.Count; $j++) {
  if ($lines[$j] -match '^function classItems\(\)') { $end = $j + 1; break }
}
Write-Output "start=$start end=$end"
if ($start -ge 0 -and $end -gt $start) {
  $replacement = @(
    '// Class-only gear removed: all equipment is universal.',
    'function classItems() { return []; }'
  )
  $before = $lines[0..($start - 1)]
  $after = $lines[$end..($lines.Count - 1)]
  $out = @()
  $out += $before
  $out += $replacement
  $out += $after
  Set-Content -Path $path -Value $out -Encoding UTF8
  Write-Output 'cut ok'
} else {
  Write-Output 'bounds not found'
}
