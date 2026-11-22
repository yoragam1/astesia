import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execSync } from "child_process";

interface ManifestEntry {
  path: string;
  sha256: string;
  bytes: number;
  commit?: string;
  description?: string;
}

interface Manifest {
  timestamp: string;
  wave: string;
  head_commit: string;
  files: ManifestEntry[];
}

function computeSha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function verifySingleManifest(manifestPath: string): number {
  console.log(`\n=== VERIFYING AUDIT MANIFEST: ${manifestPath} ===`);
  if (!fs.existsSync(manifestPath)) {
    console.error(`ERROR: Manifest file not found: ${manifestPath}`);
    return 1;
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  console.log(`Loaded manifest for wave: ${manifest.wave}, head_commit: ${manifest.head_commit}`);
  console.log(`Registered files count: ${manifest.files.length}`);

  let errors = 0;

  // 1. Verify each file in manifest exists and matches SHA-256 and byte count
  for (const entry of manifest.files) {
    const fullPath = path.resolve(entry.path);
    if (!fs.existsSync(fullPath)) {
      console.error(`[FAIL] Registered file missing on disk: ${entry.path}`);
      errors++;
      continue;
    }

    const stat = fs.statSync(fullPath);
    if (stat.size !== entry.bytes) {
      console.error(`[FAIL] Byte count mismatch for ${entry.path}: manifest=${entry.bytes}, disk=${stat.size}`);
      errors++;
    }

    const actualSha = computeSha256(fullPath);
    if (actualSha !== entry.sha256) {
      console.error(`[FAIL] SHA-256 mismatch for ${entry.path}:\n  manifest: ${entry.sha256}\n  actual:   ${actualSha}`);
      errors++;
    } else {
      console.log(`[PASS] ${entry.path} (${entry.bytes} bytes, SHA verified)`);
    }
  }

  // 2. Check corresponding report references if report exists
  const reportPath = path.resolve(`.astesia/audit/${manifest.wave}-report.md`);
  if (fs.existsSync(reportPath)) {
    console.log(`\nChecking .astesia/audit/** references in ${manifest.wave}-report.md...`);
    const reportText = fs.readFileSync(reportPath, "utf8");
    const manifestPathSet = new Set(manifest.files.map(f => f.path.replace(/\\/g, "/")));

    const refRegex = /\.astesia\/audit\/[a-zA-Z0-9_\-\.\/]+/g;
    const matches = reportText.match(refRegex) || [];
    const uniqueRefs = [...new Set(matches)];

    const wavePrefix = `.astesia/audit/${manifest.wave}/`;

    for (const ref of uniqueRefs) {
      const cleanRef = ref.replace(/[\),:`"'\*]/g, "").trim();
      if (cleanRef.endsWith("/") || cleanRef === `${wavePrefix}MANIFEST.json`) continue;

      if (!fs.existsSync(cleanRef)) {
        if (cleanRef.startsWith(wavePrefix)) {
          console.error(`[FAIL] Report references non-existent ${manifest.wave} file: ${cleanRef}`);
          errors++;
        }
        continue;
      }

      if (cleanRef.startsWith(wavePrefix) && !manifestPathSet.has(cleanRef)) {
        console.error(`[FAIL] File referenced in report but missing from MANIFEST.json: ${cleanRef}`);
        errors++;
      }
    }
  }

  return errors;
}

function verifyManifest() {
  const args = process.argv.slice(2);
  let targetWave = "";
  const waveIdx = args.indexOf("--wave");
  if (waveIdx !== -1 && args[waveIdx + 1]) {
    targetWave = args[waveIdx + 1];
  }

  let totalErrors = 0;
  if (targetWave) {
    const manifestPath = path.resolve(`.astesia/audit/${targetWave}/MANIFEST.json`);
    totalErrors += verifySingleManifest(manifestPath);
  } else {
    // Check known/available manifests
    const auditDir = path.resolve(".astesia/audit");
    if (fs.existsSync(auditDir)) {
      const subdirs = fs.readdirSync(auditDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      for (const w of subdirs) {
        const mPath = path.join(auditDir, w, "MANIFEST.json");
        if (fs.existsSync(mPath)) {
          totalErrors += verifySingleManifest(mPath);
        }
      }
    }
  }

  if (totalErrors > 0) {
    console.error(`\nManifest verification FAILED with ${totalErrors} error(s).`);
    process.exit(1);
  }

  console.log("\n[SUCCESS] Manifest verification passed cleanly! All registered files match disk.");
}

verifyManifest();
