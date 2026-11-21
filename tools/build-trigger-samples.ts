/**
 * tools/build-trigger-samples.ts
 * Generates 2 realistic user prompts per skill for evaluating description trigger proxy.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const samples = [
  // 1. adr-management
  { skill: "adr-management", prompt: "Tolong buatkan dokumen ADR untuk keputusan arsitektur migrasi database ini" },
  { skill: "adr-management", prompt: "Record an architectural decision record explaining why we chose Drizzle over Prisma" },

  // 2. anti-bloat-audit
  { skill: "anti-bloat-audit", prompt: "Audit entire codebase for over-engineering and give me a deletion roadmap" },
  { skill: "anti-bloat-audit", prompt: "Lakukan audit menyeluruh untuk mencari fitur over-engineering dan kode yang harus dihapus" },

  // 3. anti-bloat-review
  { skill: "anti-bloat-review", prompt: "Review PR ini dan cari kode yang over-engineered atau tidak perlu ditulis" },
  { skill: "anti-bloat-review", prompt: "Perform a code review focused strictly on unnecessary abstractions and over-engineering" },

  // 4. anti-silent-failure
  { skill: "anti-silent-failure", prompt: "Periksa error handling di modul ini agar tidak ada silent failure atau empty catch block" },
  { skill: "anti-silent-failure", prompt: "Audit all catch blocks to ensure errors are logged or rethrown explicitly without swallowing" },

  // 5. architectural-linter
  { skill: "architectural-linter", prompt: "Jalankan pengecekan aturan arsitektur untuk memastikan controller tidak memanggil database langsung" },
  { skill: "architectural-linter", prompt: "Run architectural linter to enforce dependency rule from controllers to services" },

  // 6. auto-merge-gates
  { skill: "auto-merge-gates", prompt: "Setup auto-merge gates and automated branch protection in GitHub Actions" },
  { skill: "auto-merge-gates", prompt: "Konfigurasi status check otomatis untuk auto-merge branch setelah CI lulus" },

  // 7. blast-radius
  { skill: "blast-radius", prompt: "Hitung blast radius dan dampak perubahan skema database ini terhadap modul lain" },
  { skill: "blast-radius", prompt: "Analyze blast radius of modifying the user authentication token format" },

  // 8. brd-generation
  { skill: "brd-generation", prompt: "Draft business requirements document (BRD) and acceptance criteria for checkout flow" },
  { skill: "brd-generation", prompt: "Buatkan dokumen spesifikasi kebutuhan bisnis (BRD) lengkap dengan user journey" },

  // 9. brownfield-entry
  { skill: "brownfield-entry", prompt: "Pelajari dan petakan struktur proyek legacy yang sudah ada ini sebelum mulai coding" },
  { skill: "brownfield-entry", prompt: "Analyze this existing brownfield repository and generate an architectural system map" },

  // 10. budget-circuit-breaker
  { skill: "budget-circuit-breaker", prompt: "Pasang circuit breaker untuk mencegah pemborosan token dan biaya LLM" },
  { skill: "budget-circuit-breaker", prompt: "Halt task execution when LLM token consumption exceeds budget limit" },

  // 11. codebase-gardening
  { skill: "codebase-gardening", prompt: "Lakukan pembersihan teknikal debt dan refactoring berkala pada kode repo" },
  { skill: "codebase-gardening", prompt: "Run routine codebase gardening wave to resolve debt markers and cleanup unused files" },

  // 12. component-tokens
  { skill: "component-tokens", prompt: "Definisikan design tokens untuk typography, spacing, dan colors di Tailwind" },
  { skill: "component-tokens", prompt: "Extract reusable component design tokens and css variables for our design system" },

  // 13. context-navigation
  { skill: "context-navigation", prompt: "Temukan lokasi implementasi fungsi autentikasi token JWT di seluruh codebase" },
  { skill: "context-navigation", prompt: "Navigate the codebase to locate where payment webhook processing is handled" },

  // 14. cost-reducer
  { skill: "cost-reducer", prompt: "Optimalkan prompt dan kurangi biaya pemanggilan model dengan teknik kompresi context" },
  { skill: "cost-reducer", prompt: "Minimize token usage and reduce cost of agent operations during bulk processing" },

  // 15. cuj-mapping
  { skill: "cuj-mapping", prompt: "Petakan Critical User Journey (CUJ) dari registrasi hingga pembayaran sukses" },
  { skill: "cuj-mapping", prompt: "Map end-to-end critical user journeys with edge cases and failure paths" },

  // 16. debt-scanner
  { skill: "debt-scanner", prompt: "Pindai seluruh TODO, FIXME, dan technical debt markers di repositori" },
  { skill: "debt-scanner", prompt: "Scan project source code for tech debt annotations and architectural shortcuts" },

  // 17. docker-compose
  { skill: "docker-compose", prompt: "Buatkan docker-compose.yml untuk menjalankan backend, postgres, dan redis secara lokal" },
  { skill: "docker-compose", prompt: "Configure multi-service docker-compose setup with healthchecks and persistent volumes" },

  // 18. docker-optimization
  { skill: "docker-optimization", prompt: "Optimalkan Dockerfile dengan multi-stage build agar ukuran image minimal" },
  { skill: "docker-optimization", prompt: "Reduce Docker image size using slim base images and optimized layer caching" },

  // 19. drizzle-orm
  { skill: "drizzle-orm", prompt: "Buat schema tabel pengguna dan relasinya menggunakan Drizzle ORM TypeScript" },
  { skill: "drizzle-orm", prompt: "Write type-safe SQL queries and migrations using Drizzle ORM" },

  // 20. dynamic-plugins
  { skill: "dynamic-plugins", prompt: "Generate script plugin tambahan dan taruh di folder karantina untuk disetujui" },
  { skill: "dynamic-plugins", prompt: "Create quarantined dynamic agent plugin script with SHA256 manifest registration" },

  // 21. e2e-testing
  { skill: "e2e-testing", prompt: "Buat automated end-to-end (E2E) browser tests menggunakan Playwright untuk flow login" },
  { skill: "e2e-testing", prompt: "Write Playwright E2E test suite covering user registration and checkout flow" },

  // 22. elysia-rest-api
  { skill: "elysia-rest-api", prompt: "Bangun REST API endpoint dengan ElysiaJS dan Bun dengan validasi typebox" },
  { skill: "elysia-rest-api", prompt: "Implement high-performance Elysia backend routes with strict schema validation" },

  // 23. frontend-integration
  { skill: "frontend-integration", prompt: "Integrasikan form frontend dengan backend REST API menggunakan TanStack Query" },
  { skill: "frontend-integration", prompt: "Connect client UI components to backend endpoints with state management and caching" },

  // 24. github-actions
  { skill: "github-actions", prompt: "Buatkan GitHub Actions CI workflow untuk linting, testing, dan build otomatis" },
  { skill: "github-actions", prompt: "Configure automated GitHub Actions pipeline with bun setup and test execution" },

  // 25. golang-rest-api
  { skill: "golang-rest-api", prompt: "Buat REST API service menggunakan Go dan Gin atau Chi dengan clean architecture" },
  { skill: "golang-rest-api", prompt: "Develop scalable Go HTTP microservice with structured logging and middleware" },

  // 26. hono-rest-api
  { skill: "hono-rest-api", prompt: "Implementasi REST API ringan menggunakan Hono framework untuk edge runtime" },
  { skill: "hono-rest-api", prompt: "Build modular Hono server endpoints with middleware and OpenAPI documentation" },

  // 27. hybrid-search
  { skill: "hybrid-search", prompt: "Gunakan kombinasi pencarian teks dan semantik untuk menemukan kode yang relevan" },
  { skill: "hybrid-search", prompt: "Perform hybrid search combining keyword grep and semantic indexing across files" },

  // 28. independent-verification
  { skill: "independent-verification", prompt: "Jalankan verifikasi independen atas hasil kerja agen lain dan catat bukti eksekusi" },
  { skill: "independent-verification", prompt: "Act as independent verifier to validate pull request claims with raw execution evidence" },

  // 29. laravel-api
  { skill: "laravel-api", prompt: "Bangun backend API dengan Laravel 11 controller, resource, dan form request" },
  { skill: "laravel-api", prompt: "Create Laravel RESTful endpoints with Eloquent models and policy authorization" },

  // 30. layered-architecture
  { skill: "layered-architecture", prompt: "Terapkan arsitektur berlapis: Pisahkan controller, service, dan repository" },
  { skill: "layered-architecture", prompt: "Enforce strict layered architecture separating presentation, domain, and data access" },

  // 31. lint-ratchet
  { skill: "lint-ratchet", prompt: "Catat baseline pelanggaran dan pasang ratchet agar jumlah warning hanya boleh turun" },
  { skill: "lint-ratchet", prompt: "Implement lint ratchet mechanism ensuring new violations fail the CI build" },

  // 32. minimalist-executor
  { skill: "minimalist-executor", prompt: "Tulis kode yang paling minimal untuk menyelesaikan masalah tanpa over-engineering (YAGNI)" },
  { skill: "minimalist-executor", prompt: "Implement surgical code change adhering to YAGNI with zero unnecessary dependencies" },

  // 33. multi-model-routing
  { skill: "multi-model-routing", prompt: "Lakukan tinjauan adversarial dengan sudut pandang red team dan blue team" },
  { skill: "multi-model-routing", prompt: "Perform adversarial red-team review to challenge design assumptions" },

  // 34. n8n-automation
  { skill: "n8n-automation", prompt: "Buat workflow otomasi n8n untuk integrasi webhook dan notifikasi Slack" },
  { skill: "n8n-automation", prompt: "Design n8n automation pipeline connecting database triggers to external APIs" },

  // 35. python-fastapi
  { skill: "python-fastapi", prompt: "Buat endpoint API async menggunakan Python FastAPI dan Pydantic models" },
  { skill: "python-fastapi", prompt: "Develop FastAPI backend service with dependency injection and type annotations" },

  // 36. react-frontend
  { skill: "react-frontend", prompt: "Bangun komponen antarmuka React dengan hooks dan Tailwind CSS" },
  { skill: "react-frontend", prompt: "Create interactive React components with custom hooks and responsive layouts" },

  // 37. react-native-mobile
  { skill: "react-native-mobile", prompt: "Kembangkan aplikasi mobile cross-platform menggunakan React Native dan Expo" },
  { skill: "react-native-mobile", prompt: "Build mobile UI screens with React Native navigation and offline storage" },

  // 38. reverse-engineering
  { skill: "reverse-engineering", prompt: "Analisis arsitektur dan teknologi web publik kompetitor secara legal" },
  { skill: "reverse-engineering", prompt: "Perform reconnaissance on public web interfaces to extract design patterns" },

  // 39. security-review
  { skill: "security-review", prompt: "Lakukan audit keamanan kode terhadap celah SQL injection, XSS, dan kebocoran rahasia" },
  { skill: "security-review", prompt: "Review authentication endpoints for OWASP vulnerabilities and hardcoded secrets" },

  // 40. self-healing
  { skill: "self-healing", prompt: "Analisis pesan error stack trace ini dan lakukan perbaikan otomatis pada kode" },
  { skill: "self-healing", prompt: "Diagnose build error output and apply targeted self-healing patch" },

  // 41. sveltekit-frontend
  { skill: "sveltekit-frontend", prompt: "Bangun halaman web modern menggunakan SvelteKit dengan server load functions" },
  { skill: "sveltekit-frontend", prompt: "Develop SvelteKit reactive UI components with server-side rendering" },

  // 42. task-waves
  { skill: "task-waves", prompt: "Bagi rencana kerja besar menjadi gelombang tugas (waves) bertahap yang mandiri" },
  { skill: "task-waves", prompt: "Decompose complex feature development into staged task waves with clear milestones" },

  // 43. tdd-workflow
  { skill: "tdd-workflow", prompt: "Terapkan Test-Driven Development (TDD): tulis unit test dulu sampai gagal baru implementasikan" },
  { skill: "tdd-workflow", prompt: "Follow red-green-refactor TDD cycle by writing failing unit test before code" },

  // 44. template-caching
  { skill: "template-caching", prompt: "Gunakan template scaffolding yang sudah tersimpan untuk mempercepat inisiasi modul" },
  { skill: "template-caching", prompt: "Leverage cached template boilerplate for standard CRUD resource creation" },

  // 45. trigger-dev
  { skill: "trigger-dev", prompt: "Implementasikan background job dan scheduled tasks menggunakan Trigger.dev" },
  { skill: "trigger-dev", prompt: "Configure Trigger.dev background workflows with retries and concurrency limits" },

  // 46. trust-pyramid
  { skill: "trust-pyramid", prompt: "Terapkan Trust Pyramid: utamakan type constraint dan linting mekanis di atas aturan prosa" },
  { skill: "trust-pyramid", prompt: "Enforce Trust Pyramid principles by converting prose directives into deterministic gates" },

  // 47. ux-systems
  { skill: "ux-systems", prompt: "Rancang sistem navigasi dan hierarki visual untuk pengalaman pengguna (UX)" },
  { skill: "ux-systems", prompt: "Design user experience wireframes and information architecture for dashboard" },

  // 48. visual-qa
  { skill: "visual-qa", prompt: "Lakukan pengujian visual snapshot untuk memastikan layout UI tidak regresi" },
  { skill: "visual-qa", prompt: "Run visual regression QA testing comparing screenshots against baseline" },

  // 49. vitest-unit-testing
  { skill: "vitest-unit-testing", prompt: "Tulis unit test menggunakan Vitest untuk menguji logic service dan utility functions" },
  { skill: "vitest-unit-testing", prompt: "Create isolated Vitest unit test suite with mocks and high code coverage" },

  // 50. vue-frontend
  { skill: "vue-frontend", prompt: "Bangun komponen antarmuka menggunakan Vue 3 Composition API dan Pinia" },
  { skill: "vue-frontend", prompt: "Develop responsive Vue 3 components with script setup and reactive state" },

  // 51. worktree-isolation
  { skill: "worktree-isolation", prompt: "Gunakan git worktree untuk mengerjakan fitur secara terisolasi tanpa merusak working tree" },
  { skill: "worktree-isolation", prompt: "Create isolated git worktree branch to execute experimental code refactoring safely" },

  // 52. zero-downtime-migration
  { skill: "zero-downtime-migration", prompt: "Rancang skema migrasi database zero-downtime dengan pola expand and contract" },
  { skill: "zero-downtime-migration", prompt: "Execute zero-downtime database migration using multi-phase column transition" },

  // 53. zod-validation
  { skill: "zod-validation", prompt: "Validasi request body dan input data menggunakan skema Zod yang type-safe" },
  { skill: "zod-validation", prompt: "Define Zod schema to parse and validate incoming API payload" },
];

const outPath = join(__dirname, "trigger-samples.json");
writeFileSync(outPath, JSON.stringify(samples, null, 2), "utf8");
console.log(`Generated ${samples.length} trigger samples for ${samples.length / 2} skills at ${outPath}`);
