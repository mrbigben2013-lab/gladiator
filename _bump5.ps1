$p = 'C:\Users\Solovey\Documents\gladiator-arena\index.html'
$enc = New-Object System.Text.UTF8Encoding($false)
$t = [System.IO.File]::ReadAllText($p, $enc)
$t = $t.Replace('?v=39', '?v=40')
[System.IO.File]::WriteAllText($p, $t, $enc)
Write-Output 'bumped to v=40'
