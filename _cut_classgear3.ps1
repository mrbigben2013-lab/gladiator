$path = 'data.js'
$lines = Get-Content -Path $path -Encoding UTF8
$start = -1
$end = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -like 'const CLASS_GEAR = {*') { $start = $i; break }
}
if ($start -ge 0) {
  for ($j = $start; $j -lt $lines.Count; $j++) {
    if ($lines[$j] -eq '};') { $end = $j; break }
  }
}
Write-Output "start=$start end=$end"
if ($start -ge 0 -and $end -gt $start) {
  $before = $lines[0..($start - 1)]
  $after = $lines[($end + 1)..($lines.Count - 1)]
  $out = @()
  $out += $before
  $out += '// Class gear tables removed together with the class-gear mechanic.'
  $out += $after
  Set-Content -Path $path -Value $out -Encoding UTF8
  Write-Output 'cut ok'
} else {
  Write-Output 'bounds not found'
}
