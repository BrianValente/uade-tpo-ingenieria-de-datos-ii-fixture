param (
    [switch]$All,
    [switch]$Tcp,
    [switch]$Nativos,
    [switch]$Api,
    [switch]$InProcess,
    [string]$Output = ''
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Hito11Dir = Split-Path -Parent $ScriptDir
$RepoDir = Split-Path -Parent $Hito11Dir
$Hito10Dir = Join-Path $RepoDir 'hito-10-api'
$env:NODE_PATH = Join-Path $Hito10Dir 'node_modules'

$arguments = @()
if ($All) { $arguments += '--all' }
if ($Tcp) { $arguments += '--tcp' }
if ($Nativos) { $arguments += '--nativos' }
if ($Api) { $arguments += '--api' }
if ($InProcess) { $arguments += '--in-process' }
if ($Output -ne '') { $arguments += "--output=$Output" }

if ($arguments.Count -eq 0) {
    $arguments += '--all'
}

Write-Host '================================================================================' -ForegroundColor Cyan
Write-Host 'Iniciando Evaluación de Conectividad — Hito 11' -ForegroundColor Cyan
Write-Host "Ruta de módulos: $env:NODE_PATH" -ForegroundColor Gray
Write-Host "Parámetros: $arguments" -ForegroundColor Gray
Write-Host '================================================================================' -ForegroundColor Cyan

$TargetScript = Join-Path $ScriptDir 'evaluar_conectividad.ts'
npx tsx $TargetScript @arguments
