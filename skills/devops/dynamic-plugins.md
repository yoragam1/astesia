---
name: "Dynamic Plugin Extensibility"
description: "Author and dynamically execute custom runtime scripts to extend Astesia's capabilities."
---
# Skill: Dynamic Plugin Extensibility

## 1. Metadata
- **Name:** `dynamic-plugins`
- **Origin:** `Astesia DevOps (Ceobe Upgrade Phase 2)`
- **Description:** Protocol for creating temporary or permanent tool scripts (Node.js/Python/Bash) that Astesia can execute at runtime to solve domain-specific problems that native Antigravity tools cannot handle natively. 

## 2. When to Use
Invoke this skill when:
- You need to perform a highly specialized task (e.g., parsing a weird proprietary binary format, interacting with a complex smart contract ABI).
- A native tool is failing repeatedly and you need to write a custom script to bypass the limitation.
- You need to automate a repetitive 10-step process into a single CLI command.

## 3. Practical Guidance

### Step 1: Identify the Capability Gap
If Astesia's default toolkit (read_file, write_file, run_command, etc.) is insufficient or inefficient for a task, pause execution.

### Step 2: Author the Custom Script (The Plugin)
Write a focused, single-purpose script in the `scratch/` directory (or a project-specific `.astesia/plugins` folder).
- Use TypeScript/Node.js or Python.
- Ensure the script takes arguments via CLI (e.g., `process.argv`).
- Ensure the script outputs structured JSON to `stdout` so Astesia can easily parse the result.

**Example Plugin (`.astesia/plugins/parse-abi.js`):**
```javascript
const fs = require('fs');
const abi = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
const functions = abi.filter(item => item.type === 'function').map(f => f.name);
console.log(JSON.stringify({ functions }));
```

### Step 3: Execute via `run_command`
Instead of struggling manually, execute your new dynamic plugin using the `run_command` tool:
```bash
node .astesia/plugins/parse-abi.js ./contracts/MyToken.json
```

### Step 4: Promote to Permanent Skill (Optional)
If the plugin is highly successful and reusable, write a corresponding `[plugin-name].md` file in `skills/devops/` explaining how other Agents can use this new script.

## 4. Anti-Patterns
- ❌ **Over-engineering:** Do not write a massive 500-line framework. Plugins should be tiny, disposable scripts.
- ❌ **Silent Failures:** The plugin must `console.error` and `process.exit(1)` on failure, otherwise Astesia will think the task succeeded.
- ❌ **Security Blindspots:** Never write plugins that blindly execute unsanitized string inputs as shell commands.
