/**
 * templates/enforcement/tests/key-sensitivity-suite.ts
 * Tests for F-D: key sensitivity token contract (VER3-001, VER3-002).
 * Verifies that key sensitivity is based on token boundaries, not substrings.
 */
import { isSensitiveKey, tokenizeKey } from "../astesia-gate";

export function runKeySensitivitySuite(): {
  total: number;
  passed: number;
  failed: number;
  errors: string[];
} {
  const errors: string[] = [];
  let passed = 0;
  let total = 0;

  function assert(name: string, cond: boolean, msg?: string) {
    total++;
    if (cond) {
      passed++;
    } else {
      errors.push(`FAIL: ${name}${msg ? " - " + msg : ""}`);
    }
  }

  // --- NON-SENSITIVE CASES (must return false) ---
  const nonSensitiveKeys = [
    // Standalone key (VER3-001)
    "key",
    // Words containing auth as substring (VER3-002)
    "author",
    "authors",
    "authority",
    "authorities",
    "authorName",
    "authorEmail",
    "author_id",
    // Animals / words ending in key
    "monkey",
    "turkey",
    "donkey",
    "hockey",
    "hotkey",
    // Common non-sensitive compound keys
    "THEME_STORAGE_KEY",
    "CACHE_KEY",
    "QUERY_KEY",
    "sortKey",
    "storageKey",
    "primaryKey",
    "foreignKey",
    "routingKey",
    "partitionKey",
    "documentKey",
    "translationKey",
    "i18nKey",
    "filterKey",
    "menuKey",
    "routeKey",
    "viewKey",
    "indexKey",
    "cache_key",
    "storage_key",
    "sort_key",
    "primary_key",
    "foreign_key"
  ];

  for (const k of nonSensitiveKeys) {
    assert(`Non-sensitive: '${k}'`, !isSensitiveKey(k), `Expected '${k}' to NOT be sensitive`);
  }

  // --- SENSITIVE CASES (must return true) ---
  const sensitiveKeys = [
    // API keys
    "apiKey",
    "API_KEY",
    "API-KEY",
    "api_key",
    "apikey",
    // Secrets
    "secret",
    "secretKey",
    "SECRET_KEY",
    "mySecret",
    "appSecret",
    "clientSecret",
    "CLIENT_SECRET",
    // Passwords
    "password",
    "passwd",
    "dbPassword",
    "DB_PASSWD",
    "userPassword",
    // Tokens
    "token",
    "authToken",
    "AUTH_TOKEN",
    "accessToken",
    "refreshToken",
    "csrfToken",
    "sessionToken",
    // Credentials & Auth
    "credential",
    "credentials",
    "userCredentials",
    "authKey",
    "AUTH_KEY",
    "authorization",
    // Asymmetric / crypto keys
    "privateKey",
    "PRIVATE_KEY",
    "signingKey",
    "encryptionKey",
    "masterKey",
    "accessKey",
    "ACCESS_KEY",
    "licenseKey",
    "sshKey",
    "sslKey"
  ];

  for (const k of sensitiveKeys) {
    assert(`Sensitive: '${k}'`, isSensitiveKey(k), `Expected '${k}' to BE sensitive`);
  }

  return { total, passed, failed: total - passed, errors };
}

if (import.meta.main) {
  const res = runKeySensitivitySuite();
  console.log(`Key Sensitivity Suite: ${res.passed}/${res.total} passed`);
  if (res.errors.length > 0) {
    for (const e of res.errors) console.error(e);
    process.exit(1);
  }
  process.exit(0);
}
