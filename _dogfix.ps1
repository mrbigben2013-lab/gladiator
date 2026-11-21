$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$path = Join-Path $dir 'renderer.js'
$newPath = Join-Path $dir '_newdog.txt'

$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$new = [System.IO.File]::ReadAllText($newPath, [System.Text.Encoding]::UTF8)

$startMarker = '// ==================== ' + [char]0x0411 + [char]0x041e + [char]0x0415 + [char]0x0412 + [char]0x042b + [char]0x0415 + ' ' + [char]0x041f + [char]0x0421 + [char]0x042b + ' ===================='
$endMarker = '// ==================== ' + [char]0x0418 + [char]0x041a + [char]0x041e + [char]0x041d + [char]0x041a + [char]0x0418 + ' ' + [char]0x041f + [char]0x0420 + [char]0x0415 + [char]0x0414 + [char]0x041c + [char]0x0415 + [char]0x0422 + [char]0x041e + [char]0x0412 + ' ===================='

$i = $text.IndexOf($startMarker)
$j = $text.IndexOf($endMarker)
if ($i -lt 0) { throw 'start marker not found' }
if ($j -lt 0) { throw 'end marker not found' }
if ($j -le $i) { throw 'markers out of order' }
if ($text.IndexOf($startMarker, $i + 1) -ge 0) { throw 'start marker is not unique' }

$nl = [string][char]13 + [string][char]10
$result = $text.Substring(0, $i) + $new + $nl + $nl + $text.Substring($j)
$enc = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($path, $result, $enc)
Write-Output ('OK: replaced ' + ($j - $i) + ' chars with ' + $new.Length + ' chars')
