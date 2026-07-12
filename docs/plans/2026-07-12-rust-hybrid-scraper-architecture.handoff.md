---
title: Rust Hybrid Scraper Implementation Handoff
date: 2026-07-12
status: ready-for-milestone-0
source_plan: docs/plans/2026-07-12-rust-hybrid-scraper-architecture.md
---

# Implementation Handoff

## Objective

Move blog/news/document extraction to one canonical first-party Rust platform.
Keep Vercel bounded and use Railway only for browser/PDF/OCR escalation. Preserve
the `@tyroneross/omniparse` API while porting its proven Office behavior and
replacing its PDF scanner. Migrate by shadow evidence, not a flag-day change.

## Non-Negotiable Decisions

1. Accuracy gates the Rust cutover. Upstream benchmark claims do not count.
2. Vercel crons become bounded producers; they do not extract article batches.
3. Redis/BullMQ stays during the engine migration.
4. IBR/CDP remains Node/Railway; do not rewrite browser control in Rust first.
5. OmniParse Native owns documents. PDFium and Tesseract are candidates behind
   first-party traits, not unconditional defaults; every engine needs held-out
   format-segment wins.
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
- When implementing F-04, read ADR-05, the user OmniParse SDK, market-research
  parsers, Atomize's current document adapter, and Spectra's Vision contract;
  satisfy T-04a, T-04b, and T-06.
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

### User OmniParse

- `packages/sdk/src/router.ts`
- `packages/sdk/src/parsers/excel-parser-fast.ts`
- `packages/sdk/src/parsers/excel-parser-rich.ts`
- `packages/sdk/src/parsers/pptx-parser-fast.ts`
- `packages/sdk/tests/run-tests.ts`

### Market-research parser oracle

- `backend/app/parsers/__init__.py`
- `backend/app/parsers/pdf_parser.py`
- `backend/app/parsers/ocr.py`
- `backend/app/parsers/image_parser.py`
- `backend/app/parsers/word_parser.py`
- `backend/app/parsers/pptx_parser.py`
- `backend/app/parsers/excel_parser.py`
- `backend/tests/test_parsers_in_process.py`
- `tests/test_parser_routing.py`
- `tests/test_image_indexing.py`

### Native OCR/layout evidence

- Spectra `native/swift/VisionGrounder.swift`
- Spectra `src/computer-use/port.ts`
- Spectra `src/computer-use/vision-fallback.ts`
- Spectra `src/intelligence/spatial.ts`
- screen-extractor `src/parser.rs`, `src/grid.rs`, and `tests/oracle.rs`
- docsynth mixed-PDF `verify_ocr.py` and fixture from the July 5 OCR oracle

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
- Export-by-export `@tyroneross/omniparse` consumer inventory covering unified
  router, batches/directories, buffer/direct parsers, Python parsing, all public
  result types, CJS/ESM, `./parsers`, and CLI; 1.x rollback owner recorded.

No extraction-selection or production-routing changes.

### M1: Contract and core

Owned paths:

- `Cargo.toml`
- `crates/ingestion-contract/**`
- `crates/scraper-core/**`
- `crates/scraper-eval/**`
- `bindings/ingestion-node/**`
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
- `/v1/parse` accepts `DocumentParseRequestV1` only: approved storage reference
  or <=3 MiB raw inline payload with MIME/name/size/checksum/magic agreement.
  Larger inputs or projected outputs become `DocumentJobV1`; Vercel's 4.5 MB
  request/response limit is never used as the parser limit.
- No browser, JSDOM, OCR, Prisma, or BullMQ in the Rust function.
- Service auth and request-rate limits before preview traffic.

### M4: Atomize producer migration

Owned paths are in Atomize and must be claimed there before editing:

- content backfill route
- RSS ingestion producer sites
- content extraction queue types
- single writer/result consumer

Guardrails:

- Claim/enqueue/return only in Vercel backfill routes. RSS cron may perform one
  bounded feed/sitemap discovery and candidate-insert pass, but never article-
  body extraction.
- Idempotency survives at-least-once delivery.
- Existing rows are not terminally marked merely because enqueue failed.

### M5: Railway browser worker

Owned paths:

- `apps/scraper-heavy-worker/**`
- `bindings/ingestion-node/**` Linux release output
- dedicated Dockerfile and Railway config

Guardrails:

- IBR CDP behind a reversible engine flag.
- Every network request checked, not only main-frame navigation.
- Warm browser pool with page-count and RSS-memory recycling.
- Separate image from unrelated Atomize workers.

### M6: OmniParse Native documents and OCR

Owned paths:

- `crates/omniparse-core/**`
- `crates/omniparse-office/**`
- `crates/omniparse-pdf/**`
- `crates/omniparse-ocr/**`
- `packages/omniparse-compat/**`
- `apps/omniparse-native-worker/**`
- document adapters, dedicated queue, corpora, and fixtures

Guardrails:

- Correct the naming collision: use the user-owned TypeScript OmniParse, not the
  unrelated public Python project previously audited.
- Import user OmniParse's 51-test compatibility behavior and the live
  market-research parser tests before porting.
- Preserve every published OmniParse export under 1.x. Keep Python and local
  directory orchestration in the compatibility package until a separately
  measured replacement exists; intentional breaks require 2.0.
- Keep private/authenticated.
- Consume `document-extraction` directly and publish to the shared result queue;
  the browser worker may enqueue a binary reclassification but never blocks on
  synchronous OCR.
- Cap bytes, pages, archive expansion, pixels, duration, and output.
- Reject the current OmniParse raw-stream PDF scanner and unsafe custom ZIP path.
- Parse native text first with PDFium and OCR only low-coverage pages/regions.
- Start with the Tesseract C API because its existing mixed-PDF oracle passed;
  keep the CLI path as a test oracle.
- Compare RapidOCR and PaddleOCR ONNX/C++ by corpus segment. No Python OCR
  framework or model enters production without a measured need.
- Preserve per-block source, confidence, bounding box, reading order, page, and
  engine/model checksum. No LLM generates parser truth.
- No recognizer or parser substitution without held-out accuracy evidence.
- Enforce G-OCR-CLEAN, G-OCR-HARD, G-COMPLETE, G-BLOCK, G-ORDER, G-TABLE,
  G-OFFICE, G-PERF, and G-QUEUE exactly as declared in the source plan; a segment
  below its minimum sample count cannot be promoted.

## Validation Commands To Add

Expected eventual commands; names may be adjusted to repository conventions:

```bash
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
npm test --workspace packages/contracts-ts
npm test --workspace bindings/ingestion-node
npm run eval:extraction -- --engines readability,rust --corpora all
npm run eval:documents -- --pdf-engines pdfium,pymupdf,omniparse-current
npm run eval:ocr -- --engines tesseract-fast,tesseract-best,rapidocr,paddleocr
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
| OmniParse Native | Select current Atomize adapter or disable document escalation and retain HTML/arXiv fallback |

## Known Unknowns

- Current Railway service inventory and utilization: blocked by CLI auth.
- Current Atomize document-service deploy state: source says held; live state unavailable.
- PDFium packaging and actual comparative PDF/OCR quality: not yet tested on the
  full corpus. Existing evidence is one mixed-PDF sentinel oracle plus narrow
  Office/parser tests.
- Vercel Rust behavior within Vercel Services: beta and not required for P0.
- Actual Rust quality on local corpora: not yet tested.
- Current heavy-path percentage: historical evidence exists, current telemetry
  must establish the planning denominator.

These are Milestone 0 evidence tasks, not reasons to alter the target boundary.
