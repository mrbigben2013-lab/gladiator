$c = Get-Content -Raw -Encoding UTF8 barracks.css
$o = ([regex]::Matches($c, '\{')).Count
$cl = ([regex]::Matches($c, '\}')).Count
Write-Output "barracks open=$o close=$cl len=$($c.Length)"
$s = Get-Content -Raw -Encoding UTF8 style.css
Write-Output "style open=$(([regex]::Matches($s,'\{')).Count) close=$(([regex]::Matches($s,'\}')).Count)"
