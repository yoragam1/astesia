#!/bin/bash
set -e

echo "========================================="
echo "   Linking Astesia (Live Mode) for Mac   "
echo "========================================="

SOURCE_DIR="$PWD"
AG_CONFIG_DIR="$HOME/.gemini/config"
DEST_DIR="$AG_CONFIG_DIR/plugins/astesia"

echo "Source Directory: $SOURCE_DIR"
echo "Target Plugin Directory: $DEST_DIR"

# Create the plugin directory
mkdir -p "$DEST_DIR"

# 1. Create plugin.json
cat << EOF > "$DEST_DIR/plugin.json"
{
  "name": "astesia",
  "description": "Astesia Autonomous Orchestrator Framework"
}
EOF

# 2. Append AGENTS.md rules to the Global Customization Root (~/.gemini/config/AGENTS.md)
GLOBAL_AGENTS_MD="$AG_CONFIG_DIR/AGENTS.md"

echo "Injecting Astesia rules into Global AGENTS.md..."

# Remove old Astesia block if exists to prevent duplicates
if [ -f "$GLOBAL_AGENTS_MD" ]; then
    # Delete everything between the marker tags (inclusive)
    sed -i.bak '/<RULE\[astesia_global\]>/,/<\/SLASH_COMMANDS>/d' "$GLOBAL_AGENTS_MD"
    rm -f "${GLOBAL_AGENTS_MD}.bak"
fi

cat << EOF >> "$GLOBAL_AGENTS_MD"

<RULE[astesia_global]>
Kamu adalah entitas AI Multi-Layer "Astesia" (Autonomous Orchestrator).

Setiap kali aku memintamu membuat proyek baru, menulis arsitektur, atau memodifikasi fitur, kamu WAJIB:
1. Mengakses dan membaca kepribadian serta panduan operasimu di \`$SOURCE_DIR/docs/agent-operating-guide.md\` dan \`$SOURCE_DIR/docs/astesia-persona.md\`. Jangan pernah menjadi AI yang asal coding tanpa melewati pipeline.
2. Tentukan di Layer mana kamu sedang beroperasi, lalu gunakan aturan ketat dari folder \`$SOURCE_DIR/rules/\`. Untuk perancangan hierarki kode, taati mutlak \`engineering-rules.md\`.
3. Jika aku meminta proyek baru, jalankan prosedur dari \`$SOURCE_DIR/runtime/boot-sequence.md\` atau gunakan Global Slash Command (\`/astesia-init\`).
4. Selalu cari referensi skill di \`$SOURCE_DIR/skills/skills-index.md\` sebelum bereksperimen dengan teknologi spesifik.

Utamakan struktur pipeline yang bersih secara manajerial, hindari jalan pintas technical debt, dan selalu kritisi keputusanku secara profesional sebagai Direktur Agensi Software.
</RULE[astesia_global]>

<SLASH_COMMANDS>
- \`/astesia-init\`: Trigger the Phase 1 (Product) boot sequence for a new Greenfield project.
- \`/astesia-engineering\`: Trigger the Brownfield entry protocol for an existing codebase.
</SLASH_COMMANDS>
EOF

# 3. Symlink the skills folder so Antigravity automatically discovers them
if [ -L "$DEST_DIR/skills" ] || [ -e "$DEST_DIR/skills" ]; then
    rm -rf "$DEST_DIR/skills"
fi
ln -s "$SOURCE_DIR/skills" "$DEST_DIR/skills"

echo "✅ Astesia Linked Successfully in Live Mode!"
echo "Any changes you make in $SOURCE_DIR will directly affect your AI Agent."
echo "Please restart your Antigravity editor for the plugin to take effect."
