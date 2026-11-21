$ErrorActionPreference = 'Stop'
$p = 'C:\Users\Solovey\Documents\gladiator-arena\renderer.js'
$lines = Get-Content -LiteralPath $p -Encoding UTF8

$fnIdx = -1
$ellipseIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($fnIdx -lt 0 -and $lines[$i].Contains('function drawBodyCosmetics')) { $fnIdx = $i }
  if ($fnIdx -ge 0 -and $ellipseIdx -lt 0 -and $lines[$i].Contains('ctx.ellipse(-bodyLen * 0.04, bodyY')) { $ellipseIdx = $i }
}
if ($fnIdx -lt 0 -or $ellipseIdx -lt 0) { throw "markers fn=$fnIdx el=$ellipseIdx" }

$start = $fnIdx - 2
# Конец функции: последняя строка '}' перед маркером
$fnEnd = -1
for ($i = $ellipseIdx; $i -gt $fnIdx; $i--) {
  if ($lines[$i].Trim() -eq '}') { $fnEnd = $i; break }
}
if ($fnEnd -lt 0) { throw 'fn end not found' }

$fnBody = $lines[$fnIdx..$fnEnd]

# Удаляем: комментарий-заголовок, описание, тело функции и пустую строку после неё
$delFrom = $start
$delTo = $fnEnd
$out = @()
if ($delFrom -gt 0) { $out += $lines[0..($delFrom - 1)] }
$out += $lines[($delTo + 1)..($lines.Count - 1)]

$out += ''
$out += '// ---------- Body cosmetics: tattoos and war paint ----------'
$out += $fnBody

Set-Content -LiteralPath $p -Value $out -Encoding UTF8
Write-Output "fn=$fnIdx fnEnd=$fnEnd deleted=$($delTo-$delFrom+1) appended=$($fnBody.Count) total=$($out.Count)"
Write-Output ('BEFORE: ' + $lines[$delFrom])
Write-Output ('AFTER: ' + $lines[$delTo + 1])
