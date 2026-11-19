import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { isolatedEnv } from "../../../../templates/enforcement/tests/isolated-env";

const REPO_ROOT = "D:/Workspaces/Astesia";
const HEAD_COMMIT = spawnSync("git", ["-C", REPO_ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
console.log(`Running clean clone verification on commit: ${HEAD_COMMIT}...`);

const cleanDir = join(os.tmpdir(), `astesia-clean-final-${Date.now()}`);
mkdirSync(cleanDir, { recursive: true });

try {
  const env = isolatedEnv();
  console.log(`Extracting HEAD archive into ${cleanDir} with core.autocrlf=false...`);
  const archive = spawnSync("git", ["-C", REPO_ROOT, "-c", "core.autocrlf=false", "archive", HEAD_COMMIT], {
    env: env as NodeJS.ProcessEnv,
    maxBuffer: 50 * 1024 * 1024
  });
  if (archive.status !== 0) throw new Error(`Git archive failed: ${archive.stderr?.toString()}`);

  const tar = spawnSync("tar", ["-xf", "-", "-C", cleanDir], { input: archive.stdout });
  if (tar.status !== 0) throw new Error(`Tar extraction failed: ${tar.stderr?.toString()}`);

  // Set git config in cleanDir with core.autocrlf=false so any sub-git operations never mangle line endings
  spawnSync("git", ["init", "-q", "-b", "main", cleanDir], { env: env as NodeJS.ProcessEnv });
  spawnSync("git", ["-C", cleanDir, "config", "core.autocrlf", "false"], { env: env as NodeJS.ProcessEnv });

  console.log("Running all.ts --json in clean clone (including mutation testing)...");
  const testRes = spawnSync(process.execPath, ["templates/enforcement/tests/all.ts", "--json"], {
    cwd: cleanDir,
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });

  const outPath = join(REPO_ROOT, ".astesia/audit/wave2a.6/final-clean-clone-all.json");
  writeFileSync(outPath, testRes.stdout, "utf8");
  console.log(`Clean clone test finished with exit code ${testRes.status}. Output saved to ${outPath}.`);

  try {
    const parsed = JSON.parse(testRes.stdout);
    console.log(`Summary: total=${parsed.accounting?.total}, passed=${parsed.accounting?.passed}, failed=${parsed.accounting?.failed}, known_gaps=${parsed.accounting?.known_gaps}, invariant=${parsed.accounting?.invariant_holds}`);
    if (parsed.mutation_testing) {
      console.log(`Mutation summary: total=${parsed.mutation_testing.total}, killed=${parsed.mutation_testing.killed}, survived=${parsed.mutation_testing.survived}`);
    }
  } catch (e) {
    console.error("Failed to parse json output:", e);
  }

  if (testRes.status !== 0) {
    console.error("Clean clone tests failed!");
    process.exit(1);
  }
} finally {
  try {
    rmSync(cleanDir, { recursive: true, force: true });
  } catch {}
}
