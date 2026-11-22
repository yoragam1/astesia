# Requires -Version 5.1
param (
    [string]$Target = "",
    [switch]$DryRun,
    [switch]$Uninstall,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Detect invalid extra arguments (exit 2)
if ($args.Count -gt 0) {
    [Console]::Error.WriteLine("Error: Invalid arguments: $($args -join ' ')")
    exit 2
}

# Determine source directory (repo root)
$SourceDir = if ($PSScriptRoot) {
    [System.IO.Path]::GetFullPath($PSScriptRoot)
} else {
    [System.IO.Path]::GetFullPath($PWD.Path)
}

function Rollback-CreatedItems {
    param([string]$targetDir)
    $items = @("plugin.json", "skills", "rules", ".astesia-install.json")
    foreach ($item in $items) {
        $p = Join-Path $targetDir $item
        if (Test-Path -LiteralPath $p) {
            Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# Determine target directory
$DestDir = if ([string]::IsNullOrWhiteSpace($Target)) {
    Join-Path $env:USERPROFILE ".gemini\antigravity\plugins\astesia"
} else {
    [System.IO.Path]::GetFullPath($Target)
}

# Normalize paths without trailing separators for comparison
$normalizedSource = $SourceDir.TrimEnd('\', '/')
$normalizedDest = $DestDir.TrimEnd('\', '/')

# Safety check: Prevent installing into source repo or subpath of source repo
if ($normalizedDest -eq $normalizedSource -or $normalizedDest.StartsWith($normalizedSource + "\")) {
    [Console]::Error.WriteLine("Error: Invalid target: cannot install into the Astesia source repository ($DestDir)")
    exit 2
}

# ==============================================================================
# UNINSTALL MODE
# ==============================================================================
if ($Uninstall) {
    if (-not (Test-Path -LiteralPath $DestDir)) {
        Write-Host "Target directory does not exist: $DestDir (nothing to uninstall)"
        exit 0
    }

    $MarkerFile = Join-Path $DestDir ".astesia-install.json"
    if (-not (Test-Path -LiteralPath $MarkerFile)) {
        [Console]::Error.WriteLine("Error: Target is not owned by Astesia (missing marker): $DestDir")
        exit 3
    }

    try {
        $markerRaw = Get-Content -LiteralPath $MarkerFile -Raw -ErrorAction Stop
        $marker = ConvertFrom-Json -InputObject $markerRaw -ErrorAction Stop
    } catch {
        [Console]::Error.WriteLine("Error: Target ownership marker is corrupt: $DestDir")
        exit 3
    }

    if (-not $marker -or -not $marker.repo_path) {
        [Console]::Error.WriteLine("Error: Target ownership marker missing repo_path: $DestDir")
        exit 3
    }

    $markerRepo = [System.IO.Path]::GetFullPath($marker.repo_path).TrimEnd('\', '/')
    if ([string]::Compare($markerRepo, $normalizedSource, [System.StringComparison]::OrdinalIgnoreCase) -ne 0) {
        [Console]::Error.WriteLine("Error: Target is owned by a different repository ($markerRepo != $normalizedSource): $DestDir")
        exit 3
    }

    if ($DryRun) {
        Write-Host "[DRY-RUN] Would remove Astesia plugin directory: $DestDir"
        exit 0
    }

    Write-Host "Removing Astesia plugin from: $DestDir"
    Remove-Item -LiteralPath $DestDir -Recurse -Force
    Write-Host "Astesia plugin uninstalled cleanly."
    exit 0
}

# ==============================================================================
# INSTALL / UPDATE MODE
# ==============================================================================
if (Test-Path -LiteralPath $DestDir) {
    $MarkerFile = Join-Path $DestDir ".astesia-install.json"
    $isOwned = $false

    if (Test-Path -LiteralPath $MarkerFile) {
        try {
            $mRaw = Get-Content -LiteralPath $MarkerFile -Raw -ErrorAction Stop
            $mObj = ConvertFrom-Json -InputObject $mRaw -ErrorAction Stop
            if ($mObj -and $mObj.repo_path) {
                $mRepo = [System.IO.Path]::GetFullPath($mObj.repo_path).TrimEnd('\', '/')
                if ([string]::Compare($mRepo, $normalizedSource, [System.StringComparison]::OrdinalIgnoreCase) -eq 0) {
                    $isOwned = $true
                }
            }
        } catch {
            $isOwned = $false
        }
    }

    if ($isOwned) {
        # Check idempotency: if valid installation already exists and not forcing reinstall
        if (-not $Force) {
            $testPlugin = Join-Path $DestDir "plugin.json"
            $testSkills = Join-Path $DestDir "skills"
            $testRules = Join-Path $DestDir "rules"
            if ((Test-Path -LiteralPath $testPlugin) -and (Test-Path -LiteralPath $testSkills) -and (Test-Path -LiteralPath $testRules)) {
                Write-Host "Astesia plugin is already installed and up to date at: $DestDir"
                exit 0
            }
        }
    } else {
        # Foreign directory conflict!
        if (-not $Force) {
            [Console]::Error.WriteLine("Error: Target directory exists and is not owned by this Astesia repo: $DestDir. Use -Force to backup and overwrite.")
            exit 4
        }

        # Backup conflicting directory
        $timestamp = (Get-Date).ToString("yyyyMMddHHmmss")
        $backupPath = "$DestDir.bak-$timestamp"

        if ($DryRun) {
            Write-Host "[DRY-RUN] Would backup conflicting folder $DestDir -> $backupPath"
        } else {
            Write-Host "Backing up conflicting folder to: $backupPath"
            Move-Item -LiteralPath $DestDir -Destination $backupPath -Force
        }
    }
}

if ($DryRun) {
    Write-Host "[DRY-RUN] Would create directory: $DestDir"
    Write-Host "[DRY-RUN] Would copy plugin.json"
    Write-Host "[DRY-RUN] Would create directory junction: skills -> $SourceDir\skills"
    Write-Host "[DRY-RUN] Would create directory junction: rules -> $SourceDir\rules"
    Write-Host "[DRY-RUN] Would write ownership marker: .astesia-install.json"
    Write-Host "[DRY-RUN] Would verify installation integrity"
    exit 0
}

# Create target directory if needed
if (-not (Test-Path -LiteralPath $DestDir)) {
    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
}

# 1. Copy plugin manifest
$sourcePlugin = Join-Path $SourceDir "plugin.json"
if (-not (Test-Path -LiteralPath $sourcePlugin)) {
    [Console]::Error.WriteLine("Error: Source plugin.json not found in repository root: $sourcePlugin")
    exit 2
}
Copy-Item -LiteralPath $sourcePlugin -Destination (Join-Path $DestDir "plugin.json") -Force

# 2. Link skills and rules directories
$linkType = "junction"
$destSkills = Join-Path $DestDir "skills"
$destRules = Join-Path $DestDir "rules"

if (Test-Path -LiteralPath $destSkills) {
    Remove-Item -LiteralPath $destSkills -Recurse -Force
}
if (Test-Path -LiteralPath $destRules) {
    Remove-Item -LiteralPath $destRules -Recurse -Force
}

try {
    New-Item -ItemType Junction -Path $destSkills -Target (Join-Path $SourceDir "skills") -ErrorAction Stop | Out-Null
    New-Item -ItemType Junction -Path $destRules -Target (Join-Path $SourceDir "rules") -ErrorAction Stop | Out-Null
} catch {
    Write-Warning "Junction creation failed ($_); falling back to SymbolicLink"
    try {
        New-Item -ItemType SymbolicLink -Path $destSkills -Target (Join-Path $SourceDir "skills") -ErrorAction Stop | Out-Null
        New-Item -ItemType SymbolicLink -Path $destRules -Target (Join-Path $SourceDir "rules") -ErrorAction Stop | Out-Null
        $linkType = "symlink"
    } catch {
        [Console]::Error.WriteLine("Error: Failed to link skills and rules directories: $_")
        Rollback-CreatedItems -targetDir $DestDir
        exit 6
    }
}

# 3. Create Ownership Marker
$markerObj = [ordered]@{
    version = "3.1.0-rc1"
    repo_path = $SourceDir
    link_type = $linkType
    created_paths = @("plugin.json", "skills", "rules", ".astesia-install.json")
    installed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}
$markerJson = ConvertTo-Json -InputObject $markerObj
[System.IO.File]::WriteAllText((Join-Path $DestDir ".astesia-install.json"), $markerJson, [System.Text.UTF8Encoding]::new($false))

# 4. Post-installation Self-Check Verification
$targetPlugin = Join-Path $DestDir "plugin.json"
if (-not (Test-Path -LiteralPath $targetPlugin)) {
    [Console]::Error.WriteLine("Error: Verification failed: target plugin.json not found")
    Rollback-CreatedItems -targetDir $DestDir
    exit 5
}

try {
    $targetPluginObj = ConvertFrom-Json (Get-Content -LiteralPath $targetPlugin -Raw -ErrorAction Stop)
    if ($targetPluginObj.version -ne "3.1.0-rc1") {
        [Console]::Error.WriteLine("Error: Verification failed: plugin.json version mismatch")
        Rollback-CreatedItems -targetDir $DestDir
        exit 5
    }
} catch {
    [Console]::Error.WriteLine("Error: Verification failed: unable to parse plugin.json: $_")
    Rollback-CreatedItems -targetDir $DestDir
    exit 5
}

if (-not (Test-Path -LiteralPath (Join-Path $destSkills "minimalist-executor\SKILL.md"))) {
    [Console]::Error.WriteLine("Error: Verification failed: linked skills directory is not readable")
    Rollback-CreatedItems -targetDir $DestDir
    exit 5
}

if (-not (Test-Path -LiteralPath (Join-Path $destRules "AGENTS.md"))) {
    [Console]::Error.WriteLine("Error: Verification failed: linked rules directory is not readable")
    Rollback-CreatedItems -targetDir $DestDir
    exit 5
}

Write-Host "Astesia plugin installed successfully in Live Mode ($linkType) at: $DestDir"
exit 0
