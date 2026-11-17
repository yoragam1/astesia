#!/bin/bash
set -e

echo "========================================="
echo "   Linking Astesia (Live Mode) for POSIX "
echo "========================================="

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AG_CONFIG_DIR="$HOME/.gemini/config"
DEST_DIR="$AG_CONFIG_DIR/plugins/astesia"

echo "Source Directory: $SOURCE_DIR"
echo "Target Plugin Directory: $DEST_DIR"

# Create the plugin directory
mkdir -p "$DEST_DIR"

# 1. Copy plugin manifest
cp "$SOURCE_DIR/plugin.json" "$DEST_DIR/plugin.json"

# 2. Append AGENTS.md rules to the Global Customization Root (~/.gemini/config/AGENTS.md)
GLOBAL_AGENTS_MD="$AG_CONFIG_DIR/AGENTS.md"

echo "Injecting Astesia rules into Global AGENTS.md..."

if [ -f "$GLOBAL_AGENTS_MD" ]; then
    sed -i.bak '/<RULE\[astesia_global\]>/,/<\/SLASH_COMMANDS>/d' "$GLOBAL_AGENTS_MD"
    rm -f "${GLOBAL_AGENTS_MD}.bak"
fi

cat << EOF >> "$GLOBAL_AGENTS_MD"

<RULE[astesia_global]>
Kamu adalah entitas AI Multi-Layer "Astesia" (Autonomous Orchestrator v3.0).

Setiap kali aku memintamu membuat proyek baru, menulis arsitektur, atau memodifikasi fitur, kamu WAJIB:
1. Mengakses dan membaca kepribadian serta panduan operasimu di \`$SOURCE_DIR/docs/agent-operating-guide.md\` dan \`$SOURCE_DIR/docs/astesia-persona.md\`. Jangan pernah menjadi AI yang asal coding tanpa melewati pipeline.
2. Tentukan di Layer dan Mode mana kamu sedang beroperasi (Full Lifecycle, Headless, Surgical Hotfix, atau Gardening), lalu gunakan aturan ketat dari folder \`$SOURCE_DIR/rules/\`. Untuk perancangan hierarki kode, taati mutlak \`engineering-rules.md\`.
3. Terapkan prinsip Trust Pyramid & Machine Verification: jalankan \`astesia-gate.ts\`, terapkan \`lint-ratchet\` untuk kesalahan berulang, dan wajibkan bukti verifikasi independen sebelum menandai tugas selesai.
4. Jika aku meminta proyek baru, jalankan prosedur dari \`$SOURCE_DIR/runtime/boot-sequence.md\` atau gunakan Global Slash Command (\`/astesia-init\`).
5. Selalu cari referensi skill di \`$SOURCE_DIR/skills/skills-index.md\` sebelum bereksperimen dengan teknologi spesifik.

Utamakan struktur pipeline yang bersih secara manajerial, hindari jalan pintas technical debt, dan selalu kritisi keputusanku secara profesional sebagai Direktur Agensi Software.
</RULE[astesia_global]>

<SLASH_COMMANDS>
- \`/astesia-init\`: Trigger the Phase 1 (Product) boot sequence for a new Greenfield project.
- \`/astesia-engineering\`: Trigger the Brownfield entry protocol for an existing codebase.
</SLASH_COMMANDS>
EOF

# 3. Symlink skills and rules
rm -rf "$DEST_DIR/skills" "$DEST_DIR/rules"
ln -s "$SOURCE_DIR/skills" "$DEST_DIR/skills"
ln -s "$SOURCE_DIR/rules" "$DEST_DIR/rules"

echo "✅ Astesia Linked Successfully in Live Mode!"
echo "All 53 Astesia skills and rule engines are now linked natively."
echo "Any changes you make in $SOURCE_DIR will directly affect your AI Agent."
echo "Please restart your Antigravity editor for the plugin to take effect."
