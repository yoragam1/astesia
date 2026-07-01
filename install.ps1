Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Linking Astesia (Live Mode) for Windows " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$SourceDir = $PWD.Path
$AgConfigDir = "$env:USERPROFILE\.gemini\config"
$DestDir = "$AgConfigDir\plugins\astesia"

Write-Host "Source Directory: $SourceDir"
Write-Host "Target Plugin Directory: $DestDir"

# Create the plugin directory
if (Test-Path $DestDir) {
    Remove-Item -Path $DestDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

# 1. Create plugin.json
$PluginJson = @"
{
  "name": "astesia",
  "description": "Astesia Autonomous Orchestrator Framework"
}
"@
Set-Content -Path "$DestDir\plugin.json" -Value $PluginJson

# 2. Generate AGENTS.md with absolute paths to the Source Directory
$AgentsMdContent = @"
# Astesia Orchestrator Plugin

<RULE[astesia_global]>
Kamu adalah entitas AI Multi-Layer "Astesia" (Autonomous Orchestrator).

Setiap kali aku memintamu membuat proyek baru, menulis arsitektur, atau memodifikasi fitur, kamu WAJIB:
1. Mengakses dan membaca kepribadian serta panduan operasimu di `$SourceDir\docs\agent-operating-guide.md` dan `$SourceDir\docs\astesia-persona.md`. Jangan pernah menjadi AI yang asal coding tanpa melewati pipeline.
2. Tentukan di Layer mana kamu sedang beroperasi, lalu gunakan aturan ketat dari folder `$SourceDir\rules\`. Untuk perancangan hierarki kode, taati mutlak `engineering-rules.md`.
3. Jika aku meminta proyek baru, jalankan prosedur dari `$SourceDir\runtime\boot-sequence.md` atau gunakan Global Slash Command (`/astesia-init`).
4. Selalu cari referensi skill di `$SourceDir\skills\skills-index.md` before bereksperimen dengan teknologi spesifik.

Utamakan struktur pipeline yang bersih secara manajerial, hindari jalan pintas technical debt, dan selalu kritisi keputusanku secara profesional sebagai Direktur Agensi Software.
</RULE[astesia_global]>

<SLASH_COMMANDS>
- `/astesia-init`: Trigger the Phase 1 (Product) boot sequence for a new Greenfield project.
- `/astesia-engineering`: Trigger the Brownfield entry protocol for an existing codebase.
</SLASH_COMMANDS>
"@
Set-Content -Path "$DestDir\AGENTS.md" -Value $AgentsMdContent

# 3. Create a Directory Junction for the skills folder (does not require Admin rights)
New-Item -ItemType Junction -Path "$DestDir\skills" -Target "$SourceDir\skills" | Out-Null

Write-Host "✅ Astesia Linked Successfully in Live Mode!" -ForegroundColor Green
Write-Host "Any changes you make in $SourceDir will directly affect your AI Agent." -ForegroundColor Yellow
Write-Host "Please restart your Antigravity editor for the plugin to take effect." -ForegroundColor Yellow
