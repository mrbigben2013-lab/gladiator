$t = Get-Content data.js -Raw
$m = [regex]::Matches($t, "id:\s*'([a-z]_[a-z0-9_]+)'")
$m | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
