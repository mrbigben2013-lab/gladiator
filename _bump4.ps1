$p = 'C:\Users\Solovey\Documents\gladiator-arena\index.html'
$c = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
$c = $c -replace '\?v=38', '?v=39'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($p, $c, $utf8NoBom)
Write-Output 'v39'
