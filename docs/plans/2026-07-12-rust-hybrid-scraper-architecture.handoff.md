---
title: Rust Hybrid Scraper Implementation Handoff
date: 2026-07-12
status: ready-for-milestone-0
source_plan: docs/plans/2026-07-12-rust-hybrid-scraper-architecture.md
---

# Implementation Handoff

## Objective

Move blog/news/document extraction to one canonical Rust core while keeping
Vercel bounded and using Railway only for browser/OCR escalation. Migrate by
shadow evidence, not by replacing the current Atomize path in one change.

## Non-Negotiable Decisions

1. Accuracy gates the Rust cutover. Upstream benchmark claims do not count.
2. Vercel crons become bounded producers; they do not extract article batches.
3. Redis/BullMQ stays during the engine migration.
4. IBR/CDP remains Node/Railway; do not rewrite browser control in Rust first.
5. Docling remains Python/Railway; do not substitute OCR without held-out wins.
6. Atomize owns persistence and downstream processing.
7. Readability remains a rollback path until the production shadow closes.

## Start Here

Implement only Milestone 0 first.

1. Read the architecture plan in full.
2. Read the Build Loop research packet.
3. In Atomize, reconcile local `main` against deployed `origin/main` before any
   production-routing change.
4. Restore read-only Railway access and capture actual service/deploy/resource
   state. Do not use the June four-worker memory as current truth.
5. Contain the public route defect: explicit article/listing mode, direct article
   extraction, and no unrelated discovery fallback on an article request.
6. Correct duplicated root/SDK timing and extraction-stat semantics before any
   latency claim is recorded.
7. Make one corpus command enforce the documented F1/tail thresholds and restore
   every required fixture with provenance.
8. Assemble the evaluation corpora and run the current production baseline.

Milestone 0 may correct the public demo route, tests, and measurement code, but
does not change Atomize production extraction routing.

## Feature-to-Decision Map

- When implementing F-01, read ADR-01, ADR-06, and ADR-07; satisfy T-01 and T-03.
- When implementing F-02, read ADR-02 and the Vercel research sources; satisfy
  T-03, T-05, and T-06.
- When implementing F-03, read ADR-04 plus IBR's CDP browser/network driver;
  satisfy T-04 through T-07.
- When implementing F-04, read ADR-05 and Atomize's current docparse service;
  satisfy T-04a and T-06.
- When implementing F-05, read ADR-03 plus current Atomize rate limiter,
  capability learning, queues, and SSRF guard; satisfy T-02, T-06, and T-07.
- When implementing F-06, start from Atomize's `ExtractedContent` and single
  writer; satisfy T-03 and T-07.

## Read Order

### Blog scraper

- `package.json`
- `lib/index.ts`
- `lib/source-orchestrator.ts`
- `lib/web-scrapers/content-extractor.ts`
- `lib/web-scrapers/playwright-scraper.ts`
- `lib/web-scrapers/rss-discovery.ts`
- `lib/web-scrapers/sitemap-parser.ts`
- `lib/web-scrapers/robots-checker.ts`
- `lib/scraping-rate-limiter.ts`
- `tests/EXTRACTION_DOE.md` from `codex/scraper-doe`

### Atomize

- `lib/ingestion/contract/extracted-content.ts`
- `lib/ingestion/contract/source-capability.ts`
- `lib/ingestion/extraction/extract.ts`
- `lib/ingestion/extraction/select.ts`
- `lib/ingestion/extraction/tiers/browser.ts`
- `lib/ingestion/extraction/tiers/docparse.ts`
- `lib/ingestion/prevalidation/ssrf-guard.ts`
- `lib/ingestion/sourcelearning/capability.ts`
- `lib/ingestion/persist/write-extracted-content.ts`
- `lib/queues/content-extraction-queue.ts`
- `scripts/content-extraction-worker.ts`
- `app/api/cron/content-backfill/route.ts`
- `app/api/cron/refresh-rss/route.ts`
- `Dockerfile`, `nixpacks.toml`, `railway.json`, `vercel.json`
- `docparse-service/`

### IBR

- `src/engine/cdp/browser.ts`
- `src/engine/driver.ts`
- `src/engine/cdp/network.ts`
- `src/engine/cdp/wait.ts`
- `src/engine/extract.ts`

## Milestone Packets

### M0: Baseline and release reconciliation

Owned outputs:

- Current production commit/deployment record.
- Current Railway topology/resource record.
- Versioned extraction fixtures and references.
- One trustworthy elapsed-time/statistics implementation across root and SDK
  orchestrators.
- Retry-state tests that cannot report extraction success after a failed retry.
- One executable accuracy command that fails below the locked threshold.
- Regression fixtures proving an article request cannot return a different feed
  or sitemap candidate and response counters cannot exceed attempts.
- Baseline report with per-corpus F1, metadata, completeness, latency, and
  failure taxonomy.

No extraction-selection or production-routing changes.

### M1: Contract and core

Owned paths:

- `Cargo.toml`
- `crates/scraper-contract/**`
- `crates/scraper-core/**`
- `crates/scraper-eval/**`
- `bindings/scraper-node/**`
- `packages/contracts-ts/**`
- `evals/**`

Guardrails:

- Pin extractor candidate revision.
- No `unsafe` without a separate reviewed ADR.
- Generated TS/Zod contract checked into source and CI-diffed.
- No production routing.

### M2: Network and discovery

Owned paths:

- `crates/scraper-net/**`
- `crates/scraper-discovery/**`
- network/discovery tests and fixtures

Guardrails:

- One absolute cancellation deadline.
- Every redirect revalidated.
- Compressed and decompressed size caps.
- Real concurrent global scheduling with per-host limits.
- Robots policy explicit in every result.

### M3: Vercel adapter

Owned paths:

- `apps/scraper-fast-vercel/**`
- Vercel project configuration
- `packages/client-ts/**`

Guardrails:

- Separate preview project first.
- One URL per extraction request.
- `/v1/extract` returns that URL, a validated redirect-equivalent URL, or a
  typed failure; it never falls through to discovery.
- No browser, JSDOM, OCR, Prisma, or BullMQ in the Rust function.
- Service auth and request-rate limits before preview traffic.

### M4: Atomize producer migration

Owned paths are in Atomize and must be claimed there before editing:

- content backfill route
- RSS ingestion producer sites
- content extraction queue types
- single writer/result consumer

Guardrails:

- Claim/enqueue/return only in Vercel batch routes.
- Idempotency survives at-least-once delivery.
- Existing rows are not terminally marked merely because enqueue failed.

### M5: Railway browser worker

Owned paths:

- `apps/scraper-heavy-worker/**`
- `bindings/scraper-node/**` Linux release output
- dedicated Dockerfile and Railway config

Guardrails:

- IBR CDP behind a reversible engine flag.
- Every network request checked, not only main-frame navigation.
- Warm browser pool with page-count and RSS-memory recycling.
- Separate image from unrelated Atomize workers.

### M6: Docparse

Owned paths:

- `apps/docparse-service/**`
- document adapter and fixtures

Guardrails:

- Verify current held service before moving code.
- Keep private/authenticated.
- Cap bytes, pages, pixels, duration, and output.
- Treat Docling IBM models as layout/table components and select the OCR backend
  separately from held-out results.
- Retry OCR on scanned/low-text PDF pages; current `auto` mode handles images
  only and is not sufficient.
- Keep RapidOCR/ONNX as the lightweight CPU baseline; compare Tesseract and
  EasyOCR before changing the default.
- No OCR substitution without held-out accuracy evidence.
- Do not vendor or deploy OmniParse without license review, bounded input/auth
  hardening, and a measured win over Docling.

## Validation Commands To Add

Expected eventual commands; names may be adjusted to repository conventions:

```bash
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
npm test --workspace packages/contracts-ts
npm test --workspace bindings/scraper-node
npm run eval:extraction -- --engines readability,rust --corpora all
npm run test:contract-parity
npm run test:ssrf-fixtures
npm run test:browser-soak
```

## Promotion Gates

Do not advance merely because the preceding code compiles.

- M1 -> M2: contract parity and corpus non-inferiority.
- M2 -> M3: SSRF/deadline/size tests and local performance.
- M3 -> M4: seven-day production shadow with no critical regression.
- M4 -> M5: Vercel producer-only behavior and queue durability verified.
- M5 -> M6: browser soak and rollback verified.
- M6 -> M7: document holdouts and resource envelope verified.
- M7 deletion: 14-day rollback window closed.

## Rollback Matrix

| Change | Rollback |
|---|---|
| Rust extraction selection | `SCRAPER_ENGINE=legacy` |
| Vercel service call | Atomize in-process legacy adapter |
| Queue-only backfill | Re-enable bounded legacy batch temporarily |
| IBR CDP | Browser controller flag selects Playwright |
| Result queue | Existing worker direct writer |
| Docparse | Disable document escalation and retain HTML/arXiv fallback |

## Known Unknowns

- Current Railway service inventory and utilization: blocked by CLI auth.
- Current Docling deploy state: source says held; live state unavailable.
- Vercel Rust behavior within Vercel Services: beta and not required for P0.
- Actual Rust quality on local corpora: not yet tested.
- Current heavy-path percentage: historical evidence exists, current telemetry
  must establish the planning denominator.

These are Milestone 0 evidence tasks, not reasons to alter the target boundary.
