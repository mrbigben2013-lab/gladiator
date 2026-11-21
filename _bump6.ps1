$p = 'C:\Users\Solovey\Documents\gladiator-arena\index.html'
$enc = New-Object System.Text.UTF8Encoding($false)
$t = [System.IO.File]::ReadAllText($p, $enc)
$t = $t.Replace('?v=40', '?v=41')
[System.IO.File]::WriteAllText($p, $t, $enc)
Write-Output 'bumped to v=41'
