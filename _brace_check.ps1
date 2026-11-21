$files = @('style.css','barracks.css')
foreach ($f in $files) {
  $p = Join-Path $PSScriptRoot $f
  $t = Get-Content $p -Raw
  $o = ([regex]::Matches($t, '\{')).Count
  $c = ([regex]::Matches($t, '\}')).Count
  Write-Output ($f + ' open=' + $o + ' close=' + $c)
}
