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

function verifyManifest() {
  console.log("=== VERIFYING AUDIT MANIFEST ===");
  const manifestPath = path.resolve(".astesia/audit/wave3a/MANIFEST.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`ERROR: Manifest file not found: ${manifestPath}`);
    process.exit(1);
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

  // 2. Check wave3a-report.md references
  const reportPath = path.resolve(".astesia/audit/wave3a-report.md");
  if (fs.existsSync(reportPath)) {
    console.log("\nChecking .astesia/audit/** references in wave3a-report.md...");
    const reportText = fs.readFileSync(reportPath, "utf8");
    const manifestPathSet = new Set(manifest.files.map(f => f.path.replace(/\\/g, "/")));

    const refRegex = /\.astesia\/audit\/[a-zA-Z0-9_\-\.\/]+/g;
    const matches = reportText.match(refRegex) || [];
    const uniqueRefs = [...new Set(matches)];

    for (const ref of uniqueRefs) {
      // Normalize ref
      const cleanRef = ref.replace(/[\),:`"'\*]/g, "").trim();
      // Skip directory references ending with / or MANIFEST.json itself
      if (cleanRef.endsWith("/") || cleanRef === ".astesia/audit/wave3a/MANIFEST.json") continue;

      if (!fs.existsSync(cleanRef)) {
        // Only warn/fail if it refers to a wave3a audit artifact that should exist
        if (cleanRef.startsWith(".astesia/audit/wave3a/")) {
          console.error(`[FAIL] Report references non-existent wave3a file: ${cleanRef}`);
          errors++;
        }
        continue;
      }

      if (cleanRef.startsWith(".astesia/audit/wave3a/") && !manifestPathSet.has(cleanRef)) {
        console.error(`[FAIL] Wave 3A file referenced in report but missing from MANIFEST.json: ${cleanRef}`);
        errors++;
      }
    }
  }

  if (errors > 0) {
    console.error(`\nManifest verification FAILED with ${errors} error(s).`);
    process.exit(1);
  }

  console.log("\n[SUCCESS] Manifest verification passed cleanly! All registered files match disk.");
}

verifyManifest();
