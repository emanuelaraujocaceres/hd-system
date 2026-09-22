<# Diagnostico FK: replica o loop do build-bootstrap e mostra ONDE cada
ALTER TABLE ... ADD CONSTRAINT e decidido. Autocontido: nao importa nada
de build-bootstrap.ps1 (testa os padroes pretendidos finais).
Uso: .\diag-fk.ps1 -DumpPath '<caminho-do-dump>.sql'
Somente leitura. Nao toca em banco nenhum.
#>
param([Parameter(Mandatory = $true)][string]$DumpPath)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$migDir = Join-Path $repo 'supabase\migrations'
$P_TBL = '(?i)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?'
$P_ALT = '(?is)^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?.*?\bADD\s+CONSTRAINT\b'
$P_REF = '(?i)\bREFERENCES\s+(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?'
$createdTables = @{}
Get-ChildItem $migDir -Filter *.sql | Where-Object { $_.Name -notlike '20260701*' } | ForEach-Object {
  $t = [System.IO.File]::ReadAllText($_.FullName)
  foreach ($m in [regex]::Matches($t, $P_TBL)) { $createdTables[$m.Groups[1].Value.ToLower()] = $_.Name }
}
$txt = [System.IO.File]::ReadAllText($DumpPath)
$txt = [regex]::Replace($txt, '(?is)CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b.*?\$(?<tag>[A-Za-z_][A-Za-z0-9_]*)?\$.*?\$\k<tag>\$;', '/* function stripped */')
$stmts = $txt -split '(?m)(?<=;)\s*\r?\n'
# base = tabelas do dump menos as das datadas (mesma regra do builder)
$dumpTables = @()
foreach ($s in $stmts) {
  $m = [regex]::Match($s, '(?i)^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?')
  if ($m.Success -and -not $m.Groups[1].Value.ToLower().StartsWith('backup_')) { $dumpTables += $m.Groups[1].Value.ToLower() }
}
$included = @{}
foreach ($dt in $dumpTables) { if (-not $createdTables.ContainsKey($dt)) { $included[$dt] = $true } }
Write-Output ("tabelas na base: " + $included.Count)
$skips = @{ 'SET/SELECT/COMMENT/SCHEMA/EXT/COPY' = 0; 'TRIGGER' = 0; 'POLICY' = 0; 'GRANT/REVOKE' = 0; 'OWNER' = 0; 'ENABLE RLS' = 0 }
$altTotal = 0; $altMatched = 0; $kept = 0; $droppedRef = 0
foreach ($s in $stmts) {
  $t = $s.Trim()
  if ($t -notmatch '(?i)^\s*ALTER\s+TABLE\b') { continue }
  $altTotal++
  $killedBy = ''
  if ($t -match '(?i)^\s*(SET\s|SELECT\s|COMMENT\s|CREATE\s+SCHEMA|CREATE\s+EXTENSION|ALTER\s+DEFAULT|COPY\s)') { $killedBy = 'SET/etc' }
  elseif ($t -match '(?is)^\s*CREATE\s+(OR\s+REPLACE\s+)?TRIGGER\b') { $killedBy = 'TRIGGER' }
  elseif ($t -match '(?i)^\s*CREATE\s+POLICY\b') { $killedBy = 'POLICY' }
  elseif ($t -match '(?i)^\s*GRANT\b' -or $t -match '(?i)^\s*REVOKE\b') { $killedBy = 'GRANT/REVOKE' }
  elseif ($t -match '(?i)^\s*ALTER\s+TABLE\b.*\bOWNER\s+TO\b') { $killedBy = 'OWNER' }
  elseif ($t -match '(?i)^\s*ALTER\s+TABLE\b.*\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b') { $killedBy = 'ENABLE RLS' }
  $mAlt = [regex]::Match($t, $P_ALT)
  $firstLine = ($t -split "`r?`n" | Select-Object -First 1).Trim()
  if ($killedBy -ne '') {
    if ($skips.ContainsKey($killedBy)) { $skips[$killedBy]++ }
    Write-Output ("KILLED by " + $killedBy + " :: " + $firstLine)
    continue
  }
  if (-not $mAlt.Success) {
    Write-Output ("NO-MATCH mAlt :: " + $firstLine)
    continue
  }
  $altMatched++
  $onTable = $mAlt.Groups[1].Value.ToLower()
  $refM = [regex]::Match($t, $P_REF)
  $refTable = if ($refM.Success) { $refM.Groups[1].Value.ToLower() } else { '(REF-NAO-CAPTURADO)' }
  $inOn = $included.ContainsKey($onTable); $inRef = $included.ContainsKey($refTable)
  $decision = if ($inOn -and ($refTable -eq '' -or $inRef)) { $kept++; 'KEEP' } else { $droppedRef++; 'DROP-REF' }
  Write-Output ($decision + ' on=' + $onTable + '(inBase=' + $inOn + ') ref=' + $refTable + '(inBase=' + $inRef + ') :: ' + $firstLine)
}
Write-Output '=== RESUMO ==='
Write-Output ("ALTERs vistos: " + $altTotal + " | mAlt ok: " + $altMatched + " | KEEP: " + $kept + " | DROP-REF: " + $droppedRef)
foreach ($k in $skips.Keys) { Write-Output ("  killed " + $k + ": " + $skips[$k]) }
