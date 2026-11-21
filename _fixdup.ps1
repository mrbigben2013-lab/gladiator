$ErrorActionPreference = 'Stop'
$path = Join-Path (Get-Location) 'renderer.js'
$lines = [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)
Write-Output ("before: " + $lines.Count)
Write-Output ("2216: " + $lines[2215].Trim())
Write-Output ("2217: " + $lines[2216].Trim())
Write-Output ("2218: " + $lines[2217].Trim())
Write-Output ("2490: " + $lines[2489].Trim())
Write-Output ("2491: " + $lines[2490].Trim())
Write-Output ("2492: [" + $lines[2491] + "]")

$kept = @()
$kept += $lines[0..2216]          # 1..2217
$kept += $lines[2491..($lines.Count - 1)]  # 2492..end

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($path, $kept, $utf8NoBom)
Write-Output ("after: " + $kept.Count)
