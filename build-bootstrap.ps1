<# Build bootstrap schema from a prod pg_dump (schema-only).
Usage: .\build-bootstrap.ps1 -DumpPath '<path-to-dump>.sql'
Output: supabase/migrations/20260701_bootstrap_schema.sql (+ 20260914_fix_all_views.sql)
+ manifest on stdout. Pure file processing. Touches no database.
Rules:
 - INCLUDE: CREATE TABLE (except tables created by dated migrations in
   supabase/migrations/ and backup_* temp tables), REPLICA IDENTITY,
   ADD CONSTRAINT only when both tables are included.
 - VIEWS: ALL deferred to the repair migration (20260914_fix_all_views.sql).
   Reason (2026-09-14): 20260729_complete_uuid_migration drops `id` columns;
   any view created before it blocks the DROP. In prod the views did not exist
   yet when 20260729 ran. Repair runs after all dated migrations.
 - INCLUDE: CREATE INDEX only when table included and index not created
   by a dated migration.
 - SKIP: functions, triggers, policies, RLS ENABLE, grants, extensions,
   owners, comments, SET/SELECT, COPY (schema-only dumps have none).
 - CONVENTION (bug 2026-09-14): matchers accept optional double quotes
   around schema and object names (dated files use IF NOT EXISTS "public".X).
 - ORDER (bug 2026-09-14): output is sectioned — ALL CREATE TABLE first,
   then ADD CONSTRAINT, then INDEX, then REPLICA IDENTITY (pg_dump pattern).
   FKs never precede their tables, regardless of dump order.
#>
param([Parameter(Mandatory = $true)][string]$DumpPath)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$migDir = Join-Path $repo 'supabase\migrations'
$outFile = Join-Path $migDir '20260701_bootstrap_schema.sql'
$repairFile = Join-Path $migDir '20260914_fix_all_views.sql'
$oldRepairFile = Join-Path $migDir '20260914_fix_vw_dlq.sql'
if (-not (Test-Path $DumpPath)) { Write-Output 'DUMP NOT FOUND'; exit 1 }
if (Test-Path $oldRepairFile) { Remove-Item $oldRepairFile -Force; Write-Output 'repair antigo removido: 20260914_fix_vw_dlq.sql (superseded)' }

# 1. Tables and indexes owned by dated migrations (never duplicated in base).
$createdTables = @{}
$createdIndexes = @{}
Get-ChildItem $migDir -Filter *.sql | Where-Object { $_.Name -notlike '2026070*' -and $_.Name -notlike '20260914_fix_*' -and $_.Name -notlike '*.skip' } | ForEach-Object {
  $t = [System.IO.File]::ReadAllText($_.FullName)
  foreach ($m in [regex]::Matches($t, '(?i)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?')) {
    $createdTables[$m.Groups[1].Value.ToLower()] = $_.Name
  }
  foreach ($m in [regex]::Matches($t, '(?i)CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?')) {
    $createdIndexes[$m.Groups[1].Value.ToLower()] = $_.Name
  }
}

# 2. Strip function bodies first (they contain inner semicolons).
$txt = [System.IO.File]::ReadAllText($DumpPath)
$txt = [regex]::Replace($txt, '(?is)CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b.*?\$(?<tag>[A-Za-z_][A-Za-z0-9_]*)?\$.*?\$\k<tag>\$;', '/* function stripped */')
$stmts = $txt -split '(?m)(?<=;)\s*\r?\n'

function TableOf([string]$s) {
  $m = [regex]::Match($s, '(?i)^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?')
  if ($m.Success) { return $m.Groups[1].Value.ToLower() }
  return ''
}
function RefsOf([string]$s) {
  $refs = @()
  foreach ($m in [regex]::Matches($s, '(?i)(?:FROM|JOIN)\s+(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?')) {
    $refs += $m.Groups[1].Value.ToLower()
  }
  return $refs
}

# PASS 1: table membership first (order-independent constraint decisions).
$included = @{}
$keptTables = @()
$skippedTables = @()
foreach ($s in $stmts) {
  $tn = TableOf($s)
  if ($tn -eq '') { continue }
  if ($tn.StartsWith('backup_')) { $skippedTables += ($tn + '  (backup temporario, ignorada)'); continue }
  if ($createdTables.ContainsKey($tn)) { $skippedTables += ($tn + '  (criada em ' + $createdTables[$tn] + ')'); continue }
  $included[$tn] = $true
  $keptTables += $tn
}

# PASS 2: emit into ordered sections.
$secTables = New-Object System.Collections.Generic.List[string]
$secConstraints = New-Object System.Collections.Generic.List[string]
$secIndexes = New-Object System.Collections.Generic.List[string]
$secReplica = New-Object System.Collections.Generic.List[string]
$skippedViews = @()
$repairViews = New-Object System.Collections.Generic.List[string]
$keptIndexes = 0
$keptConstraints = 0
$keptReplica = 0
foreach ($s in $stmts) {
  $t = $s.Trim()
  if ($t -eq '' -or $t.StartsWith('--') -or $t.StartsWith('/* function stripped */')) { continue }
  if ($t -match '(?i)^\s*(SET\s|SELECT\s|COMMENT\s|CREATE\s+SCHEMA|CREATE\s+EXTENSION|ALTER\s+DEFAULT|COPY\s)') { continue }
  if ($t -match '(?is)^\s*CREATE\s+(OR\s+REPLACE\s+)?TRIGGER\b') { continue }
  if ($t -match '(?i)^\s*CREATE\s+POLICY\b') { continue }
  if ($t -match '(?i)^\s*GRANT\b' -or $t -match '(?i)^\s*REVOKE\b') { continue }
  if ($t -match '(?i)^\s*ALTER\s+TABLE\b.*\bOWNER\s+TO\b') { continue }
  if ($t -match '(?i)^\s*ALTER\s+TABLE\b.*\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b') { continue }
  if ($t -match '(?i)^\s*CREATE\s+(OR\s+REPLACE\s+)?VIEW\b') {
    $vm = [regex]::Match($t, '(?is)^\s*CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)?')
    $vname = if ($vm.Success) { $vm.Groups[2].Value } else { '(sem-nome)' }
    $missing = @(RefsOf($t) | Where-Object { -not $included.ContainsKey($_) } | Sort-Object -Unique)
    $reason = if ($missing.Count -gt 0) { 'ref ausente na base: ' + ($missing -join ', ') } else { 'adiada p/ repair (uuid-migration DROP COLUMN)' }
    $skippedViews += ($vname + '  (' + $reason + ')')
    $repairViews.Add('DROP VIEW IF EXISTS public.' + $vname + ';')
    $repairViews.Add($s.TrimEnd())
    $repairViews.Add('')
    continue
  }
  if ($t -match '(?i)^\s*ALTER\s+TABLE\b.*\bREPLICA\s+IDENTITY\b') {
    $repM = [regex]::Match($t, '(?i)^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?')
    if ($repM.Success -and $included.ContainsKey($repM.Groups[1].Value.ToLower())) {
      $secReplica.Add($s.TrimEnd()); $secReplica.Add(''); $keptReplica++
    }
    continue
  }
  $mIdx = [regex]::Match($t, '(?i)^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s+ON\s+(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?')
  if ($mIdx.Success) {
    $inName = $mIdx.Groups[1].Value.ToLower(); $onTable = $mIdx.Groups[2].Value.ToLower()
    if ($included.ContainsKey($onTable) -and -not $createdIndexes.ContainsKey($inName)) {
      $secIndexes.Add($s.TrimEnd()); $secIndexes.Add(''); $keptIndexes++
    }
    continue
  }
  $mAlt = [regex]::Match($t, '(?is)^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?.*?\bADD\s+CONSTRAINT\b')
  if ($mAlt.Success) {
    $onTable = $mAlt.Groups[1].Value.ToLower()
    $refM = [regex]::Match($t, '(?i)\bREFERENCES\s+(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?')
    $refTable = if ($refM.Success) { $refM.Groups[1].Value.ToLower() } else { '' }
    if ($included.ContainsKey($onTable) -and ($refTable -eq '' -or $included.ContainsKey($refTable))) {
      $secConstraints.Add($s.TrimEnd()); $secConstraints.Add(''); $keptConstraints++
    }
    continue
  }
  $tn = TableOf($s)
  if ($tn -ne '' -and $included.ContainsKey($tn)) {
    $secTables.Add($s.TrimEnd()); $secTables.Add('')
    continue
  }
}
$out = New-Object System.Collections.Generic.List[string]
$out.Add('-- ==============================================================================')
$out.Add('-- BOOTSTRAP SCHEMA (gerado, NAO EDITAR A MAO)')
$out.Add('-- Fonte: pg_dump --schema-only da producao; refinado por build-bootstrap.ps1')
$out.Add('-- Regra: so o que as migrations datadas NAO criam. RLS/policies/functions/')
$out.Add('-- triggers/grants vao pelas migrations datadas. Views vao no repair')
$out.Add('-- 20260914_fix_all_views.sql (uuid-migration DROP COLUMN bloqueia views precoces).')
$out.Add('-- REVISAR antes do db reset.')
$out.Add('-- Ordem das secoes: TABLES -> CONSTRAINTS -> INDEXES -> REPLICA.')
$out.Add('-- ==============================================================================')
$out.Add('')
$out.Add('-- ---------- TABLES ----------'); $out.Add('')
foreach ($l in $secTables) { $out.Add($l) }
$out.Add('-- ---------- CONSTRAINTS (FK/CHECK/UNIQUE, apos todas as tabelas) ----------'); $out.Add('')
foreach ($l in $secConstraints) { $out.Add($l) }
$out.Add('-- ---------- INDEXES ----------'); $out.Add('')
foreach ($l in $secIndexes) { $out.Add($l) }
$out.Add('-- ---------- REPLICA IDENTITY ----------'); $out.Add('')
foreach ($l in $secReplica) { $out.Add($l) }
[System.IO.File]::WriteAllText($outFile, (($out -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding $false))
if ($repairViews.Count -gt 0) {
  $rep = New-Object System.Collections.Generic.List[string]
  $rep.Add('-- ==============================================================================')
  $rep.Add('-- REPARO: views recriadas DEPOIS das datadas (a uuid-migration 20260729')
  $rep.Add('-- derruba DROP COLUMN id se a view ja existir). Gerado por build-bootstrap.ps1.')
  $rep.Add('-- REVISAR antes do db reset.')
  $rep.Add('-- ==============================================================================')
  $rep.Add('')
  foreach ($l in $repairViews) { $rep.Add($l) }
  [System.IO.File]::WriteAllText($repairFile, (($rep -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding $false))
}

# Self-check: no ADD CONSTRAINT before the last CREATE TABLE.
$lines = [System.IO.File]::ReadAllLines($outFile)
$lastTable = -1; $firstConstr = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^\s*CREATE\s+TABLE\b') { $lastTable = $i }
  if ($firstConstr -lt 0 -and $lines[$i] -match 'ADD\s+CONSTRAINT') { $firstConstr = $i }
}
$orderOk = ($firstConstr -lt 0) -or ($lastTable -lt $firstConstr)
$fkCount = ([regex]::Matches([System.IO.File]::ReadAllText($outFile), '(?i)\bFOREIGN\s+KEY\b')).Count
Write-Output '=== MANIFEST ==='
Write-Output ("tabelas incluidas: " + $keptTables.Count)
Write-Output ("tabelas puladas (criadas nas datadas): " + $skippedTables.Count)
foreach ($s in ($skippedTables | Sort-Object)) { Write-Output ("  skip: " + $s) }
Write-Output ("views no repair (todas adiadas): " + $skippedViews.Count)
foreach ($s in ($skippedViews | Sort-Object)) { Write-Output ('  repair-view: ' + $s) }
if ($repairViews.Count -gt 0) { Write-Output ('repair gerado: supabase/migrations/20260914_fix_all_views.sql') }
Write-Output ("constraints: " + $keptConstraints + " | foreign keys: " + $fkCount + " | indexes: " + $keptIndexes + " | replica: " + $keptReplica)
$nT = 0; $nC = 0; $nI = 0
foreach ($l in $lines) {
  if ($l -match '^\s*CREATE\s+TABLE\b') { $nT++ }
  if ($l -match '^\s*ADD\s+CONSTRAINT\b') { $nC++ }
  if ($l -match '^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\b') { $nI++ }
}
Write-Output ("contagens no arquivo: CREATE TABLE=" + $nT + " ADD CONSTRAINT=" + $nC + " CREATE INDEX=" + $nI)
Write-Output ('ordem TABLES-antes-CONSTRAINTS: ' + ($(if ($orderOk) { 'OK' } else { 'VIOLADA' })))
Write-Output ('arquivo: supabase/migrations/20260701_bootstrap_schema.sql')
