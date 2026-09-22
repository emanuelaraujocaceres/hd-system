<# Rename coliding migration versions to YYYYMMDDHHMMSS, preserving order.
Usage: .\rename-migrations.ps1 [-WhatIf]
 - Groups files by first-8-digit date prefix; singletons and generated files
   (2026070*, 20260914_fix_*, *.skip, non-conforming) are untouched.
 - Within each group, assigns 000001, 000002... in CURRENT alphabetical order:
   20260801_aaa.sql -> 20260801000001_aaa.sql
 - Uses git mv (history preserved); falls back to Move-Item with warning.
 - Verifies post-rename order maps 1:1 to pre-rename order; on mismatch,
   rolls every rename back automatically and exits 1.
Pure file renames. Touches no database.
#>
param([switch]$WhatIf)
$ErrorActionPreference = 'Stop'
$migDir = 'supabase\migrations'
$files = Get-ChildItem $migDir -Filter *.sql | Where-Object {
  $_.Name -notlike '2026070*' -and $_.Name -notlike '20260914_fix_*' -and
  $_.Name -notlike '*.skip' -and ($_.Name -match '^\d{8}_')
} | Sort-Object Name
$groups = $files | Group-Object { $_.Name.Substring(0, 8) } | Where-Object { $_.Count -gt 1 }
Write-Output ("grupos com colisao: " + $groups.Count)
$pairs = @()
foreach ($g in $groups) {
  $i = 1
  foreach ($f in ($g.Group | Sort-Object Name)) {
    $rest = $f.Name -replace '^\d+_', ''
    $new = '{0}{1:000000}_{2}' -f $g.Name, $i, $rest
    $pairs += [pscustomobject]@{ Old = $f.Name; New = $new }
    $i++
  }
}
Write-Output ("renames planejados: " + $pairs.Count)
foreach ($p in $pairs) { Write-Output ("  " + $p.Old + "  ->  " + $p.New) }
if ($WhatIf) { Write-Output 'DRY-RUN: nada executado.'; exit 0 }
$allBefore = Get-ChildItem $migDir -Filter *.sql | Sort-Object Name | ForEach-Object { $_.Name }
foreach ($p in $pairs) {
  $src = Join-Path $migDir $p.Old
  $dst = Join-Path $migDir $p.New
  if (Test-Path $dst) { Write-Output ("DESTINO EXISTE, abortando: " + $p.New); exit 1 }
  try { git mv $src $dst 2>$null } catch { Move-Item $src $dst; Write-Output ("  (sem git mv, Move-Item usado: " + $p.Old + ")") }
  if ($LASTEXITCODE -ne 0 -and (Test-Path $src)) { Move-Item $src $dst; Write-Output ("  (git mv falhou, Move-Item usado: " + $p.Old + ")") }
}
# Verificacao GLOBAL: lista completa ordenada depois, mapeada p/ nomes antigos,
# deve ser identica a $allBefore (capturada acima, antes dos renames).
$rev = @{}
foreach ($p in $pairs) { $rev[$p.New] = $p.Old }
$afterFiles = Get-ChildItem $migDir -Filter *.sql | Sort-Object Name | ForEach-Object { $_.Name }
$afterMapped = @()
$ok = $true
foreach ($n in $afterFiles) {
  if ($rev.ContainsKey($n)) { $afterMapped += $rev[$n] }
  elseif ($allBefore -contains $n) { $afterMapped += $n }
  else { $ok = $false; $afterMapped += ('??? ' + $n) }
}
if ($ok) {
  if ($afterMapped.Count -ne $allBefore.Count) { $ok = $false }
  else {
    for ($i = 0; $i -lt $allBefore.Count; $i++) {
      if ($afterMapped[$i] -ne $allBefore[$i]) {
        $ok = $false
        Write-Output ("DIVERGENCIA na posicao " + $i + ": esperado " + $allBefore[$i] + " obtido " + $afterMapped[$i])
        break
      }
    }
  }
}
if (-not $ok) {
  Write-Output 'ORDEM DIVERGIU — revertendo tudo...'
  foreach ($p in $pairs) {
    $src = Join-Path $migDir $p.New
    $dst = Join-Path $migDir $p.Old
    if (Test-Path $src) { git mv $src $dst 2>$null }
  }
  Write-Output 'revertido. NADA executado alem do rollback.'
  exit 1
}
Write-Output 'OK: ordem preservada 1:1. Revise com git status antes de commitar.'
