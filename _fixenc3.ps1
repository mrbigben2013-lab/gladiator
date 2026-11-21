$p = 'C:\Users\Solovey\Documents\gladiator-arena\index.html'
$bytes = [System.IO.File]::ReadAllBytes($p)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$i = $text.IndexOf('<!DOCTYPE')
if ($i -gt 0) { $text = $text.Substring($i) }
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($p, $text, $utf8NoBom)
Write-Output ('starts: ' + $text.Substring(0, 30))
Write-Output ('titleOk: ' + $text.Contains([char]0x0411 + [char]0x0440 + [char]0x0430 + [char]0x0442 + [char]0x044C + [char]0x044F))
Write-Output ('trainGameOk: ' + $text.Contains('train-game'))
