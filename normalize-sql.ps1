<# Normaliza .sql de supabase/migrations: UTF-8 valido + LF puro, sem BOM.
Uso: .\normalize-sql.ps1 [-Apply]
Sem -Apply: DRY-RUN, so relata o que mudaria. Com -Apply: reescreve.
Regras:
 - Arquivo com UTF-8 invalido: decodifica como Windows-1252 e re-salva UTF-8.
 - product_lots (20260814000001_add_product_lots.sql): reescreve as 2 linhas
   de COMMENT corrompidas por texto limpo (conteudo identificado por padrao,
   nao por numero de linha).
 - EOL: CRLF -> LF em arquivos que contenham CR.
 - So reescreve arquivos alterados; os demais ficam intactos (diff minimo).
 - Nao commita: revise com git status/diff antes.
#>
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$migDir = 'supabase\migrations'
$files = Get-ChildItem $migDir -Filter *.sql | Sort-Object Name
$changed = 0
$pending = @()
$backupDir = $null
function Backup-Original([string]$fullPath, [string]$name) {
  if (-not $script:backupDir) {
    $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
    $script:backupDir = Join-Path $PSScriptRoot ("supabase\migrations-backup-" + $ts)
    New-Item -ItemType Directory -Path $script:backupDir | Out-Null
    Write-Output ("backup em: supabase\migrations-backup-" + $ts + "\  (local, nao commitar)")
  }
  [System.IO.File]::Copy($fullPath, (Join-Path $script:backupDir $name), $true)
}
foreach ($f in $files) {
  $raw = [System.IO.File]::ReadAllBytes($f.FullName)
  $actions = @()
  $text = $null
  # BOM em BYTES primeiro (EF BB BF): elimina a classe inteira de ambiguidade
  # entre "BOM consumido ou nao" do decoder — antes de qualquer decode.
  if ($raw.Length -ge 3 -and $raw[0] -eq 0xEF -and $raw[1] -eq 0xBB -and $raw[2] -eq 0xBF) {
    $raw = $raw[3..($raw.Length - 1)]
    $actions += 'remove-BOM'
  }
  # Decode ESTRITO: invalido lanca excecao em vez de trocar por U+FFFD.
  try {
    $text = (New-Object System.Text.UTF8Encoding $false, $true).GetString($raw)
  } catch {
    $text = [System.Text.Encoding]::GetEncoding(1252).GetString($raw)
    $actions += 're-encode Latin1->UTF8'
  }
  if ($f.Name -like '*add_product_lots.sql') {
    $t2 = [regex]::Replace($text, "(?m)^.*COMMENT\s+ON\s+TABLE\s+product_lots\s+IS\s+'.*$", "COMMENT ON TABLE product_lots IS 'Lotes de produto com validade e quantidade. Usado para FEFO.';")
    if ($t2 -ne $text) { $text = $t2; $actions += 'fix COMMENT TABLE' }
    $t3 = [regex]::Replace($text, "(?m)^.*COMMENT\s+ON\s+COLUMN\s+product_lots\.quantity\s+IS\s+'.*$", "COMMENT ON COLUMN product_lots.quantity IS 'Quantidade em estoque deste lote espec" + [char]0xED + "fico';")
    if ($t3 -ne $text) { $text = $t3; $actions += 'fix COMMENT COLUMN' }
  }
  $hasCR = $text.Contains("`r")
  if ($hasCR) { $actions += 'CRLF->LF' }
  if ($actions.Count -eq 0) {
    Write-Output ("ok:      " + $f.Name)
  } else {
    Write-Output ("ALTERA:  " + $f.Name + "  [" + ($actions -join ', ') + "]")
    $final = $text -replace "`r`n", "`n"
    $final = $final -replace "`r", "`n"
    if (-not $final.EndsWith("`n")) { $final += "`n" }
    # GATE fail-closed: o conteudo final valido sempre comeca com '--'.
    # Nada e escrito enquanto houver um offender (nem backup parcial).
    if (-not $final.TrimStart().StartsWith('--')) {
      Write-Output ("  FALHA-VALIDACAO: " + $f.Name + " nao comeca com -- apos transformar")
      $script:failed += @($f.Name)
    } else {
      $script:pending += @(@{ File = $f; Text = $final })
    }
  }
}
if ($Apply) {
  if ($script:failed.Count -gt 0) {
    Write-Output 'ABORTADO: validacao falhou — NADA foi escrito (nem backup).'
    exit 1
  }
  foreach ($p in $script:pending) {
    Backup-Original $p.File.FullName $p.File.Name
    [System.IO.File]::WriteAllBytes($p.File.FullName, [System.Text.UTF8Encoding]::new($false).GetBytes($p.Text))
    $changed++
  }
  Write-Output ("arquivos reescritos: " + $changed)
} else { Write-Output 'DRY-RUN: nada escrito. Rode com -Apply para aplicar.' }
