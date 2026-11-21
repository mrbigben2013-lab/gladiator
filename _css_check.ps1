$files = @('style.css','barracks.css')
foreach ($f in $files) {
  $p = Join-Path $PSScriptRoot $f
  $lines = Get-Content $p
  $inComment = $false
  $ln = 0
  $issues = @()
  foreach ($line in $lines) {
    $ln++
    $i = 0
    while ($i -lt $line.Length) {
      if (-not $inComment) {
        $open = $line.IndexOf('/*', $i)
        if ($open -lt 0) { break }
        $close = $line.IndexOf('*/', $open + 2)
        if ($close -lt 0) { $inComment = $true; $i = $line.Length }
        else { $i = $close + 2 }
      } else {
        $close = $line.IndexOf('*/', $i)
        if ($close -lt 0) { $i = $line.Length }
        else { $inComment = $false; $i = $close + 2 }
      }
    }
  }
  if ($inComment) { $issues += 'unterminated comment' }
  $t = Get-Content $p -Raw
  $q = ([regex]::Matches($t, '"')).Count
  $sq = ([regex]::Matches($t, "'")).Count
  Write-Output ($f + ' unterminatedComment=' + $inComment + ' dquotes=' + $q + ' squotes=' + $sq)
}
