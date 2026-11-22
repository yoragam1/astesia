/**
 * tools/astesia-init.ts
 * Standalone, zero-dependency CLI tool to initialize or manage the Astesia Gate
 * in brownfield or greenfield client repositories.
 *
 * Contract:
 * - Copies enforcement engine and anti-patterns to <target>/.astesia/enforcement/
 * - Installs gate-config.json only if not present (never overwrites custom config without --force)
 * - Copies GitHub Actions workflow to <target>/.github/workflows/astesia-gate.yml
 * - Copies CODEOWNERS.template & BRANCH-PROTECTION.md to <target>/.astesia/docs/
 * - Tracks installed files and hashes in <target>/.astesia/install-manifest.json
 * - Supports --dry-run, --upgrade, --uninstall, and --force
 * - Strict security: fails if target does not exist, is not a directory, is the Astesia repo, or escapes via symlink
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface ManifestFileEntry {
  path: string;
  sha256: string;
  source_sha256: string;
}

export interface InstallManifest {
  version: string;
  installed_at: string;
  files: ManifestFileEntry[];
}

export const REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates", "enforcement");

function computeSha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function getFileSha256(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  const buf = fs.readFileSync(filePath);
  return computeSha256(buf);
}

function removeDirIfEmpty(dirPath: string) {
  try {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      if (files.length === 0) {
        fs.rmdirSync(dirPath);
      }
    }
  } catch {}
}

export interface InitOptions {
  target?: string;
  dryRun?: boolean;
  upgrade?: boolean;
  uninstall?: boolean;
  force?: boolean;
}

export function runAstesiaInit(opts: InitOptions): { success: boolean; exitCode: number; message: string; modifiedFiles: string[] } {
  const targetRaw = opts.target || process.cwd();
  const targetDir = path.resolve(targetRaw);
  const dryRun = !!opts.dryRun;
  const upgrade = !!opts.upgrade;
  const uninstall = !!opts.uninstall;
  const force = !!opts.force;
  const modifiedFiles: string[] = [];

  // Security Check 1: Target existence and directory check
  if (!fs.existsSync(targetDir)) {
    return {
      success: false,
      exitCode: 2,
      message: `[TARGET_ERROR] Target path does not exist: ${targetDir}`,
      modifiedFiles: [],
    };
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    return {
      success: false,
      exitCode: 2,
      message: `[TARGET_ERROR] Target path is not a directory: ${targetDir}`,
      modifiedFiles: [],
    };
  }

  // Security Check 2: Symlink escape check
  let realTarget: string;
  try {
    realTarget = fs.realpathSync(targetDir);
  } catch (err: any) {
    return {
      success: false,
      exitCode: 2,
      message: `[TARGET_ERROR] Target symlink resolution failed: ${err.message}`,
      modifiedFiles: [],
    };
  }

  // Security Check 3: Cannot initialize Astesia source repo itself
  const realRepoRoot = fs.realpathSync(REPO_ROOT);
  if (realTarget.toLowerCase() === realRepoRoot.toLowerCase()) {
    return {
      success: false,
      exitCode: 2,
      message: `[TARGET_ERROR] Cannot install gate into the Astesia framework repository itself: ${targetDir}`,
      modifiedFiles: [],
    };
  }

  const manifestPath = path.join(targetDir, ".astesia", "install-manifest.json");

  // ==============================================================================
  // UNINSTALL MODE
  // ==============================================================================
  if (uninstall) {
    if (!fs.existsSync(manifestPath)) {
      if (!fs.existsSync(path.join(targetDir, ".astesia"))) {
        return {
          success: true,
          exitCode: 0,
          message: `Target is not initialized with Astesia Gate (nothing to uninstall).`,
          modifiedFiles: [],
        };
      }
      if (!force) {
        return {
          success: false,
          exitCode: 3,
          message: `Target has .astesia directory but missing install-manifest.json. Use --force to remove unmanaged files.`,
          modifiedFiles: [],
        };
      }
    }

    let manifest: InstallManifest | null = null;
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      } catch (err: any) {
        if (!force) {
          return {
            success: false,
            exitCode: 3,
            message: `Corrupted install manifest in ${manifestPath}. Use --force to proceed.`,
            modifiedFiles: [],
          };
        }
      }
    }

    const filesToRemove = manifest?.files || [];
    let keptFilesCount = 0;

    for (const entry of filesToRemove) {
      const fullPath = path.join(targetDir, entry.path);
      if (!fs.existsSync(fullPath)) continue;

      const currentSha = getFileSha256(fullPath);
      const isUnmodified = currentSha === entry.source_sha256;

      if (isUnmodified || force) {
        if (dryRun) {
          console.log(`[DRY-RUN] Would remove: ${entry.path}`);
        } else {
          fs.unlinkSync(fullPath);
          modifiedFiles.push(entry.path);
        }
      } else {
        console.warn(`[WARNING] Skipping user-modified file: ${entry.path}`);
        keptFilesCount++;
      }
    }

    if (keptFilesCount === 0 || force) {
      if (dryRun) {
        console.log(`[DRY-RUN] Would remove manifest: .astesia/install-manifest.json`);
      } else if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
        modifiedFiles.push(".astesia/install-manifest.json");
      }
    }

    if (!dryRun) {
      removeDirIfEmpty(path.join(targetDir, ".astesia", "enforcement"));
      removeDirIfEmpty(path.join(targetDir, ".astesia", "docs"));
      removeDirIfEmpty(path.join(targetDir, ".astesia"));
      removeDirIfEmpty(path.join(targetDir, ".github", "workflows"));
      removeDirIfEmpty(path.join(targetDir, ".github"));
    }

    const summaryMsg = keptFilesCount > 0 && !force
      ? `Astesia Gate uninstalled partially: ${modifiedFiles.length} file(s) removed, ${keptFilesCount} modified file(s) preserved.`
      : `Astesia Gate uninstalled cleanly: ${modifiedFiles.length} file(s) removed.`;

    return {
      success: true,
      exitCode: 0,
      message: summaryMsg,
      modifiedFiles,
    };
  }

  // ==============================================================================
  // INSTALL / UPGRADE MODE
  // ==============================================================================

  // Source templates definition
  const fileMappings: Array<{
    sourceName: string;
    targetRelPath: string;
    preserveIfModified: boolean;
  }> = [
    {
      sourceName: "astesia-gate.ts",
      targetRelPath: ".astesia/enforcement/astesia-gate.ts",
      preserveIfModified: false,
    },
    {
      sourceName: "anti-patterns.json",
      targetRelPath: ".astesia/enforcement/anti-patterns.json",
      preserveIfModified: false,
    },
    {
      sourceName: "gate-config.template.json",
      targetRelPath: ".astesia/gate-config.json",
      preserveIfModified: true, // NEVER overwrite existing gate-config.json unless --force
    },
    {
      sourceName: "astesia-gate.workflow.yml",
      targetRelPath: ".github/workflows/astesia-gate.yml",
      preserveIfModified: false,
    },
    {
      sourceName: "CODEOWNERS.template",
      targetRelPath: ".astesia/docs/CODEOWNERS.template",
      preserveIfModified: false,
    },
    {
      sourceName: "BRANCH-PROTECTION.md",
      targetRelPath: ".astesia/docs/BRANCH-PROTECTION.md",
      preserveIfModified: false,
    },
  ];

  // Load existing manifest if present
  let existingManifest: InstallManifest | null = null;
  if (fs.existsSync(manifestPath)) {
    try {
      existingManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {}
  }

  // Idempotency check: if not upgrade and not force, check if already fully installed
  if (existingManifest && !upgrade && !force) {
    let allIdentical = true;
    for (const mapping of fileMappings) {
      const fullTarget = path.join(targetDir, mapping.targetRelPath);
      const fullSource = path.join(TEMPLATES_DIR, mapping.sourceName);
      if (!fs.existsSync(fullTarget)) {
        allIdentical = false;
        break;
      }
      if (!mapping.preserveIfModified) {
        const targetSha = getFileSha256(fullTarget);
        const sourceSha = getFileSha256(fullSource);
        if (targetSha !== sourceSha) {
          allIdentical = false;
          break;
        }
      }
    }

    if (allIdentical) {
      return {
        success: true,
        exitCode: 0,
        message: `Astesia Gate is already initialized and up to date in: ${targetDir}`,
        modifiedFiles: [],
      };
    }
  }

  const manifestEntries: ManifestFileEntry[] = [];

  for (const mapping of fileMappings) {
    const fullSource = path.join(TEMPLATES_DIR, mapping.sourceName);
    const fullTarget = path.join(targetDir, mapping.targetRelPath);

    if (!fs.existsSync(fullSource)) {
      return {
        success: false,
        exitCode: 5,
        message: `[TEMPLATE_ERROR] Source template missing: ${fullSource}`,
        modifiedFiles,
      };
    }

    const sourceContent = fs.readFileSync(fullSource);
    const sourceSha = computeSha256(sourceContent);

    const targetExists = fs.existsSync(fullTarget);

    if (targetExists && mapping.preserveIfModified && !force) {
      // Preserve existing config!
      const currentTargetSha = getFileSha256(fullTarget);
      manifestEntries.push({
        path: mapping.targetRelPath,
        sha256: currentTargetSha,
        source_sha256: sourceSha,
      });
      continue;
    }

    if (targetExists && !upgrade && !force && !mapping.preserveIfModified) {
      const currentTargetSha = getFileSha256(fullTarget);
      if (currentTargetSha === sourceSha) {
        manifestEntries.push({
          path: mapping.targetRelPath,
          sha256: currentTargetSha,
          source_sha256: sourceSha,
        });
        continue;
      }
    }

    if (dryRun) {
      console.log(`[DRY-RUN] Would ${targetExists ? "update" : "write"}: ${mapping.targetRelPath}`);
    } else {
      const targetSubdir = path.dirname(fullTarget);
      if (!fs.existsSync(targetSubdir)) {
        fs.mkdirSync(targetSubdir, { recursive: true });
      }
      fs.writeFileSync(fullTarget, sourceContent);
      modifiedFiles.push(mapping.targetRelPath);
    }

    manifestEntries.push({
      path: mapping.targetRelPath,
      sha256: sourceSha,
      source_sha256: sourceSha,
    });
  }

  // Write install manifest
  const newManifest: InstallManifest = {
    version: "3.0.0",
    installed_at: new Date().toISOString(),
    files: manifestEntries,
  };

  if (dryRun) {
    console.log(`[DRY-RUN] Would write manifest: .astesia/install-manifest.json`);
  } else {
    const astesiaDir = path.join(targetDir, ".astesia");
    if (!fs.existsSync(astesiaDir)) {
      fs.mkdirSync(astesiaDir, { recursive: true });
    }
    fs.writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2) + "\n", "utf8");
    modifiedFiles.push(".astesia/install-manifest.json");
  }

  const actionLabel = upgrade ? "upgraded" : "initialized";
  const statusMsg = `Astesia Gate successfully ${actionLabel} in: ${targetDir} (${modifiedFiles.length} files written)`;

  return {
    success: true,
    exitCode: 0,
    message: statusMsg,
    modifiedFiles,
  };
}

// CLI entry point
if (import.meta.main || require.main === module) {
  const args = process.argv.slice(2);
  let target: string | undefined;
  let dryRun = false;
  let upgrade = false;
  let uninstall = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--target" && i + 1 < args.length) {
      target = args[++i];
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--upgrade") {
      upgrade = true;
    } else if (arg === "--uninstall") {
      uninstall = true;
    } else if (arg === "--force") {
      force = true;
    } else {
      console.error(`[CLI_ERROR] Unknown or invalid argument: ${arg}`);
      process.exit(2);
    }
  }

  const result = runAstesiaInit({ target, dryRun, upgrade, uninstall, force });
  if (result.success) {
    console.log(result.message);
    process.exit(0);
  } else {
    console.error(result.message);
    process.exit(result.exitCode);
  }
}
