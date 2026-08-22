$supabaseUrl = "https://tixwhmgzibvazkqbqoev.supabase.co"
$serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0"

# Try to list available RPC functions
$body = @{ query = "SELECT 1" } | ConvertTo-Json -Compress

try {
    $result = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/rpc/run_sql" -Headers @{
        apikey = $serviceKey
        Authorization = "Bearer $serviceKey"
        "Content-Type" = "application/json"
    } -Body $body
    Write-Host "run_sql result: $result"
} catch {
    Write-Host "Error with run_sql: $($_.Exception.Message)"
}

# Try the exec RPC
try {
    $result2 = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/rpc/exec" -Headers @{
        apikey = $serviceKey
        Authorization = "Bearer $serviceKey"
        "Content-Type" = "application/json"
    } -Body $body
    Write-Host "exec result: $result2"
} catch {
    Write-Host "Error with exec: $($_.Exception.Message)"
}