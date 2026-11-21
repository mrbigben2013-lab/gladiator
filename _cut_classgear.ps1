$path = 'data.js'
$lines = Get-Content -Path $path -Encoding UTF8
$start = -1
$end = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($start -lt 0 -and $lines[$i] -match 'CLASS_GEAR_EDGE') { $start = $i; break }
}
for ($j = $start; $j -lt $lines.Count; $j++) {
  if ($lines[$j] -match '^function classItems\(clsId\)') { $end = $j + 2; break }
}
Write-Output "start=$start end=$end"
if ($start -ge 0 -and $end -gt $start) {
  $replacement = @(
    '// ==================== CLASS GEAR (DISABLED) ====================',
    '// Class-only gear removed: all equipment is universal.',
    '// Class affects only stats and unique abilities.',
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
