<# Repair da 20260809000005_rls_phase2_final.sql (bug: join pol.oid = cls.relid
+ CREATE POLICY em tabelas-fantasma financial_accounts/caixa_sessions).
Gera supabase/migrations/20260809000006_rls_phase2_final.sql (posicao logo
apos a original) e renomeia a original para .skip. Sem o repair, o bloco
bugado aborta o arquivo inteiro no replay e as policies reais (Â§4-Â§6) nunca
sao criadas. Touches no database. Idempotente e aborta sem tocar em nada
se qualquer premissa falhar.
#>
param()
$ErrorActionPreference = 'Stop'
$migDir = Join-Path $PSScriptRoot "supabase\migrations"
$src = Join-Path $migDir '20260809000005_rls_phase2_final.sql'
$dst = Join-Path $migDir '20260809000006_rls_phase2_final.sql'
$skip = Join-Path $migDir '20260809000005_rls_phase2_final.sql.skip'
if (-not (Test-Path $src)) { Write-Output 'ORIGINAL NAO ENCONTRADA (ja convertida?)'; exit 1 }
if (Test-Path $dst) { Write-Output 'REPAIR JA EXISTE, nada a fazer.'; exit 1 }
$t = [System.IO.File]::ReadAllText($src)
function Must-Contain([string]$x, [string]$needle, [string]$label) {
  if ($x.IndexOf($needle, [System.StringComparison]::Ordinal) -lt 0) {
    Write-Output ("PREMISSA FALHOU, abortando sem alteracoes: " + $label)
    exit 1
  }
}
Must-Contain $t 'pol.oid = cls.relid' 'join bugado'
Must-Contain $t "'financial_accounts','caixa_sessions'" 'fantasmas Â§3'
Must-Contain $t "'branch_themes','api_keys'," 'lista org_tables'
# 1) join corrigido (polrelid = oid)
$t = $t.Replace('JOIN pg_class cls ON pol.oid = cls.relid  -- this is wrong, but we will handle differently', 'JOIN pg_class cls ON pol.polrelid = cls.oid  -- corrigido no repair: polrelid e a FK p/ pg_class')
if ($t.IndexOf('pol.polrelid = cls.oid') -lt 0) {
  $t = $t.Replace('pol.oid = cls.relid', 'pol.polrelid = cls.oid')
}
# 2) remove tabelas-fantasma das 2 listas (virgula pendente inclusa)
$n1 = ($t.Split("`n") | Where-Object { $_ -match 'financial_accounts' }).Count
$t = $t.Replace("       'profiles','organizations',`r`n       'financial_accounts','caixa_sessions'", "       'profiles','organizations'")
$t = $t.Replace("       'profiles','organizations',`n       'financial_accounts','caixa_sessions'", "       'profiles','organizations'")
$t = $t.Replace("       'branch_themes','api_keys',`r`n       'financial_accounts','caixa_sessions'", "       'branch_themes','api_keys'")
$t = $t.Replace("       'branch_themes','api_keys',`n       'financial_accounts','caixa_sessions'", "       'branch_themes','api_keys'")
$n2 = ([regex]::Matches($t, 'financial_accounts|caixa_sessions')).Count
$header = @'
-- ==============================================================================
-- REPAIR de 20260809000005_rls_phase2_final.sql (gerado, NAO EDITAR A MAO)
-- Correcoes vs original: (1) join pg_policy.polrelid = pg_class.oid (o original
-- usava pol.oid = cls.relid, erro 42703); (2) removidas financial_accounts e
-- caixa_sessions das listas (tabelas-fantasma: nunca existiram; o CREATE nelas
-- falharia). Todo o resto e byte-identico ao original. REVISAR antes do reset.
-- ==============================================================================

'@
[System.IO.File]::WriteAllText($dst, $header + $t, (New-Object System.Text.UTF8Encoding $false))
git mv $src ($src + '.skip')
Write-Output '=== REPAIR ==='
Write-Output ("fantasmas restantes no repair: " + $n2 + " (esperado 0 em listas; comentarios ok)")
Write-Output 'arquivo: supabase/migrations/20260809000006_rls_phase2_final.sql'
Write-Output 'original movida para .skip (fora do replay). Revise com git status/diff.'




