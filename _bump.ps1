$p = 'C:\Users\Solovey\Documents\gladiator-arena\index.html'
$c = Get-Content -Raw -LiteralPath $p
$c = $c -replace '\?v=35', '?v=36'
Set-Content -LiteralPath $p -Value $c -NoNewline -Encoding UTF8
Select-String -Path $p -Pattern 'v=3' | ForEach-Object { $_.Line.Trim() }
