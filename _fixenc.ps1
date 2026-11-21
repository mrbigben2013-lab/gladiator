$p = 'C:\Users\Solovey\Documents\gladiator-arena\index.html'
$bytes = [System.IO.File]::ReadAllBytes($p)
# Текущее содержимое: UTF-8-текст, который когда-то был прочитан как CP1251.
$wrong = [System.Text.Encoding]::UTF8.GetString($bytes)
$cp1251 = [System.Text.Encoding]::GetEncoding(1251)
$fixed = [System.Text.Encoding]::UTF8.GetString($cp1251.GetBytes($wrong))
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($p, $fixed, $utf8NoBom)
Write-Output 'done'
