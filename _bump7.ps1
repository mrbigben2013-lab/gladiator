$p = 'C:\Users\Solovey\Documents\gladiator-arena\index.html'
$enc = New-Object System.Text.UTF8Encoding($false)
$t = [System.IO.File]::ReadAllText($p, $enc)
$t = $t.Replace('?v=41', '?v=42')
[System.IO.File]::WriteAllText($p, $t, $enc)
Write-Output 'bumped to v=42'
