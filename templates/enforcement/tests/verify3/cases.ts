export interface VerifyCase {
  id: string;
  suite: "d1_profile" | "d2_keys_e1" | "d3_yaml" | "d6_meta";
  name: string;
  filename: string;
  content: string;
  expectedViolationsCount: number;
  expectedRules?: string[];
  knownGapId?: string;
}

export const VERIFY3_CASES: VerifyCase[] = [
  // --- D1: Profile Dispatch Cases (20 cases) ---
  { id: "V3-D1-01", suite: "d1_profile", name: "Root .env", filename: ".env", content: "PORT=3000\n", expectedViolationsCount: 0 },
  { id: "V3-D1-02", suite: "d1_profile", name: "Subdir .env.production", filename: "sub/.env.production", content: "PORT=3000\n", expectedViolationsCount: 0 },
  { id: "V3-D1-03", suite: "d1_profile", name: "Windows backslash .env", filename: "sub\\.env.production", content: "PORT=3000\n", expectedViolationsCount: 0 },
  { id: "V3-D1-04", suite: "d1_profile", name: "Root Dockerfile", filename: "Dockerfile", content: "FROM node:20\n", expectedViolationsCount: 0 },
  { id: "V3-D1-05", suite: "d1_profile", name: "Dockerfile suffix", filename: "Dockerfile.dev", content: "FROM node:20\n", expectedViolationsCount: 0 },
  { id: "V3-D1-06", suite: "d1_profile", name: "Dockerfile extension", filename: "api.Dockerfile", content: "FROM node:20\n", expectedViolationsCount: 0 },
  { id: "V3-D1-07", suite: "d1_profile", name: "Subdir Dockerfile backslash", filename: "deploy\\api.Dockerfile", content: "FROM node:20\n", expectedViolationsCount: 0 },
  { id: "V3-D1-08", suite: "d1_profile", name: ".envrc is code profile", filename: ".envrc", content: "export userPassword=\"Please enter your password\"\n", expectedViolationsCount: 0 },
  { id: "V3-D1-09", suite: "d1_profile", name: ".environment is code profile", filename: ".environment", content: "userPassword=\"Please enter your password\"\n", expectedViolationsCount: 0 },
  { id: "V3-D1-10", suite: "d1_profile", name: "YAML yml extension", filename: "app.yml", content: "version: 1\n", expectedViolationsCount: 0 },
  { id: "V3-D1-11", suite: "d1_profile", name: "YAML yaml extension backslash", filename: "config\\app.yaml", content: "version: 1\n", expectedViolationsCount: 0 },
  { id: "V3-D1-12", suite: "d1_profile", name: "dockerfile-tools dir not config", filename: "dockerfile-tools/index.ts", content: "export const userPassword = \"Please enter your password\";\n", expectedViolationsCount: 0 },
  { id: "V3-D1-13", suite: "d1_profile", name: "dockerfile-tools backslash not config", filename: "dockerfile-tools\\index.ts", content: "export const userPassword = \"Please enter your password\";\n", expectedViolationsCount: 0 },
  { id: "V3-D1-14", suite: "d1_profile", name: "my.dockerfile.d dir not config", filename: "my.dockerfile.d/util.ts", content: "export const userPassword = \"Please enter your password\";\n", expectedViolationsCount: 0 },
  { id: "V3-D1-15", suite: "d1_profile", name: "dockerfile_utils.py not config", filename: "docker/dockerfile_utils.py", content: "user_password = 'Please enter your password'\n", expectedViolationsCount: 0 },
  { id: "V3-D1-16", suite: "d1_profile", name: ".env-tools dir not config", filename: ".env-tools/x.ts", content: "export const userPassword = \"Please enter your password\";\n", expectedViolationsCount: 0 },
  { id: "V3-D1-17", suite: "d1_profile", name: ".env-tools backslash not config", filename: ".env-tools\\x.ts", content: "export const userPassword = \"Please enter your password\";\n", expectedViolationsCount: 0 },
  { id: "V3-D1-18", suite: "d1_profile", name: "Config comment preserves quote hash", filename: ".env", content: "FOO=\"hello # not a comment\"\n", expectedViolationsCount: 0 },
  { id: "V3-D1-19", suite: "d1_profile", name: "Config hashes outside quotes stripped", filename: ".env", content: "# Comment line\nPORT=3000 # inline comment\n", expectedViolationsCount: 0 },
  { id: "V3-D1-20", suite: "d1_profile", name: "Config secret in subdir caught", filename: "sub/.env.prod", content: "ADMIN_PASSWORD=\"SuperSecretPassword123!\"\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },

  // --- D2: Key Sensitivity & E1 Contract (Selected Core Subset of 40 cases) ---
  { id: "V3-D2-01", suite: "d2_keys_e1", name: "userPwd is sensitive", filename: "test.ts", content: "const userPwd = \"SecretPassword123!\";\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-004"] },
  { id: "V3-D2-02", suite: "d2_keys_e1", name: "dbPwd is sensitive", filename: "test.ts", content: "const dbPwd = \"DatabasePass123!\";\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-004"] },
  { id: "V3-D2-03", suite: "d2_keys_e1", name: "passphrase is sensitive", filename: "test.ts", content: "const passphrase = \"MySecretPassphrase123!\";\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-004"] },
  { id: "V3-D2-04", suite: "d2_keys_e1", name: "auth alone is NOT sensitive", filename: "test.ts", content: "const auth = \"PublicAuthScheme123\";\n", expectedViolationsCount: 0 },
  { id: "V3-D2-05", suite: "d2_keys_e1", name: "authKey pair is sensitive", filename: "test.ts", content: "const authKey = \"AuthSecretKey999!\";\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-004"] },
  { id: "V3-D2-06", suite: "d2_keys_e1", name: "authorName not sensitive", filename: "test.ts", content: "const authorName = \"WilliamShakespeare123\";\n", expectedViolationsCount: 0 },
  { id: "V3-D2-07", suite: "d2_keys_e1", name: "authority not sensitive", filename: "test.ts", content: "const authority = \"GovernmentAuthority123\";\n", expectedViolationsCount: 0 },
  { id: "V3-D2-08", suite: "d2_keys_e1", name: "apiKey pair is sensitive", filename: "test.ts", content: "const apiKey = \"MyApiKeySecret123!\";\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-004"] },
  { id: "V3-D2-09", suite: "d2_keys_e1", name: "storageKey not sensitive", filename: "test.ts", content: "const storageKey = \"localStorageItemKey123\";\n", expectedViolationsCount: 0 },
  { id: "V3-D2-10", suite: "d2_keys_e1", name: "cacheKey not sensitive", filename: "test.ts", content: "const cacheKey = \"redisCacheKeyIdentifier123\";\n", expectedViolationsCount: 0 },
  { id: "V3-D2-11", suite: "d2_keys_e1", name: "queryKey not sensitive", filename: "test.ts", content: "const queryKey = \"reactQueryKeyIdentifier123\";\n", expectedViolationsCount: 0 },
  { id: "V3-D2-12", suite: "d2_keys_e1", name: "key alone not sensitive", filename: "test.ts", content: "const key = \"someGenericKeyIdentifier123\";\n", expectedViolationsCount: 0 },
  { id: "V3-D2-13", suite: "d2_keys_e1", name: "Code E1 space exempt", filename: "test.ts", content: "const password = \"Please enter your password\";\n", expectedViolationsCount: 0 },
  { id: "V3-D2-14", suite: "d2_keys_e1", name: "Code E1 PascalCase exempt", filename: "test.ts", content: "const userPassword = \"PascalCasePasswordExempt\";\n", expectedViolationsCount: 0 },
  { id: "V3-D2-15", suite: "d2_keys_e1", name: "Code unbroken lowercase >= 12 triggers", filename: "test.ts", content: "const password = \"correcthorsebatterystaple\";\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-004"] },
  { id: "V3-D2-16", suite: "d2_keys_e1", name: "Code passwordLabel spaced exempt", filename: "test.ts", content: "const passwordLabel = \"Password Label\";\n", expectedViolationsCount: 0 },
  { id: "V3-D2-17", suite: "d2_keys_e1", name: "Basic configuration exempt", filename: "test.ts", content: "const config = \"Basic configuration\";\n", expectedViolationsCount: 0 },
  { id: "V3-D2-18", suite: "d2_keys_e1", name: "Bearer authentication exempt", filename: "test.ts", content: "const desc = \"Bearer authentication scheme\";\n", expectedViolationsCount: 0 },
  { id: "V3-D2-19", suite: "d2_keys_e1", name: "Basic base64 triggers", filename: "test.ts", content: "const header = \"Basic dXNlcjpwYXNz\";\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-004"] },
  { id: "V3-D2-20", suite: "d2_keys_e1", name: "Bearer JWT triggers", filename: "test.ts", content: "const header = \"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123\";\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-004"] },
  { id: "V3-D2-21", suite: "d2_keys_e1", name: "sk_live_ triggers on neutral key", filename: "test.ts", content: "const data = \"sk_live_1234567890abcdef\";\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-004"] },
  { id: "V3-D2-22", suite: "d2_keys_e1", name: "ghp_ triggers on neutral key", filename: "test.ts", content: "const data = \"ghp_1234567890abcdef\";\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-004"] },
  { id: "V3-D2-23", suite: "d2_keys_e1", name: "AKIA triggers on neutral key", filename: "test.ts", content: "const data = \"AKIAIOSFODNN7EXAMPLE\";\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-004"] },
  { id: "V3-D2-24", suite: "d2_keys_e1", name: "Config spaced value triggers (E1 disabled)", filename: ".env", content: "DB_PASSWORD=\"my secret password\"\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D2-25", suite: "d2_keys_e1", name: "Config short literal (< 8) exempt", filename: ".env", content: "DB_PASSWORD=1234567\n", expectedViolationsCount: 0 },
  { id: "V3-D2-26", suite: "d2_keys_e1", name: "Config 8 chars triggers", filename: ".env", content: "DB_PASSWORD=EightChr\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D2-27", suite: "d2_keys_e1", name: "Config PascalCase triggers", filename: ".env", content: "API_SECRET=PascalCaseSecretValue\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D2-28", suite: "d2_keys_e1", name: "Config ${VAR} exempt", filename: ".env", content: "DB_PASSWORD=${DB_PASS}\n", expectedViolationsCount: 0 },
  { id: "V3-D2-29", suite: "d2_keys_e1", name: "Config $VAR unbraced interpolation", filename: ".env", content: "DB_PASSWORD=$DB_PASS\n", expectedViolationsCount: 0, knownGapId: "VER5-001" },
  { id: "V3-D2-30", suite: "d2_keys_e1", name: "Config ${VAR:?error} exempt", filename: ".env", content: "DB_PASSWORD=${DB_PASS:?required}\n", expectedViolationsCount: 0 },
  { id: "V3-D2-31", suite: "d2_keys_e1", name: "Config ${{ secrets.X }} exempt", filename: "app.yaml", content: "secret_key: \"${{ secrets.PROD_KEY }}\"\n", expectedViolationsCount: 0 },
  { id: "V3-D2-32", suite: "d2_keys_e1", name: "Config {{ .Values.X }} exempt", filename: "app.yaml", content: "secret_key: \"{{ .Values.prodKey }}\"\n", expectedViolationsCount: 0 },
  { id: "V3-D2-33", suite: "d2_keys_e1", name: "Config fallback < 8 exempt", filename: ".env", content: "DB_PASSWORD=${DB_PASS:-short}\n", expectedViolationsCount: 0 },
  { id: "V3-D2-34", suite: "d2_keys_e1", name: "Config fallback >= 8 triggers", filename: ".env", content: "DB_PASSWORD=${DB_PASS:-MyFallbackSecretPassword123}\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D2-35", suite: "d2_keys_e1", name: "Config absolute path exempt", filename: ".env", content: "SECRET_FILE=/etc/secrets/db_password.txt\n", expectedViolationsCount: 0 },
  { id: "V3-D2-36", suite: "d2_keys_e1", name: "Config relative path exempt", filename: ".env", content: "SECRET_PATH=./secrets/api_token.key\n", expectedViolationsCount: 0 },
  { id: "V3-D2-37", suite: "d2_keys_e1", name: "Config secret_name identifier exempt", filename: "app.yaml", content: "secret_name: my-secret-vault-identifier\n", expectedViolationsCount: 0 },
  { id: "V3-D2-38", suite: "d2_keys_e1", name: "Config secret_ref identifier exempt", filename: "app.yaml", content: "secret_ref: vault-prod-db-ref-123\n", expectedViolationsCount: 0 },
  { id: "V3-D2-39", suite: "d2_keys_e1", name: "Config existingSecret exempt", filename: "app.yaml", content: "existingSecret: my-k8s-secret-resource\n", expectedViolationsCount: 0 },
  { id: "V3-D2-40", suite: "d2_keys_e1", name: "Dockerfile ENV password triggers", filename: "Dockerfile", content: "ENV ADMIN_PASSWORD=\"DockerSecretPassword123\"\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },

  // --- D3: YAML Manifests (15 cases) ---
  { id: "V3-D3-01", suite: "d3_yaml", name: "k8s env hardcoded secret", filename: "k8s.yaml", content: "apiVersion: apps/v1\nkind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - name: api\n        env:\n        - name: DB_PASSWORD\n          value: \"SuperSecretDbPassword123!\"\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D3-02", suite: "d3_yaml", name: "k8s secretKeyRef exempt", filename: "k8s-ref.yaml", content: "apiVersion: apps/v1\nkind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - name: api\n        env:\n        - name: DB_PASSWORD\n          valueFrom:\n            secretKeyRef:\n              name: db-credentials\n              key: password\n", expectedViolationsCount: 0 },
  { id: "V3-D3-03", suite: "d3_yaml", name: "Helm values password literal", filename: "values.yaml", content: "global:\n  postgresql:\n    auth:\n      password: \"PostgresProductionPassword999!\"\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D3-04", suite: "d3_yaml", name: "Helm existingSecret reference", filename: "values-ref.yaml", content: "global:\n  postgresql:\n    auth:\n      existingSecret: \"production-postgresql-secret\"\n", expectedViolationsCount: 0 },
  { id: "V3-D3-05", suite: "d3_yaml", name: "Docker compose mapping secret", filename: "docker-compose.yml", content: "version: '3.8'\nservices:\n  db:\n    environment:\n      POSTGRES_PASSWORD: \"HardcodedComposePassword456!\"\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D3-06", suite: "d3_yaml", name: "Docker compose list secret", filename: "docker-compose.yml", content: "version: '3.8'\nservices:\n  db:\n    environment:\n      - MYSQL_ROOT_PASSWORD=MyRootPasswordSecret789!\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D3-07", suite: "d3_yaml", name: "Docker compose interpolation exempt", filename: "docker-compose.yml", content: "version: '3.8'\nservices:\n  db:\n    environment:\n      - POSTGRES_PASSWORD=${DB_PASSWORD}\n", expectedViolationsCount: 0 },
  { id: "V3-D3-08", suite: "d3_yaml", name: "GitHub Actions literal secret in env", filename: ".github/workflows/deploy.yml", content: "name: Deploy\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n    - env:\n        DEPLOY_TOKEN: \"hardcoded_deploy_token_secret_123\"\n      run: npm run deploy\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D3-09", suite: "d3_yaml", name: "GitHub Actions secrets interpolation exempt", filename: ".github/workflows/deploy.yml", content: "name: Deploy\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n    - env:\n        DEPLOY_TOKEN: ${{ secrets.PROD_TOKEN }}\n      run: npm run deploy\n", expectedViolationsCount: 0 },
  { id: "V3-D3-10", suite: "d3_yaml", name: "Spring yaml password literal", filename: "application.yml", content: "spring:\n  datasource:\n    password: \"DatabaseSpringPassword123!\"\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D3-11", suite: "d3_yaml", name: "Spring yaml short fallback exempt", filename: "application.yml", content: "spring:\n  datasource:\n    password: \"${SPRING_DB_PASS:-short}\"\n", expectedViolationsCount: 0 },
  { id: "V3-D3-12", suite: "d3_yaml", name: "Spring yaml long fallback triggers", filename: "application.yml", content: "spring:\n  datasource:\n    password: \"${SPRING_DB_PASS:-SpringSecretFallback999!}\"\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D3-13", suite: "d3_yaml", name: "config/db.yml password triggers", filename: "config/db.yml", content: "production:\n  password: \"RailsProductionPassword888!\"\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D3-14", suite: "d3_yaml", name: "Dockerfile ENV secret triggers", filename: "Dockerfile", content: "FROM alpine:latest\nENV SERVICE_API_KEY=\"ProductionApiKey999999!\"\n", expectedViolationsCount: 1, expectedRules: ["ASTESIA-010"] },
  { id: "V3-D3-15", suite: "d3_yaml", name: "Dockerfile benign ARG exempt", filename: "Dockerfile", content: "FROM node:20\nARG NODE_ENV=\"production\"\n", expectedViolationsCount: 0 },

  // --- D6: Meta-Integrity & Corpus Lock Cases (5 cases) ---
  { id: "V3-D6-01", suite: "d6_meta", name: "Authentic originals.json SHA256 integrity", filename: "meta_check.ts", content: "// META-01\n", expectedViolationsCount: 0 },
  { id: "V3-D6-02", suite: "d6_meta", name: "Tampering detection simulation", filename: "meta_check.ts", content: "// META-02\n", expectedViolationsCount: 0 },
  { id: "V3-D6-03", suite: "d6_meta", name: "Test ID deletion detection", filename: "meta_check.ts", content: "// META-03\n", expectedViolationsCount: 0 },
  { id: "V3-D6-04", suite: "d6_meta", name: "Corpus completeness >= 60 cases", filename: "meta_check.ts", content: "// META-04\n", expectedViolationsCount: 0 },
  { id: "V3-D6-05", suite: "d6_meta", name: "Zero orphan test suite validation", filename: "meta_check.ts", content: "// META-05\n", expectedViolationsCount: 0 }
];
