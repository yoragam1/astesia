Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Linking Astesia (Live Mode) for Windows " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$SourceDir = if ($PSScriptRoot) { $PSScriptRoot } else { $PWD.Path }
$AgConfigDir = "$env:USERPROFILE\.gemini\config"
$DestDir = "$AgConfigDir\plugins\astesia"

Write-Host "Source Directory: $SourceDir"
Write-Host "Target Plugin Directory: $DestDir"

# Create the plugin directory
if (Test-Path $DestDir) {
    Remove-Item -Path $DestDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

# 1. Copy plugin manifest
Copy-Item -Path "$SourceDir\plugin.json" -Destination "$DestDir\plugin.json"

# 2. Append AGENTS.md rules to the Global Customization Root (~/.gemini/config/AGENTS.md)
$GlobalAgentsMd = "$AgConfigDir\AGENTS.md"

Write-Host "Injecting Astesia rules into Global AGENTS.md..."
if (Test-Path $GlobalAgentsMd) {
    $content = Get-Content -Path $GlobalAgentsMd -Raw
    $content = $content -replace '(?s)\s*<RULE\[astesia_global\]>.*?</SLASH_COMMANDS>\s*', "`r`n"
    Set-Content -Path $GlobalAgentsMd -Value $content
}

$AgentsMdContent = @"

<RULE[astesia_global]>
Kamu adalah entitas AI Multi-Layer "Astesia" (Autonomous Orchestrator v3.0).

Setiap kali aku memintamu membuat proyek baru, menulis arsitektur, atau memodifikasi fitur, kamu WAJIB:
1. Mengakses dan membaca kepribadian serta panduan operasimu di `$SourceDir\docs\agent-operating-guide.md` dan `$SourceDir\docs\astesia-persona.md`. Jangan pernah menjadi AI yang asal coding tanpa melewati pipeline.
2. Tentukan di Layer dan Mode mana kamu sedang beroperasi (Full Lifecycle, Headless, Surgical Hotfix, atau Gardening), lalu gunakan aturan ketat dari folder `$SourceDir\rules\`. Untuk perancangan hierarki kode, taati mutlak `engineering-rules.md`.
3. Terapkan prinsip Trust Pyramid & Machine Verification: jalankan `astesia-gate.ts`, terapkan `lint-ratchet` untuk kesalahan berulang, dan wajibkan bukti verifikasi independen sebelum menandai tugas selesai.
4. Jika aku meminta proyek baru, jalankan prosedur dari `$SourceDir\runtime\boot-sequence.md` atau gunakan Global Slash Command (`/astesia-init`).
5. Selalu cari referensi skill di `$SourceDir\skills\skills-index.md` sebelum bereksperimen dengan teknologi spesifik.

Utamakan struktur pipeline yang bersih secara manajerial, hindari jalan pintas technical debt, dan selalu kritisi keputusanku secara profesional sebagai Direktur Agensi Software.
</RULE[astesia_global]>

<SLASH_COMMANDS>
- `/astesia-init`: Trigger the Phase 1 (Product) boot sequence for a new Greenfield project.
- `/astesia-engineering`: Trigger the Brownfield entry protocol for an existing codebase.
</SLASH_COMMANDS>
"@

Add-Content -Path $GlobalAgentsMd -Value $AgentsMdContent

# 3. Create Directory Junctions for skills and rules (does not require Admin rights)
New-Item -ItemType Junction -Path "$DestDir\skills" -Target "$SourceDir\skills" | Out-Null
New-Item -ItemType Junction -Path "$DestDir\rules" -Target "$SourceDir\rules" | Out-Null

Write-Host "✅ Astesia Linked Successfully in Live Mode!" -ForegroundColor Green
Write-Host "All 53 Astesia skills and rule engines are now linked natively." -ForegroundColor Cyan
Write-Host "Any changes you make in $SourceDir will directly affect your AI Agent." -ForegroundColor Yellow
Write-Host "Please restart your Antigravity editor for the plugin to take effect." -ForegroundColor Yellow
