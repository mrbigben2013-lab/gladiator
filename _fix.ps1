$p = "index.html"
$bytes = [System.IO.File]::ReadAllBytes($p)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }

$encs = @(866, 1251, 437, 855)
foreach ($cpn in $encs) {
  try {
    $enc = [System.Text.Encoding]::GetEncoding($cpn)
    $b = $enc.GetBytes($text)
    $try = [System.Text.Encoding]::UTF8.GetString($b)
    if ($try -match "Братья Арены" -and $try -match "Казарма") {
      [System.IO.File]::WriteAllBytes($p, $b)
      "FIXED with cp$cpn"
      exit 0
    }
  } catch {}
}
"FAILED"
