import os from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";

let cachedEmptyHome: string | null = null;

export function getIsolatedEmptyDir(): string {
  if (!cachedEmptyHome) {
    cachedEmptyHome = mkdtempSync(join(os.tmpdir(), "astesia-isolated-home-"));
  }
  return cachedEmptyHome;
}

/**
 * Isolated environment helper (Keputusan 5).
 * Directs HOME, USERPROFILE, XDG_CONFIG_HOME to an empty temp dir.
 * Eliminates hardcoded 'NUL' by using a valid null device (/dev/null or os.devNull).
 * Sets GIT_CONFIG_NOSYSTEM=1 and LC_ALL=C for hermetic git & tool execution.
 */
export function isolatedEnv(extraEnv?: Record<string, string | undefined>): Record<string, string> {
  const emptyDir = getIsolatedEmptyDir();
  // On Windows, Git for Windows (MSYS2) requires '/dev/null' or 'nul' because '\\.\nul' causes fatal: invalid argument.
  // Using '/dev/null' works cross-platform on both Windows (Git for Windows) and Linux.
  const nullDevice = process.platform === "win32" ? "/dev/null" : os.devNull;

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    HOME: emptyDir,
    USERPROFILE: emptyDir,
    XDG_CONFIG_HOME: emptyDir,
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_SYSTEM: nullDevice,
    GIT_CONFIG_NOSYSTEM: "1",
    LC_ALL: "C"
  };

  if (extraEnv) {
    for (const [k, v] of Object.entries(extraEnv)) {
      if (v === undefined) {
        delete env[k];
      } else {
        env[k] = v;
      }
    }
  }

  return env;
}
