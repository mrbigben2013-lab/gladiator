$p = 'C:\Users\Solovey\Documents\gladiator-arena\index.html'
$bytes = [System.IO.File]::ReadAllBytes($p)
# Убираем ведущий мусор до '<!DOCTYPE'
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$i = $text.IndexOf('<!DOCTYPE')
if ($i -gt 0) { $text = $text.Substring($i) }
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($p, $text, $utf8NoBom)
$check = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
Write-Output $check.Substring(0, 60)
Write-Output ('has-title: ' + $check.Contains('Братья Арены'))
Write-Output ('has-train-game: ' + $check.Contains('train-game'))
