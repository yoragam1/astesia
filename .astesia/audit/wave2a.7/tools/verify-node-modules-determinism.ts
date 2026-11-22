import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const gateScript = resolve(__dirname, "../../../../templates/enforcement/astesia-gate.ts");
const rulesPath = resolve(__dirname, "../../../../templates/enforcement/anti-patterns.json");

export function testNodeModulesDeterminism(): boolean {
  const testDir = join(tmpdir(), "nm-det-" + Date.now());
  mkdirSync(join(testDir, "src"), { recursive: true });
  mkdirSync(join(testDir, "node_modules/@company/tsconfig"), { recursive: true });

  writeFileSync(join(testDir, "tsconfig.json"), JSON.stringify({
    extends: "@company/tsconfig/base.json",
    compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } }
  }), "utf8");

  writeFileSync(join(testDir, "node_modules/@company/tsconfig/base.json"), JSON.stringify({
    compilerOptions: { paths: { "@/*": ["src/legacy/*"] } }
  }), "utf8");

  writeFileSync(join(testDir, "src/main.ts"), "import { x } from '@/util';\nexport const a = x;\n", "utf8");
  writeFileSync(join(testDir, "src/util.ts"), "export const x = 42;\n", "utf8");

  // Scan 1: WITH node_modules present
  const rawWith = execFileSync("bun", [gateScript, "--root", testDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
  const parsedWith = JSON.parse(rawWith);

  // Rename node_modules to simulate absence
  renameSync(join(testDir, "node_modules"), join(testDir, "node_modules_hidden"));

  // Scan 2: WITHOUT node_modules
  const rawWithout = execFileSync("bun", [gateScript, "--root", testDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
  const parsedWithout = JSON.parse(rawWithout);

  // Compare violations and notices
  const violationsMatch = JSON.stringify(parsedWith.violations) === JSON.stringify(parsedWithout.violations);
  const noticesMatch = JSON.stringify(parsedWith.notices) === JSON.stringify(parsedWithout.notices);
  const countersMatch = JSON.stringify(parsedWith.counters) === JSON.stringify(parsedWithout.counters);

  rmSync(testDir, { recursive: true, force: true });

  const deterministic = violationsMatch && noticesMatch && countersMatch;
  console.log(`node_modules determinism: violationsMatch=${violationsMatch}, noticesMatch=${noticesMatch}, countersMatch=${countersMatch} -> ${deterministic ? "PASS" : "FAIL"}`);
  return deterministic;
}

if (import.meta.main) {
  const ok = testNodeModulesDeterminism();
  process.exit(ok ? 0 : 1);
}
