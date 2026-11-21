Write-Output "=== dir ==="
Get-ChildItem -Force | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
Write-Output "=== backups anywhere ==="
Get-ChildItem -Force -Recurse -Include *.bak,*.orig,*.backup,*style* -ErrorAction SilentlyContinue | Select-Object FullName, Length | Format-Table -AutoSize
