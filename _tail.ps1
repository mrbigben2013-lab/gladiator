$p = 'C:\Users\Solovey\Documents\gladiator-arena\game.js'
$lines = [System.IO.File]::ReadAllLines($p)
$n = $lines.Count
Write-Output ("total=" + $n)
$from = [Math]::Max(0, $n - 55)
for ($i = $from; $i -lt $n; $i++) {
  Write-Output (($i + 1).ToString() + ': ' + $lines[$i])
}
