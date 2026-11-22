import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const gate = resolve("templates/enforcement/astesia-gate.ts");
const rules = resolve("templates/enforcement/anti-patterns.json");
const baseDir = resolve(".astesia/audit/wave2a.1/verify-first");
mkdirSync(baseDir, { recursive: true });

// Test 1: SEC-25-orig
const d1 = resolve(baseDir, "sec25");
mkdirSync(d1, { recursive: true });
writeFileSync(resolve(d1, "test.ts"), 'const authHeader = "Basic dXNlcm5hbWU6cGFzc3dvcmQ=";\n');
const res1 = spawnSync("bun", [gate, "--root", d1, "--rules", rules, "--json"], { encoding: "utf8" });
const r1 = JSON.parse(res1.stdout || "{}");
console.log("Test 1 (SEC-25-orig - expected 1 error, got):", r1.errors);

// Test 2: THEME_STORAGE_KEY
const d2 = resolve(baseDir, "theme");
mkdirSync(d2, { recursive: true });
writeFileSync(resolve(d2, "test.ts"), 'const THEME_STORAGE_KEY = "terminal_portfolio_theme";\n');
const res2 = spawnSync("bun", [gate, "--root", d2, "--rules", rules, "--json"], { encoding: "utf8" });
const r2 = JSON.parse(res2.stdout || "{}");
console.log("Test 2 (THEME_STORAGE_KEY - expected 0 errors, got):", r2.errors);

// Test 3: Dockerfile apostrophe desync
const d3 = resolve(baseDir, "docker");
mkdirSync(d3, { recursive: true });
writeFileSync(resolve(d3, "Dockerfile"), "RUN echo \"don't fail\"\n");
const res3 = spawnSync("bun", [gate, "--root", d3, "--rules", rules, "--json"], { encoding: "utf8" });
const r3 = JSON.parse(res3.stdout || "{}");
console.log("Test 3 (Dockerfile desync_files - expected 0, got):", r3.desync_files);

rmSync(baseDir, { recursive: true, force: true });
