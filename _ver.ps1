param([int]$v = 25)
$p = Join-Path $PSScriptRoot 'index.html'
$t = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
$t = [regex]::Replace($t, 'v=\d+', "v=$v")
[System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "version -> $v"
