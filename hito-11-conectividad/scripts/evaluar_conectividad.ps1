param (
    [switch]$All,
    [switch]$Tcp,
    [switch]$Nativos,
    [switch]$Api,
    [switch]$InProcess,
    [string]$Product = '',
    [string]$Output = ''
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Hito11Dir = Split-Path -Parent $ScriptDir
$RepoDir = Split-Path -Parent $Hito11Dir
$Hito10Dir = Join-Path $RepoDir 'hito-10-api'

# Cargar .env existente respetando precedencia sin sobrescribir valores ya configurados
$EnvCandidates = @(
    Join-Path $Hito11Dir '.env',
    Join-Path $Hito10Dir '.env',
    Join-Path $RepoDir '.env'
)

foreach ($envFile in $EnvCandidates) {
    if (Test-Path $envFile) {
        Write-Host "Cargando variables de entorno desde: $envFile" -ForegroundColor Gray
        Get-Content $envFile | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
                $idx = $line.IndexOf('=')
                $key = $line.Substring(0, $idx).Trim()
                $val = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
                if (-not (Get-Item "Env:$key" -ErrorAction SilentlyContinue)) {
                    Set-Item "Env:$key" -Value $val
                }
            }
        }
        break
    }
}

$arguments = @()
if ($All) { $arguments += '--all' }
if ($Tcp) { $arguments += '--tcp' }
if ($Nativos) { $arguments += '--nativos' }
if ($Api) { $arguments += '--api' }
if ($InProcess) { $arguments += '--in-process' }
if ($Product -ne '') { $arguments += "--product=$Product" }
if ($Output -ne '') { $arguments += "--output=$Output" }

Write-Host '================================================================================' -ForegroundColor Cyan
Write-Host 'Iniciando Evaluación de Conectividad — Hito 11' -ForegroundColor Cyan
Write-Host "Directorio Hito 10: $Hito10Dir" -ForegroundColor Gray
Write-Host "Parámetros: $arguments" -ForegroundColor Gray
Write-Host '================================================================================' -ForegroundColor Cyan

$TargetScript = Join-Path $ScriptDir 'evaluar_conectividad.ts'
$TsxBin = Join-Path $Hito10Dir 'node_modules\tsx\dist\cli.mjs'

if (Test-Path $TsxBin) {
    node $TsxBin $TargetScript @arguments
} else {
    npx tsx $TargetScript @arguments
}
