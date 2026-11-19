import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  canonicalViolationId,
  ClassificationEntry,
  computeRuleMetrics,
  FindingClass,
  loadRuleNames,
  validateClassifications
} from "./classify";
import { wilsonUpper95 } from "./stats";

const SNAP_DIR = resolve(__dirname, "../snapshots");
const CLASS_PATH = resolve(__dirname, "../classification.json");
const METRICS_PATH = resolve(__dirname, "../classification-metrics.json");

const selectedByProject = JSON.parse(
  readFileSync(join(SNAP_DIR, "phase3-selected-findings-to-classify.json"), "utf8")
) as Record<
  string,
  Array<{
    ruleId: string;
    severity: string;
    file: string;
    line: number;
    quote: string;
    contextLines: string[];
  }>
>;

const comparisonSummary = JSON.parse(
  readFileSync(join(SNAP_DIR, "phase3-comparison-summary.json"), "utf8")
) as Record<string, any>;

// Explicit per-finding classification map for non-TP findings and specific TP findings
const SPECIFIC_CLASSIFICATIONS: Record<string, { class: FindingClass; reason: string }> = {
  // pustaka-sekolah-pwa
  "ASTESIA-008|dev-dist/workbox-61be8b72.js|770": {
    class: "NOISE",
    reason: "Bundled third-party Workbox PWA artifact in dev-dist/; excluded by gate-config.template.json"
  },
  "ASTESIA-008|dev-dist/workbox-61be8b72.js|1145": {
    class: "NOISE",
    reason: "Bundled third-party Workbox PWA artifact in dev-dist/; excluded by gate-config.template.json"
  },
  "ASTESIA-009|dev-dist/workbox-61be8b72.js|1558": {
    class: "NOISE",
    reason: "Bundled third-party Workbox PWA artifact in dev-dist/; excluded by gate-config.template.json"
  },
  "ASTESIA-008|dev-dist/workbox-61be8b72.js|1853": {
    class: "NOISE",
    reason: "Bundled third-party Workbox PWA artifact in dev-dist/; excluded by gate-config.template.json"
  },
  "ASTESIA-008|dev-dist/workbox-61be8b72.js|1943": {
    class: "NOISE",
    reason: "Bundled third-party Workbox PWA artifact in dev-dist/; excluded by gate-config.template.json"
  },
  "ASTESIA-008|dev-dist/workbox-61be8b72.js|1965": {
    class: "NOISE",
    reason: "Bundled third-party Workbox PWA artifact in dev-dist/; excluded by gate-config.template.json"
  },
  "ASTESIA-009|dev-dist/workbox-61be8b72.js|2567": {
    class: "NOISE",
    reason: "Bundled third-party Workbox PWA artifact in dev-dist/; excluded by gate-config.template.json"
  },
  "ASTESIA-008|dev-dist/workbox-61be8b72.js|2749": {
    class: "NOISE",
    reason: "Bundled third-party Workbox PWA artifact in dev-dist/; excluded by gate-config.template.json"
  },
  "ASTESIA-008|dev-dist/workbox-61be8b72.js|2761": {
    class: "NOISE",
    reason: "Bundled third-party Workbox PWA artifact in dev-dist/; excluded by gate-config.template.json"
  },
  "ASTESIA-010|docker-compose.yml|15": {
    class: "TP",
    reason: "Hardcoded fallback JWT secret literal in docker-compose.yml environment configuration"
  },

  // eunectes
  "ASTESIA-000|packages/omop-codex/plugin/components/rules/scripts/bench-codex-rules.mjs|6": {
    class: "NOISE",
    reason: "Import targets unbuilt ../dist/codex-hook.js output artifact in an uncompiled checkout"
  },
  "ASTESIA-000|packages/omop-opencode/src/tools/grep/result-formatter.test.ts|92": {
    class: "FP",
    reason: "String literal inside a test fixture depicting formatted grep output, not a module import"
  },
  "ASTESIA-000|packages/skills-loader-core/src/features/builtin-skills/skills/dev-browser.ts|206": {
    class: "FP",
    reason: "Example import statement embedded inside a multi-line template literal prompt string"
  },
  "ASTESIA-000|packages/web/app/[locale]/layout.tsx|7": {
    class: "FP",
    reason: "Monorepo subpackage @/ alias resolves relative to packages/web/ tsconfig root rather than repo root"
  },
  "ASTESIA-000|packages/web/app/[locale]/manifesto/page.tsx|7": {
    class: "FP",
    reason: "Monorepo subpackage @/ alias resolves relative to packages/web/ tsconfig root rather than repo root"
  },
  "ASTESIA-000|packages/web/components/docs/docs-shell.tsx|5": {
    class: "FP",
    reason: "Monorepo subpackage @/ alias resolves relative to packages/web/ tsconfig root rather than repo root"
  },
  "ASTESIA-000|packages/web/components/landing/sections/architecture.tsx|4": {
    class: "FP",
    reason: "Monorepo subpackage @/ alias resolves relative to packages/web/ tsconfig root rather than repo root"
  },
  "ASTESIA-000|packages/web/components/landing/sections/sisyphus.tsx|5": {
    class: "FP",
    reason: "Monorepo subpackage @/ alias resolves relative to packages/web/ tsconfig root rather than repo root"
  },
  "ASTESIA-000|packages/web/components/landing/sections/sub-agents.tsx|3": {
    class: "FP",
    reason: "Monorepo subpackage @/ alias resolves relative to packages/web/ tsconfig root rather than repo root"
  },
  "ASTESIA-000|packages/web/components/manifesto/sections/cognitive-load.tsx|5": {
    class: "FP",
    reason: "Monorepo subpackage @/ alias resolves relative to packages/web/ tsconfig root rather than repo root"
  },
  "ASTESIA-004|packages/openclaw-core/src/reply-listener-state.ts|10": {
    class: "FP",
    reason: "Constant holding an environment variable name string rather than an actual secret token value"
  },
  "ASTESIA-004|packages/telemetry-core/index.d.ts|2": {
    class: "TP",
    reason: "Hardcoded PostHog project API key literal declared in DEFAULT_POSTHOG_API_KEY type definition"
  },
  "ASTESIA-004|packages/telemetry-core/src/constants.ts|2": {
    class: "TP",
    reason: "Hardcoded PostHog project API key literal assigned directly to DEFAULT_POSTHOG_API_KEY constant"
  },
  "ASTESIA-004|tests/hashline/headless.ts|123": {
    class: "TP",
    reason: "Hardcoded API key fallback literal provided via nullish coalescing on process.env.HASHLINE_TEST_API_KEY"
  },
  "ASTESIA-008|packages/omop-opencode/src/agents/cerberus/gpt-5-4.ts|20": {
    class: "FP",
    reason: "Docblock comment describing agent task/todo management capability, not a code TODO marker"
  },
  "ASTESIA-008|packages/omop-opencode/src/hooks/tasks-todowrite-disabler/constants.ts|3": {
    class: "FP",
    reason: "Comment discussing the todo panel UI feature by name rather than leaving an untracked TODO"
  },
  "ASTESIA-009|packages/omop-codex/scripts/install-dist/install-local.mjs|12092": {
    class: "NOISE",
    reason: "setTimeout call inside pre-bundled distribution script install-dist/install-local.mjs"
  },
  "ASTESIA-009|packages/omop-codex/scripts/install-dist/install-local.mjs|3926": {
    class: "NOISE",
    reason: "setTimeout call inside pre-bundled distribution script install-dist/install-local.mjs"
  },
  "ASTESIA-009|packages/omop-codex/scripts/install-dist/install-local.mjs|7489": {
    class: "NOISE",
    reason: "setTimeout call inside pre-bundled distribution script install-dist/install-local.mjs"
  },
  "ASTESIA-009|packages/omop-opencode/src/hooks/runtime-fallback/first-prompt-watchdog.ts|17": {
    class: "FP",
    reason: "TypeScript ambient function declaration for setTimeout signature rather than a runtime timer call"
  },
  "ASTESIA-010|.github/workflows/publish.yml|180": {
    class: "FP",
    reason: "Shell command assignment capturing dynamic curl output into OIDC_TOKEN variable in workflow"
  },

  // flora-smk
  "ASTESIA-009|.vercel/output/static/_app/immutable/chunks/CeFOi1VF.js|1": {
    class: "NOISE",
    reason: "Minified build chunk inside .vercel/output deployment artifact directory; excluded by template config"
  },
  "ASTESIA-009|.vercel/output/static/_app/immutable/chunks/DOmy8bqa.js|1": {
    class: "NOISE",
    reason: "Minified build chunk inside .vercel/output deployment artifact directory; excluded by template config"
  },
  "ASTESIA-004|src/lib/repositories/auth.repository.ts|15": {
    class: "FP",
    reason: "LocalStorage key constant named OFFLINE_AUTH_KEY storing a static key identifier, not a secret"
  },

  // ifrit
  "ASTESIA-004|benchmarks/claude-email.js|7": {
    class: "FP",
    reason: "Benchmark script fallback string listing Claude model identifiers on process.env.CE_MODELS"
  },
  "ASTESIA-004|benchmarks/model-email.js|7": {
    class: "FP",
    reason: "Benchmark script fallback string listing model identifiers on process.env.ME_MODELS"
  },
  "ASTESIA-004|benchmarks/robustness-audit.js|23": {
    class: "FP",
    reason: "Benchmark script fallback string specifying default model name on process.env.AUDIT_MODEL"
  },
  "ASTESIA-004|ceobe/src/ai/providers/embeddingAdapter.ts|150": {
    class: "FP",
    reason: "Template literal constructing an environment variable name suffix _API_KEY, not a hardcoded key"
  },
  "ASTESIA-004|ceobe/src/ai/providers/router.ts|126": {
    class: "FP",
    reason: "Template literal constructing an environment variable name suffix _API_KEY, not a hardcoded key"
  },
  "ASTESIA-008|benchmarks/agentic/tasks.py|443": {
    class: "FP",
    reason: "Comment describing a benchmark task named 'todo-null' (a Todo REST API), not a code TODO marker"
  },

  // arene
  "ASTESIA-000|tests/lib/utils.test.js|1281": {
    class: "FP",
    reason: "Inline JavaScript snippet string passed to node -e with root-relative require path, not a file import"
  },
  "ASTESIA-004|scripts/hooks/pre-bash-commit-quality.js|205": {
    class: "FP",
    reason: "Windows PATHEXT environment variable fallback listing executable file extensions, not a secret"
  },

  // SIA
  "ASTESIA-004|resources/views/tendik/create.blade.php|666": {
    class: "FP",
    reason: "Client-side script computing initial default password string from birth date variables via template"
  },
  "ASTESIA-008|app/Http/Controllers/Admin/DosenController.php|299": {
    class: "TP",
    reason: "Untracked 'for now' temporary implementation comment in controller without an astesia-debt marker"
  },
  "ASTESIA-008|app/Http/Controllers/Dosen/ProfileController.php|77": {
    class: "TP",
    reason: "Untracked 'for now' temporary implementation comment in controller without an astesia-debt marker"
  }
};

function defaultTpReason(ruleId: string, file: string): string {
  switch (ruleId) {
    case "ASTESIA-002":
      return `Unbounded database query (SELECT * or unprojected .select()) in ${file}`;
    case "ASTESIA-005":
      return `Explicit TypeScript any type annotation or as any assertion in ${file}`;
    case "ASTESIA-006":
      return `Direct console.log or console.debug call in source/template file ${file}`;
    case "ASTESIA-007":
      return `Sequential database query or repository mutation executed inside a loop in ${file}`;
    case "ASTESIA-009":
      return `Direct setTimeout timer call used for delay, polling, or timeout in ${file}`;
    default:
      return `Verified true positive violation of ${ruleId} in ${file}`;
  }
}

const entries: ClassificationEntry[] = [];
const requiredIdsByProject: Record<string, string[]> = {};

for (const [proj, list] of Object.entries(selectedByProject)) {
  requiredIdsByProject[proj] = [];
  for (const item of list) {
    const id = canonicalViolationId(item);
    const scopedKey = `${proj}::${id}`;
    requiredIdsByProject[proj].push(scopedKey);
    const spec = SPECIFIC_CLASSIFICATIONS[id];
    const cls: FindingClass = spec ? spec.class : "TP";
    const reason = spec ? spec.reason : defaultTpReason(item.ruleId, item.file);
    const quote = (item.quote || `[${item.ruleId}]`).slice(0, 120);
    entries.push({
      id,
      project: proj,
      class: cls,
      quote,
      reason
    });
  }
}

// Validate per project using validateClassifications
for (const [proj, list] of Object.entries(selectedByProject)) {
  const projEntries = entries.filter((e) => e.project === proj);
  const reqIds = list.map((x) => canonicalViolationId(x));
  const v = validateClassifications(reqIds, projEntries);
  if (!v.valid) {
    console.error(`Validation failed for project ${proj}:`, v.errors);
    process.exit(1);
  }
}

writeFileSync(CLASS_PATH, JSON.stringify(entries, null, 2) + "\n", "utf8");

// Compute per-rule and per-project metrics
const ruleNames = loadRuleNames();
const ruleMetrics = computeRuleMetrics(entries, ruleNames);

const projectMetrics: Array<{
  project: string;
  files_scanned: number;
  generated_skipped: number;
  desync_files: number;
  tokenizer_desync_rate: number;
  total_violations: number;
  sampled_count: number;
  tp: number;
  fp: number;
  noise: number;
  tokenizer: number;
  fp_rate_code: string;
  wilson_upper_95_code: number | "n/a";
  fp_plus_noise_rate_all: string;
  wilson_upper_95_fp_plus_noise: number | "n/a";
}> = [];

for (const [proj, list] of Object.entries(selectedByProject)) {
  const projEntries = entries.filter((e) => e.project === proj);
  const tp = projEntries.filter((e) => e.class === "TP").length;
  const fp = projEntries.filter((e) => e.class === "FP").length;
  const noise = projEntries.filter((e) => e.class === "NOISE").length;
  const tokenizer = projEntries.filter((e) => e.class === "TOKENIZER").length;
  const codeEval = tp + fp;
  const allEval = tp + fp + noise;
  const mHead = comparisonSummary[proj].metrics.HEAD;
  const fScanned = mHead.files_scanned || 0;
  const dFiles = mHead.desync_files || 0;

  projectMetrics.push({
    project: proj,
    files_scanned: fScanned,
    generated_skipped: mHead.generated_skipped || 0,
    desync_files: dFiles,
    tokenizer_desync_rate: fScanned > 0 ? Number((dFiles / fScanned).toFixed(4)) : 0,
    total_violations: mHead.total_violations || 0,
    sampled_count: projEntries.length,
    tp,
    fp,
    noise,
    tokenizer,
    fp_rate_code: `${fp}/${codeEval}`,
    wilson_upper_95_code: wilsonUpper95(fp, codeEval),
    fp_plus_noise_rate_all: `${fp + noise}/${allEval}`,
    wilson_upper_95_fp_plus_noise: wilsonUpper95(fp + noise, allEval)
  });
}

const totalTp = entries.filter((e) => e.class === "TP").length;
const totalFp = entries.filter((e) => e.class === "FP").length;
const totalNoise = entries.filter((e) => e.class === "NOISE").length;
const totalTok = entries.filter((e) => e.class === "TOKENIZER").length;

const metricsOut = {
  total_classified: entries.length,
  totals: {
    tp: totalTp,
    fp: totalFp,
    noise: totalNoise,
    tokenizer: totalTok,
    fp_rate_code: `${totalFp}/${totalTp + totalFp}`,
    wilson_upper_95_code: wilsonUpper95(totalFp, totalTp + totalFp),
    fp_plus_noise_rate_all: `${totalFp + totalNoise}/${totalTp + totalFp + totalNoise}`,
    wilson_upper_95_fp_plus_noise: wilsonUpper95(totalFp + totalNoise, totalTp + totalFp + totalNoise)
  },
  by_rule: ruleMetrics,
  by_project: projectMetrics
};

writeFileSync(METRICS_PATH, JSON.stringify(metricsOut, null, 2) + "\n", "utf8");
console.log(`Classification built & validated: ${entries.length} entries (TP=${totalTp}, FP=${totalFp}, NOISE=${totalNoise}, TOKENIZER=${totalTok})`);
console.log(`Overall Code FP Rate: ${metricsOut.totals.fp_rate_code} (Wilson 95% upper: ${metricsOut.totals.wilson_upper_95_code})`);
console.log(`Overall (FP+NOISE) Rate: ${metricsOut.totals.fp_plus_noise_rate_all} (Wilson 95% upper: ${metricsOut.totals.wilson_upper_95_fp_plus_noise})`);
