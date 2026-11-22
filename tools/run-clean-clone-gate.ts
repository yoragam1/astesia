import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export function runCleanCloneGate(outputFile?: string): string {
  console.log("Running clean clone gate test...");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "astesia-clean-clone-"));
  const emptyHome = path.join(tmpDir, "empty-home");
  fs.mkdirSync(emptyHome, { recursive: true });

  const cloneDir = path.join(tmpDir, "repo");
  const repoRoot = path.resolve(".");

  console.log(`Cloning repo with core.autocrlf=false into: ${cloneDir}`);
  execSync(`git clone -c core.autocrlf=false --no-hardlinks "${repoRoot}" "${cloneDir}"`, { stdio: "inherit" });

  console.log("Running templates/enforcement/tests/all.ts --json in isolated clone...");
  let testOutput = "";
  const env = {
    ...process.env,
    HOME: emptyHome,
    USERPROFILE: emptyHome,
    XDG_CONFIG_HOME: path.join(emptyHome, "xdg"),
    GIT_CONFIG_GLOBAL: path.join(emptyHome, "gitconfig-global"),
    GIT_CONFIG_SYSTEM: path.join(emptyHome, "gitconfig-system"),
  };

  try {
    testOutput = execSync("bun templates/enforcement/tests/all.ts --json", {
      cwd: cloneDir,
      encoding: "utf8",
      env,
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err: any) {
    testOutput = err.stdout ? err.stdout.toString() : err.message;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e: any) {
      console.warn("Cleanup warning:", e.message);
    }
  }

  if (outputFile) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, testOutput.trim() + "\n", "utf8");
    console.log(`Saved clean clone output to ${outputFile}`);
  }

  return testOutput;
}

if (import.meta.main) {
  const targetFile = process.argv[2] || ".astesia/audit/wave3c/clean-clone-start.json";
  runCleanCloneGate(targetFile);
}
