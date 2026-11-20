# ==============================================================================
# RGS LEDGER — MONGODB ATLAS M0 ZERO-COST BACKUP SCRIPT (PowerShell)
# ==============================================================================

param(
    [string]$BackupDir = "./backups"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$ArchiveName = "rgs_ledger_m0_backup_${Timestamp}.gz"
$TargetFile = Join-Path $BackupDir $ArchiveName

$MongoUri = $env:MONGODB_URI
if (-not $MongoUri -and (Test-Path ".env")) {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^MONGODB_URI=(.+)$") {
            $MongoUri = $matches[1].Trim()
        }
    }
}

if (-not $MongoUri) {
    Write-Error "ERROR: MONGODB_URI environment variable is not set and could not be loaded from .env"
    exit 1
}

Write-Host "======================================================================"
Write-Host "Starting MongoDB Atlas M0 Backup: $TargetFile"
Write-Host "======================================================================"

mongodump --uri="$MongoUri" --gzip --archive="$TargetFile"

if ($LASTEXITCODE -eq 0) {
    $FileSize = (Get-Item $TargetFile).Length / 1KB
    Write-Host "Backup Completed Successfully! ($([math]::Round($FileSize, 2)) KB)"
} else {
    Write-Error "Backup failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
