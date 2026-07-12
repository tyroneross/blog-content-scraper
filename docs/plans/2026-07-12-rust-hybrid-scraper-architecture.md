---
title: Rust Hybrid Scraper Architecture
date: 2026-07-12
status: proposed
mode: build-loop-plan
risk_reason: deployment
modifies_api: true
permission_tier: T2
dispatch_tier: opus
scope_auditor_status: pending
plan_critic_status: passed_with_activation_gates
parallel_batch: [foundation-and-contract, rust-core-and-evals, vercel-adapter, railway-adapters]
---

<!-- checklist
Item 1 — Auth guard: service-to-service HMAC or platform OIDC at every non-health scraper endpoint; existing Atomize user auth remains at product routes
Item 2 — External APIs: current official Vercel and Railway contracts are cited in Research Context and the research packet
Item 3 — Rate-limit criterion: one absolute deadline plus request-byte, redirect, per-host, global, queue, and browser concurrency ceilings
Item 4 — Discoverability: N/A: backend architecture only; no user-facing navigation changes
Item 5 — Server/client boundary: generated TypeScript/Zod contract and server-only service clients; browser clients never call extraction workers
Item 6 — Concurrency: BullMQ at-least-once delivery, deterministic job IDs, article/content-hash idempotency, and one persistence writer
Item 7 — Observability: structured per-stage events, trace/job IDs, queue age, runtime, quality, escalation, and cost dimensions
Item 8 — Input validation: Rust serde validation and Atomize Zod validation at every network and queue boundary
Item 9 — Stable ID traceability: U-01 -> F-01 -> D-01 -> T-01 is carried through the JSON spec object and acceptance table
Item 10 — JSON spec object: included before architecture rendering with needs, features, data points, tests, and ADRs
Item 11 — Blocking-and-novel question gate: no blocking design questions; deployment unknowns are explicit assumptions with Milestone 0 falsifiers
Item 12 — Low-reversibility ADRs: ADR-01 through ADR-07 cover ownership, hosting, queue, language, binding, and cutover decisions
Item 13 — Analytical lens: DSM for dependencies, Pugh selection for placement, and backcasting for migration
Item 14 — Handoff document: docs/plans/2026-07-12-rust-hybrid-scraper-architecture.handoff.md
Item 15 — Synthesis dimensions: N/A: no UI in scope
Item 16 — Risk reason: deployment; public contracts, multi-cloud routing, and runtime placement make this an architecture-risk plan
Item 17 — UI input/output contract: N/A: no UI in scope
Item 18 — Dispatch tier per work item: M0 sonnet; M1-M2 opus; M3-M4 sonnet; M5-M6 opus; M7 sonnet
Item 19 — Env-var manifest: names and owners are listed in Environment Contract; values remain in platform secret stores
Item 20 — Capability gap map: current owner, target owner, gap, build action, and validation are mapped for ten capabilities
Item 21 — Single-shot build guardrails: guardrails table states what each control prevents and the required evidence
Item 22 — Read-before-edit map: contract, core, network, Vercel, queue, browser, and OCR work list exact source surfaces to inspect first
-->

# Rust Hybrid Scraper Architecture

## Executive Decision

Build `blog-content-scraper` into the canonical extraction platform, with one
versioned Rust core and environment-specific adapters:

- Vercel runs the stateless fast path: fetch, feed/sitemap discovery, HTML
  extraction, metadata, Markdown, quality, and escalation classification.
- Railway runs stateful/native escalation: Chromium through IBR/CDP and
  PDF/image extraction through the first-party OmniParse Native worker.
- Atomize remains the product and data owner: source scheduling, BullMQ job
  production, result persistence, downstream enrichment, and user-facing APIs.
- Redis/BullMQ remains the durable cross-cloud control plane during migration.
- Mozilla Readability remains the rollback oracle until Rust passes corpus-level
  non-inferiority and production shadow gates.

This is a capability split, not a platform split. Vercel does bounded work that
can finish independently. Railway does work that benefits from warm processes,
native binaries, large models, or retries unconstrained by one HTTP invocation.

## North Star

For any supported URL, return the fullest defensible content with provenance,
within the cheapest runtime that can meet the accuracy requirement, without
letting a hard source delay unrelated ingestion.

Priority order: accuracy, speed, operational simplicity, code size, cost.

## Scope

### In scope

- Blog/news article discovery and extraction.
- RSS, Atom, JSON Feed, robots, XML sitemap, and HTML link discovery.
- Static HTML, client-rendered HTML, PDF, and image/OCR ingestion.
- A versioned extraction contract shared by Rust, Node, and Atomize.
- Vercel and Railway service boundaries, deployment manifests, and telemetry.
- A staged migration from current Atomize code without a one-release replacement.

### Out of scope

- Defeating paywalls, CAPTCHAs, or explicit access controls.
- Shipping a Rust/PDF/OCR component before it passes format-specific accuracy,
  latency, and memory gates against the existing local implementations.
- Replacing IBR's CDP engine with Rust while Chrome remains the dominant cost.
- Replacing Redis/BullMQ during the extraction-engine migration.
- Changing Atomize search, clustering, KG, embeddings, or summarization logic.

## Spec Object (JSON)

```json
{
  "needs": [
    {"id": "U-01", "priority": "P0", "text": "Extract complete article content accurately without Vercel batch timeouts"},
    {"id": "U-02", "priority": "P0", "text": "Use one canonical engine across Vercel and Railway"},
    {"id": "U-03", "priority": "P0", "text": "Escalate JavaScript, PDF, and OCR work without penalizing ordinary HTML"},
    {"id": "U-04", "priority": "P1", "text": "Keep deployment and operating cost proportional to heavy-path volume"}
  ],
  "features": [
    {"id": "F-01", "needIds": ["U-01", "U-02"], "text": "Pure Rust extraction and discovery workspace"},
    {"id": "F-02", "needIds": ["U-01"], "text": "Bounded Vercel Rust API"},
    {"id": "F-03", "needIds": ["U-03"], "text": "Railway IBR/CDP browser worker using the Rust core"},
    {"id": "F-04", "needIds": ["U-03"], "text": "Railway OmniParse Native PDF/OCR worker"},
    {"id": "F-05", "needIds": ["U-01", "U-04"], "text": "Capability-aware routing, caching, deadlines, and queue backpressure"},
    {"id": "F-06", "needIds": ["U-02"], "text": "Versioned request/result contract and Atomize adapter"}
  ],
  "dataPoints": [
    {"id": "D-01", "featureIds": ["F-01", "F-06"], "text": "ExtractedContentV1 schema"},
    {"id": "D-02", "featureIds": ["F-05"], "text": "SourceCapabilityV1 strategy and failure profile"},
    {"id": "D-03", "featureIds": ["F-03", "F-04"], "text": "ExtractionJobV1, DocumentJobV1, and ExtractionResultV1 queue messages"},
    {"id": "D-04", "featureIds": ["F-05"], "text": "Per-stage timing, bytes, quality, and escalation reason telemetry"}
  ],
  "tests": [
    {"id": "T-01", "needIds": ["U-01"], "text": "Rust is non-inferior to production Readability on every critical corpus"},
    {"id": "T-02", "needIds": ["U-01"], "text": "Vercel cron completes as a bounded producer without extraction timeouts"},
    {"id": "T-03", "needIds": ["U-02"], "text": "Native Rust and Node binding return contract-equivalent output"},
    {"id": "T-04", "needIds": ["U-03"], "text": "Rendered HTML and OCR fixtures pass quality and provenance gates"},
    {"id": "T-05", "needIds": ["U-04"], "text": "Heavy-path concurrency stays within declared memory and queue limits"},
    {"id": "T-06", "needIds": ["U-01", "U-03"], "text": "SSRF, redirect, subresource, size, and decompression controls reject hostile fixtures"},
    {"id": "T-07", "needIds": ["U-01", "U-02"], "text": "Duplicate queue deliveries produce one effective article write and a durable failure audit"},
    {"id": "T-08", "needIds": ["U-01"], "text": "Feature flag restores the legacy extractor without schema rollback or data transformation"},
    {"id": "T-09", "needIds": ["U-01"], "text": "Single-article extraction returns that URL or an explicit failure and all counters satisfy attempted >= successful + failed"}
  ],
  "adrs": [
    {"id": "ADR-01", "text": "Canonical Rust core in blog-content-scraper"},
    {"id": "ADR-02", "text": "Separate Vercel Rust project before Vercel Services adoption"},
    {"id": "ADR-03", "text": "BullMQ remains the control plane"},
    {"id": "ADR-04", "text": "IBR/CDP stays Node and Railway-only"},
    {"id": "ADR-05", "text": "OmniParse Native owns deterministic document parsing and Railway OCR"},
    {"id": "ADR-06", "text": "First-party N-API binding instead of third-party prebuild wrapper"},
    {"id": "ADR-07", "text": "No removal of Readability until shadow non-inferiority passes"}
  ]
}
```

## Current State: Here

| Area | Current implementation | Evidence | Consequence |
|---|---|---|---|
| Published scraper | TypeScript/Next package with Readability, Cheerio, JSDOM, RSS parser, Turndown, and Playwright | [VERIFIED] `blog-content-scraper/package.json` | Large Vercel graph and duplicated production logic |
| Public demo API | `/api/scraper-test` always calls source orchestration, even for an article URL; direct `extractArticle`/`smartScrape` returns the requested 881-word control correctly | [VERIFIED live/local] The route returned an unrelated changelog URL; `attempted: 1`, `successful: 1331` | Primary defect is route/mode wiring and stats semantics, not inability to extract the control article |
| Internal duplication | Root `lib/` and `packages/sdk/src/` carry diverging orchestrator implementations | [VERIFIED] source comparison | Fixes and telemetry semantics drift between public surfaces |
| Atomize extraction | Separate canonical TS ladder: JSON-LD, Readability, Cheerio, browser, Docparse, LLM | [VERIFIED] `atomize-ai/lib/ingestion/extraction/extract.ts` | Preserve the ladder and replace only the document engine behind its adapter |
| Vercel backfill | Up to 50 extracts inside one 270-second cron budget | [VERIFIED] `app/api/cron/content-backfill/route.ts` | Recent production 300-second timeouts |
| RSS cron | Bounded to nine sources but still performs network orchestration in the request | [VERIFIED] `app/api/cron/refresh-rss/route.ts` | Timeout and source-failure coupling remains |
| Queue | BullMQ `content-extraction` already connects Vercel ingestion to Railway | [VERIFIED] queue and worker source | Reusable durable boundary exists |
| Browser | Playwright-core + Chromium, gated to Railway, waits for DOM stability | [VERIFIED] `tiers/browser.ts` | Correct placement, replaceable controller |
| Railway image | Shared Node image installs Chromium and dispatches by service name | [VERIFIED] `Dockerfile`, `nixpacks.toml`, dispatcher | Every role can inherit browser build weight |
| Atomize document tier | Python Docling service and Node client exist, but deployment was historically held; `ocr=auto` OCRs images only, not scanned PDFs | [VERIFIED local, UNVERIFIED live] | Current source is an integration shell, not a proven production-quality parser |
| User OmniParse | TypeScript SDK with passing XLSX/PPTX tests, rich spreadsheet extraction, deterministic chunks, and a generic router | [VERIFIED local] 51 assertions and typecheck pass | Correct package/API scaffold; PDF scanner, DOCX, OCR, and typed page/block evidence are missing |
| Market-research parser | In-process PyMuPDF, DOCX, PPTX-image, XLSX, image, and Tesseract parsers | [VERIFIED local] targeted parser suite 19/19; real mixed-PDF OCR probe recovered all three sentinel strings | Strong behavior oracle and source of algorithms; target should not inherit the Python runtime |
| Native OCR evidence | PyMuPDF plus local Tesseract recovered digital and OCR text from the mixed fixture; Spectra Apple Vision grounded live screen text exactly on macOS | [VERIFIED local/historical] | Tesseract is the P0 Linux baseline; Apple Vision remains a macOS adapter and comparator |
| Source learning | Outcomes are written but not read by the extraction router | [VERIFIED] source grep | Repeated known failures still pay probe cost |
| Production state | Vercel is READY on `origin/main`; local Atomize is 23 commits ahead | [VERIFIED live/local] | Migration must begin after branch reconciliation |
| Timing evidence | Root orchestrator now records elapsed time, but the duplicated SDK orchestrator still uses a collapsing elapsed-time formula | [VERIFIED] `lib/source-orchestrator.ts`, `packages/sdk/src/orchestrator/source-orchestrator.ts` | Existing cross-surface latency claims are not a trustworthy baseline |
| Accuracy gate | Quick F1 runner does not enforce the documented threshold, threshold rules disagree, and `tests/dragnet_data/` is absent | [VERIFIED] test runner, validators, tracked-file scan | Published F1 evidence cannot gate a Rust cutover yet |
| Candidate quality | Sitemap/HTML discovery can synthesize current dates; the package lacks Atomize's stronger junk/candidate gate | [VERIFIED] orchestrator and Atomize filter/selector source | False recency and false-positive candidates can inflate quality |
| Rust | No Cargo workspace or production Rust function | [VERIFIED] tracked-file scan | Rust migration has not started |

## Target State: There

```mermaid
flowchart LR
  User[Atomize UI and API] --> Web[Atomize Next.js on Vercel]
  Cron[Vercel cron triggers] --> Web
  Web -->|single URL, bounded| Fast[Scraper Fast API - Rust/Vercel]
  Web -->|ExtractionJobV1| Queue[(content-extraction)]
  Web -->|DocumentJobV1| DocQ[(document-extraction)]
  Fast --> Core[Canonical scraper-core Rust]
  Queue --> Heavy[Scraper Heavy Worker - Railway]
  Heavy --> CDP[IBR CDP + warm Chromium]
  Heavy --> Native[First-party N-API scraper-core]
  Heavy -->|binary reclassification| DocQ
  DocQ --> Doc[OmniParse Native - PDFium + OCR]
  Heavy -->|ExtractionResultV1| ResultQ[(content-extraction-results)]
  Doc -->|ExtractionResultV1| ResultQ
  ResultQ --> Writer[Atomize ingestion writer]
  Writer --> DB[(Supabase/Postgres)]
  Writer --> Downstream[Embedding, KG, clustering, summaries]
```

### Runtime rule

1. Known static source or interactive single URL: call Rust fast path.
2. Scheduled/bulk work: never loop through article-body extraction inside a
   Vercel cron. Backfill claims enqueue immediately. RSS cron may perform one
   explicitly bounded feed/sitemap discovery pass and candidate insertion before
   enqueueing bodies; its source, candidate, byte, and deadline caps are fixed.
3. Worker tries native Rust HTTP extraction first unless source capability says
   browser/document/wall.
4. Low confidence or JavaScript shell: render with IBR/CDP, then run the same
   Rust `extract_html` core.
5. PDF/image: enqueue the dedicated document queue; OmniParse Native parses
   native structure first, OCRs only deficient pages, and normalizes blocks into
   the same result contract.
6. Persist once through Atomize's writer, then fan out downstream work.

## Service Placement

### Placement decision matrix

Scores are 1 (weak) to 5 (strong). The weighted total is a planning comparison,
not permission to trade away an acceptance gate: every promoted option must
still pass accuracy, latency, and resource ceilings independently.

| Option | Accuracy 35% | Latency 20% | Lightness 15% | Reliability 15% | Cost 10% | Migration 5% | Weighted |
|---|---:|---:|---:|---:|---:|---:|---:|
| All Vercel | 3 | 4 | 3 | 2 | 4 | 3 | 315/500 |
| All Railway | 5 | 3 | 2 | 4 | 2 | 3 | 360/500 |
| Hybrid fast/heavy split | 5 | 5 | 4 | 4 | 4 | 3 | **450/500** |

Why hybrid wins: ordinary pages keep burst scaling, low idle cost, and the Rust
fast path; difficult pages retain warm Chromium, native binaries, larger memory,
and model-loading freedom. All-Vercel couples accuracy to function/runtime
limits. All-Railway pays warm-service cost and queue/network latency for pages
that do not need heavy state.

### Vercel Edge: routing only

Do not run extraction on the Edge Runtime. Current Vercel guidance recommends
Node over Edge for performance/reliability; Edge exposes limited APIs and small
bundles and must begin a response within 25 seconds. Rust Runtime is a Fluid
Function runtime, not Edge. Use existing Edge/Routing Middleware only for cheap
auth, routing, feature-flag, or cached-status decisions when Atomize already
needs that placement.

### Vercel: `atomize-web`

Code remains in `/Users/tyroneross/dev/git-folder/atomize-ai`.

Owns:

- UI, authentication, user-facing API, and source configuration.
- Cron triggers and source-selection leases.
- At most a bounded source/feed fetch per request.
- Queue production and job-status endpoints.
- Result persistence adapter during the migration.
- Feature flags and shadow sampling.

Must not own:

- Multi-article extraction loops.
- Chromium or OCR binaries.
- Extraction algorithms duplicated from scraper-core.
- Long-running downstream enrichment in the request lifecycle.

### Vercel: `scraper-fast-rs`

Code lives in this repository under `apps/scraper-fast-vercel/` and imports the
workspace crates directly. Deploy it as a separate Vercel project initially.

Endpoints:

- `POST /v1/extract`: one URL or supplied HTML, strict deadline and byte cap.
- `POST /v1/discover`: one source, bounded candidate count.
- `POST /v1/parse`: one bounded text/CSV/JSON/OOXML inline input or approved
  storage reference; deterministic parsers only.
- `GET /v1/health`: build, contract, and engine versions only.

No synchronous batch endpoint in P0. Batch belongs on the queue.
`/v1/extract` never falls through to discovery. It returns the requested URL,
its validated redirect/canonical equivalent, or a typed failure. `/v1/discover`
is the only endpoint allowed to return different article URLs.

`/v1/parse` never loads PDFium, Tesseract, Chromium, or ONNX. A PDF, image,
oversized archive, unsupported format, or deadline-risk input returns a typed
`document_worker_required` escalation. Small OOXML is eligible for Vercel only
after archive-bomb, output-parity, memory, cold-start, and platform-body-limit
tests pass; until then all Office files may conservatively use the same queue.

Reasons:

- Rust Runtime beta supports Fluid Compute and native observability.
- Isolation avoids JSDOM/Turbopack and Next.js dependency tracing.
- Separate deployment gives independent canary, rollback, and resource sizing.
- It avoids changing Atomize's project framework to Vercel Services during the
  engine migration.

Tradeoff: one internal/public HTTPS hop. Mitigate with keep-alive, regional
co-location, HMAC/OIDC service auth, and an optional Vercel Service Binding only
after a preview proves current Rust/Services compatibility.

### Railway: `scraper-heavy`

Code lives here under `apps/scraper-heavy-worker/`.

Runtime image contains:

- Node 24.
- `@tyroneross/interface-built-right` CDP engine.
- Chromium.
- First-party Linux N-API build of `scraper-core`.
- BullMQ client and contract package.

Owns:

- `ExtractionJobV1` consumption.
- Direct HTTP extraction through the native binding.
- Browser escalation with a warm browser/context pool.
- All-request CDP network policy, including subresources and redirects.
- Binary/document reclassification into the dedicated document queue.
- `ExtractionResultV1` publication.

Default worker sizing:

- Extraction jobs: concurrency 5.
- Browser contexts: concurrency 2 until memory testing raises it.
- Per-host concurrency: 1 by default, adaptive only from explicit source policy.
- Browser recycle: bounded by page count and resident memory.

Run the BullMQ browser consumer warm. Its persistent Redis connection is not
compatible with Railway's no-outbound-traffic sleep condition. A future sleeping
HTTP worker would require a separate always-on queue-to-push gateway and is not
part of P0.

### Railway: `omniparse-native`

Build the first-party document service in this repository under
`apps/omniparse-native-worker/`. The service is a Rust BullMQ consumer with an
optional authenticated private HTTP parity adapter for diagnostics and bounded
interactive calls. Its production image contains a reviewed
PDFium build, Tesseract/Leptonica, selected language data, and only the ONNX
models that have won a held-out segment. It does not contain Python, Docling,
Torch, Chromium, or an LLM.

Expose it only over Railway private networking or authenticated service access.
Keep one warm replica because the BullMQ consumer maintains outbound Redis
traffic and therefore cannot rely on Railway serverless sleep. Scale to zero is
not a P0 cost assumption.
Use a dedicated `document-extraction` queue and the shared versioned result
queue. The browser worker may reclassify a binary response into the document
queue, but it never waits synchronously for OCR.

### Document/OCR component decision

`OmniParse Native` is the document-engine product and compatibility API. This
means the user-owned `/Users/tyroneross/dev/git-folder/Omniparse` package, not
the unrelated public Python project with the same name. The earlier research
packet inspected the wrong project; its license and dependency conclusions are
not evidence about `@tyroneross/omniparse`.

P0 Railway CPU pipeline:

1. Validate magic bytes, MIME, archive expansion, bytes, pages, dimensions, and
   URL policy before parsing.
2. Parse native structure first. PDFium supplies PDF text, glyph geometry,
   images, and page rendering; robust ZIP/XML adapters handle OOXML. Never OCR a
   page whose native text coverage and quality already pass.
3. Classify every page independently as native-text, OCR-required, or mixed.
   Render and OCR only deficient regions/pages, so one scanned page does not make
   a 200-page digital PDF pay full OCR cost.
4. Use the Tesseract C API as the initial Linux recognizer because the existing
   PyMuPDF/Tesseract oracle recovered the complete mixed-PDF fixture. Keep the
   CLI implementation as a test oracle, not the concurrent production adapter.
5. Compare RapidOCR and current PaddleOCR ONNX/C++ deployments as recognizer and
   detector challengers. Promote by corpus segment only when character/word
   error, layout, latency, and peak-memory gates all pass. Do not install their
   Python frameworks in the production image.
6. Normalize native and OCR evidence into ordered page blocks with source,
   confidence, bounding box, table/image references, and engine/model version.
   Deterministic geometry resolves columns and reading order; no LLM generates
   parser truth.

The current Atomize defect becomes an explicit test: `ocr=auto` must retry low-
text pages in a PDF. URL extension is only a hint; response MIME and magic bytes
must route extensionless documents correctly.

### Existing-code reuse decision

| Source | Reuse | Do not carry forward |
|---|---|---|
| User OmniParse | SDK/router API, XLSX/PPTX normalization, rich spreadsheet semantics, Markdown/chunk behavior, 51-test compatibility suite | Raw PDF `BT/ET` scanner, untyped `metadata`, custom ZIP reader without complete bounds/CRC/descriptor handling |
| Market-research platform | PDF/page/table behavior, DOCX sections/tables, PPTX image/notes extraction, rich XLSX port, scan-density heuristic, Tesseract fixture path | Python runtime, dormant optional Docling fallback, mocked image-quality test, PDF parser that flags but never invokes OCR |
| Atomize | `ExtractedContent` contract, candidate scoring, fail-open ladder, SSRF policy, BullMQ, telemetry, idempotent writer | Document engine implementation and extension-only dispatch |
| Spectra | OCR `{label,bounds,confidence}` port, coordinate normalization, geometry clustering, live Apple Vision oracle | macOS-only capture as a Linux dependency, keyword-derived UI roles as document semantics |
| screen-extractor | Rust state-machine discipline, Unicode width handling, typed snapshots, differential-oracle test pattern | Terminal cell grid as PDF/document layout |
| Slide PDF Parser | Page-rendered image retention and slide-level asset provenance | Duplicate text-only PyMuPDF/PPTX parsers and optional LLM analysis |

### OmniParse compatibility surface

`packages/omniparse-compat` is not complete until every published export has an
owner and parity gate:

| Surface | Migration rule |
|---|---|
| `parse`, `detectInputType`, `ParseResult`, `OmniparseOptions` | Preserve signatures and normalized output in 1.x; add `document` only as an optional field |
| `parseMultiple`, directory recursion, concurrency, progress callback | Keep in the Node compatibility package as orchestration over the native binding; do not turn local paths into a cloud API |
| `parseExcelFile/Buffer`, `parseCSV`, Excel result/types/chunks | Golden parity against current SDK before selecting Rust; preserve direct imports from `./parsers` |
| `parsePptxFile/Buffer`, PPTX result/types | Golden parity for slides, notes, charts/diagrams, tables, and output order |
| `parsePythonFile/Source`, Python result/types | Retain the current TypeScript implementation initially; it is a source parser, not a document/OCR migration blocker |
| `extractRichContent` and rich Excel types | Preserve charts, comments, merges, links, names, images, and anchors through `formatData` |
| `omniparse` CLI, CJS/ESM/types exports | Package canary must run CLI and both module systems on Node 18/20/22/24 before publish |

Milestone 0 inventories all local/npm consumers and records export, import path,
option, and output-field usage. A 1.x canary runs current and compatibility
packages side by side. Any intentional break requires `@tyroneross/omniparse`
2.0, a migration note, and a retained 1.x rollback package; no implicit API
shrink is allowed because the new engine is native.

### Atomize: `ingestion-writer`

Initially this is the existing `scraper-worker` persistence code. In the target
state, it consumes `ExtractionResultV1` and owns all article writes. It can be
co-located with the existing BullMQ worker; it does not require a new paid
service unless queue isolation metrics justify one.

This keeps scraper code independent of the Atomize Prisma schema and gives one
idempotent write boundary.

## Repository Scaffold

```text
blog-content-scraper/
  Cargo.toml
  crates/
    ingestion-contract/      # shared web/document serde types and JSON Schema
    scraper-core/            # pure HTML -> candidates -> scored result
    scraper-net/             # SSRF-safe fetch, redirects, limits, robots
    scraper-discovery/       # RSS/Atom/JSON Feed/sitemap/HTML links
    omniparse-core/          # type routing, page/block normalization, quality
    omniparse-office/        # bounded OOXML/text/tabular parsers
    omniparse-pdf/           # PDFium adapter, native text, geometry, rendering
    omniparse-ocr/           # recognizer trait, Tesseract adapter, preprocessing
    scraper-eval/            # corpora, scorers, benchmark runner
  bindings/
    ingestion-node/          # first-party napi-rs web/document adapter
  packages/
    contracts-ts/            # generated TS types + Zod runtime schemas
    client-ts/               # server-only Vercel/queue client
    omniparse-compat/        # @tyroneross/omniparse-compatible TS surface
  apps/
    scraper-fast-vercel/     # Rust Vercel handlers
    scraper-heavy-worker/    # Node + IBR/CDP + native binding
    omniparse-native-worker/ # Rust + PDFium + Tesseract/optional ONNX
    web/                     # existing test/demo UI, optional
  evals/
    bundled/
    dragnet/
    wcxb/
    atomize-regressions/
    documents/
      born-digital/
      scanned/
      mixed/
      tables/
      office/
  docs/
    plans/
    contracts/
    operations/
```

Atomize consumes only `contracts-ts`, `client-ts`, and queue messages. Existing
consumers of `@tyroneross/omniparse` use `omniparse-compat` while its live
XLSX/PPTX behavior is ported and verified. The source OmniParse repository stays
unchanged until compatibility gates permit a deliberate move; Atomize does not
import parser internals.

## Rust Dependency Strategy

P0 dependencies:

- `tokio`, `reqwest` with rustls, `url`, `serde`, `serde_json`, `chrono`.
- `feed-rs` (current 2.4 line) for one RSS/Atom/JSON Feed model.
- `quick-xml` for streaming sitemap parsing.
- A `RobotsPolicy` adapter with `robotxt` as the feature-complete candidate and
  Google's native-Rust `robotstxt` port as the matching oracle; choose only
  after RFC 9309, sitemap, crawl-delay, Common Crawl, and fuzz conformance tests.
- `schemars` for JSON Schema generation.
- `sha2` for compatibility with current content hashes.
- `tracing` and OpenTelemetry-compatible export.
- `napi-rs` for the Railway/Node binding.
- `vercel_runtime` only in the Vercel adapter crate.
- `zip` plus `quick-xml` for bounded OOXML parsing; archive expansion and XML
  depth/size limits sit in first-party adapters.
- `pdfium-render` behind a first-party `PdfEngine` trait for text geometry and
  page rasterization. Pin the wrapper and reviewed PDFium binary/checksum.
- Tesseract/Leptonica behind a first-party `OcrEngine` FFI adapter. Keep trained
  data explicit and versioned by language.
- An ONNX Runtime adapter only in the Railway OCR feature set; no model runtime
  enters `scraper-fast-vercel`.

Extractor candidate:

- Pin `rs-trafilatura` to a reviewed revision behind `Extractor` trait.
- Do not trust its README benchmarks as acceptance evidence.
- Keep a first-party metadata/quality reconciliation layer so output is stable
  if the underlying extractor changes.
- If corpus non-inferiority fails, port the minimum validated Readability logic
  or run Readability as the production fallback. Rust is not the acceptance
  criterion; extraction quality is.

Do not use the separate `napi-rs-trafilatura` package. Its thin wrapper builds,
but a first-party binding gives deterministic Linux artifacts and contract
mapping without depending on third-party optional-package publication.

## Contract

### `ExtractionRequestV1`

```json
{
  "schemaVersion": "1.0",
  "requestId": "uuid",
  "url": "https://example.com/article",
  "html": null,
  "deadlineMs": 10000,
  "maxBytes": 10485760,
  "respectRobots": true,
  "requestedOutputs": ["text", "markdown", "metadata"]
}
```

### `DocumentParseRequestV1`

```json
{
  "schemaVersion": "1.0",
  "requestId": "uuid",
  "source": {
    "kind": "storage",
    "provider": "vercel-blob",
    "key": "project/source/version/file.docx",
    "version": "opaque-version",
    "fileName": "file.docx",
    "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "sizeBytes": 1048576,
    "sha256": "hex"
  },
  "deadlineMs": 8000,
  "maxInputBytes": 3145728,
  "maxOutputBytes": 3000000,
  "requestedOutputs": ["text", "markdown", "metadata", "artifacts"]
}
```

`source` is discriminated as `storage` or `inline`. `storage` accepts only an
approved provider plus opaque key/version; the service resolves credentials from
its own scoped identity and never accepts client-supplied cloud credentials or a
signed URL in logs. `inline` uses base64 bytes and is capped at 3 MiB raw so JSON
and base64 overhead remain below Vercel's current 4.5 MB request/response payload
limit. MIME, filename, declared size, checksum, and magic bytes must agree.

The service-auth claim must authorize the project/object scope. Inputs or
projected responses above the declared caps become `DocumentJobV1`; large results
are persisted by the worker and returned by reference through the job-status
API. `/v1/parse` never accepts local filesystem paths or directory recursion.

### `DocumentJobV1`

Required fields: `schemaVersion`, deterministic `jobId`, `requestId`, optional
`parentJobId`, the same discriminated `source`, `ocrPolicy` (`off`, `auto`, or
`force`), requested outputs, absolute deadline, byte/page/archive/pixel/output
caps, parser policy version, and attempt metadata. The worker emits
`ExtractionResultV1` with all three IDs, result checksum/reference, terminal or
retryable outcome, per-engine versions, and stage timings. Queue messages never
contain file bytes, cloud credentials, or signed URLs.

### `ExtractedContentV1`

Required fields:

- `schemaVersion`, `engineVersion`, `requestId`.
- `url`, `canonicalUrl`, `title`, `text`, `markdown`.
- `tier`, `method`, `quality`, `confidence`, `wordCount`, `contentHash`.
- `metadata` including author, publication time, site, language, and image.
- `evidence` naming selected DOM/structured-data sources without raw secrets.
- `timings` by DNS, connect, download, parse, score, render, and OCR.
- `warnings` and a closed `failureClass`/`escalationReason` enum.

Dates cross the wire as ISO-8601 strings. TypeScript converts them only at the
application edge. Raw HTML is excluded by default and enabled only for bounded
debug/admin use.

### `ParsedDocumentV1`

Document parsing produces a richer internal object and then projects its text,
Markdown, metadata, quality, and provenance into `ExtractedContentV1`:

```json
{
  "schemaVersion": "1.0",
  "documentId": "sha256:...",
  "format": "pdf",
  "text": "...",
  "markdown": "...",
  "pages": [
    {
      "number": 1,
      "width": 612,
      "height": 792,
      "source": "mixed",
      "blocks": [
        {
          "id": "p1-b4",
          "kind": "paragraph",
          "text": "...",
          "bbox": [72, 96, 540, 144],
          "order": 4,
          "source": "ocr",
          "confidence": 0.94,
          "engine": "tesseract",
          "modelVersion": "eng-fast@sha256:..."
        }
      ]
    }
  ],
  "tables": [],
  "images": [],
  "chunks": [],
  "formatData": {"kind": "pdf"},
  "metadata": {},
  "diagnostics": {"ocrPages": [1], "warnings": []}
}
```

`source` is closed to `native_text`, `ocr`, or `mixed`. Bounding boxes use PDF
page coordinates and retain the transform needed to map rendered pixels back to
the page. Confidence belongs to the producing engine; cross-engine quality is a
separate calibrated score and must not merge incompatible confidence scales.

`formatData` is a required discriminated union so the normalized block view does
not discard source semantics:

- `pdf`: page labels, outlines, native objects, encryption status, and render
  transforms.
- `spreadsheet`: sheets, cell ranges, charts/series, comments, hyperlinks, named
  ranges, merged cells, images/anchors, and formula/value provenance.
- `presentation`: slides, shape order/geometry, speaker notes, charts, tables,
  diagrams, media, and alt text.
- `word`: sections, heading hierarchy, paragraphs/runs, tables, lists, headers,
  footers, footnotes/endnotes, comments, and embedded media.
- `text` or `source_code`: encoding, language, and typed symbol/section data.

`chunks` reference stable page/block/artifact IDs; compatibility adapters may
render legacy chunks without re-parsing. New format-specific fields are additive
within v1. Removing or changing an existing OmniParse field requires a major
package/contract version.

### Escalation classes

- `none`
- `javascript_shell`
- `low_confidence`
- `blocked_403`
- `rate_limited`
- `pdf`
- `image`
- `paywall`
- `unreachable`
- `invalid_source`
- `deadline_exceeded`

`paywall`, explicit denial, and repeated true walls are terminal. The system
must not label them browser-recoverable without a successful observed result.

## Routing and Caching

### Queue topology

| Queue | Producers | Consumer | Retry and result rule |
|---|---|---|---|
| `content-extraction` | Atomize backfill/RSS insertion; interactive async requests | `scraper-heavy` | Maximum three attempts for typed transient transport/5xx/429 failures with jittered exponential backoff; terminal failures stay in BullMQ failed-job storage and emit an audit result |
| `document-extraction` | Atomize for known file kinds; `scraper-fast-rs` or `scraper-heavy` after MIME/magic-byte reclassification | `omniparse-native` | Same bounded retry policy; parse-empty/unsupported/password-required are terminal, not blind retries |
| `content-extraction-results` | `scraper-heavy` and `omniparse-native` | Atomize single writer | Writer deduplicates by result/job ID and records written, no-op, stale, or failed |

`requestId` spans the user/product request. `jobId` is deterministic from source
identity, validator/content checksum, engine version, and requested outputs.
Reclassification creates `DocumentJobV1` with `parentJobId` and the same
`requestId`; duplicate reclassification produces one effective document job.
The native worker consumes `document-extraction` directly and never competes for
browser queue capacity. BullMQ failed-job retention is the initial DLQ; removal
requires a separately accepted retention/replay policy.

### Capability-aware router

Source profile fields:

- `preferredStrategy`: static, browser, document, terminal.
- `lastSuccessTier`, `lastFailureClass`, `successRate`.
- `p50Ms`, `p95Ms`, `lastCheckedAt`, `expiresAt`.
- `consecutiveFailures`, `retryAfter`, `policyVersion`.

Routing uses the profile only as a hint. A stale profile expires and re-probes.
A browser classification requires a prior successful browser extraction, not
merely a static failure.

### Cache hierarchy

1. HTTP validators: ETag and Last-Modified.
2. Redis shared result cache keyed by canonical URL, validator/content hash,
   requested outputs, and engine version.
3. Optional Vercel Runtime Cache as regional L1 only.
4. Short negative cache for terminal 404/paywall/invalid-source outcomes.

Cache never overrides robots policy, auth policy, or a caller's explicit
freshness requirement.

## Deadlines and Backpressure

- One absolute request deadline propagates through DNS, redirects, body read,
  parse, scoring, browser rendering, OCR, and persistence.
- Aborting the deadline cancels underlying work; it does not merely reject the
  caller while work continues.
- Fast API default: 10 seconds, one URL, 10 MB compressed response body, bounded
  decompressed size and DOM node count.
- Discovery default: 8 seconds, 100 candidates, 5 sitemap documents.
- Browser default: 25 seconds end to end with DOM-stability wait.
- OmniParse Native default: queue-backed 120-second job deadline with explicit
  document, page, archive-expansion, OCR-pixel, and output caps.
- Retries only for idempotent transport failures, 429 with Retry-After, and
  selected 5xx responses. Never retry ordinary 4xx, paywalls, or parse-empty
  outcomes blindly.
- Queue attempts use exponential backoff plus jitter and a terminal failed-job
  record; poison jobs must not block newer work.

## Threat Model

Threat-model artifact: this section. Primary web risk: OWASP Server-Side Request
Forgery. Agentic-risk classification is not applicable because no LLM is given
tool autonomy in the P0 scraper path.

Controls:

- Resolve and reject private, loopback, link-local, metadata, multicast, and
  reserved IP ranges before every request.
- Re-resolve and validate every redirect.
- In Chromium, validate every network request, including XHR, scripts,
  stylesheets, frames, WebSockets, and top-level navigation.
- Prevent DNS rebinding by binding the validated resolution to the connection or
  revalidating at connect time.
- Cap redirects, headers, compressed bytes, decompressed bytes, DOM nodes,
  document pages, OCR pixels, and output bytes.
- Never provide browser pages with application cookies, cloud credentials,
  internal service URLs, or database credentials.
- Run browser contexts isolated; clear storage and service workers between jobs.
- Authenticate service calls and queue producers; authorize result persistence.
- Validate queue schemas and idempotency keys before side effects.
- Respect robots policy by default and record the policy decision.
- Do not implement paywall or CAPTCHA bypass.

## Observability

Emit one trace spanning producer -> queue -> fetch/render/OCR -> extraction ->
writer. Required events:

- `scrape.request.accepted`: request ID, source host, mode, deadline.
- `scrape.fetch.completed`: status, redirects, bytes, validator, latency.
- `scrape.extract.candidate`: tier, quality, word count, failure class.
- `scrape.extract.selected`: engine version, tier, quality, content hash.
- `scrape.escalated`: reason, source capability, target service.
- `scrape.browser.completed`: navigation, stability, blocked request counts.
- `scrape.document.completed`: format, pages, native/OCR/mixed counts,
  recognizer/model versions, quality, latency, and peak memory.
- `scrape.persist.completed`: article ID, idempotent/no-op/written, latency.
- `scrape.job.failed`: stage, attempt, retry class, terminal flag.

Never log article text, credentials, signed service URLs, or full query strings.

Dashboards:

- Success and quality by source and tier.
- Fast/browser/document distribution.
- p50/p95/p99 end-to-end and stage latency.
- Timeout, 403, 429, invalid source, and terminal wall counts.
- Queue age, active jobs, retries, failed jobs, and worker memory.
- Cost proxy: active CPU, provisioned memory, Chrome minutes, OCR pages.

## Native Document DOE

No existing repo establishes broad OmniParse or OCR quality. Current evidence is
narrow but real: OmniParse's 51 assertions cover primarily XLSX/PPTX behavior;
the market-research parser suite passes 19 targeted tests; the mixed-PDF probe
recovers all three native/OCR sentinels; Spectra proves live macOS OCR grounding.
Milestone 6 must turn those seeds into one reproducible corpus before cutover.

| Hypothesis | Experiment | Promote only when |
|---|---|---|
| H-DOC-01: PDFium is a stronger native PDF base than the current raw scanner without exceeding the worker envelope | Run PDFium, PyMuPDF oracle, current OmniParse, and a pure-Rust probe over born-digital, encrypted, malformed, multi-column, table, and mixed PDFs | PDFium is non-inferior on text/block completeness and reading order, passes hostile fixtures, and meets latency/RSS ceilings |
| H-OCR-01: Per-page/region OCR preserves accuracy while reducing work | Compare full-document OCR with native-first page classification on mixed PDFs | Same CER/WER and block recall within tolerance, at least 50% fewer OCR pixels on mixed holdouts, no missed scanned page |
| H-OCR-02: Tesseract is the best initial default but not necessarily every-segment winner | Compare Tesseract fast/best, RapidOCR ONNX, PaddleOCR ONNX/C++, and Apple Vision where available | Winner satisfies each declared language/scan/table segment; aggregate gains cannot hide a critical-segment regression |
| H-OFFICE-01: Rust OOXML can replace current TS/Python dependencies without semantic loss | Replay OmniParse and market-research XLSX/PPTX/DOCX fixtures through TS, Python, and Rust | Golden text/table/image/note/chart/comment outputs match after documented normalization and malformed/archive limits pass |
| H-LAYOUT-01: Deterministic geometry is sufficient for parser truth | Compare column/line/block clustering with labeled page order and table boundaries | Reading-order and block/table metrics pass without an LLM; uncertain blocks remain marked, not invented |
| H-PLACE-01: OCR stays off Vercel without harming end-to-end latency | Replay the production mix through Vercel fast classification plus Railway queue/worker | Static requests retain fast p95; document queue age and completion SLO pass at measured cost |

Corpus strata are evaluated separately: born-digital PDF, scanned clean, scanned
noisy/skewed/rotated, mixed PDF, multi-column, tables/forms, multilingual,
screenshots, DOCX, PPTX, and XLSX. Record CER, WER, token completeness, block F1,
reading-order score, table cell F1, metadata match, p50/p95 latency, OCR pixels,
peak RSS, cold start, and output size. Store engine versions, model checksums, and
per-page provenance with every run.

The selection rule is Pareto-constrained: accuracy floors are hard gates. Among
engines that pass, choose the fastest/lightest for that segment. A faster or
smaller engine never compensates for an accuracy failure.

### Executable initial gates

These are P0 promotion floors, not aspirational dashboard targets. Each PDF/OCR
stratum needs at least 20 independently sourced documents and 100 labeled pages;
each supported non-English language needs its own 100-page stratum. DOCX, PPTX,
and XLSX each need at least 20 files plus every imported compatibility fixture.
If the minimum set is unavailable, that segment remains unsupported/unpromoted.

| Gate | Required result |
|---|---|
| G-OCR-CLEAN | English machine print CER <=1.0% and WER <=3.0%; zero missing sentinel on critical fixtures |
| G-OCR-HARD | Noisy, skewed, rotated, or declared multilingual segment CER <=4.0% and WER <=10.0%; no more than 0.5 percentage-point CER regression versus the best existing oracle |
| G-COMPLETE | >=98% reference token completeness per document; no critical document below 95% without adjudicated non-content removal |
| G-BLOCK | Text/block detection F1 >=0.95; >=99.5% of emitted boxes are finite and inside page bounds |
| G-ORDER | Normalized Kendall reading-order score >=0.97 born-digital and >=0.93 scanned/multi-column |
| G-TABLE | Exact normalized table-cell F1 >=0.95 overall and >=0.90 in the complex-table stratum; no row/column count error on critical financial tables |
| G-OFFICE | 100% of current OmniParse public fixtures retain normalized sheets/slides/sections, notes, tables, charts, comments, links, names, merges, images, and chunks; added DOCX fixtures meet the same field-level rule |
| G-PERF | On the recorded 2-vCPU x86_64 reference runner: born-digital PDF p95 <=250 ms/page; OCR p95 <=4 s/page warm at 300 DPI; <=1 GB peak RSS at concurrency 1 and <=1.5 GB at concurrency 2 |
| G-QUEUE | <=10-page document completion p95 <=60 s at steady state; queue age p95 <=30 s; one terminal audit result for every accepted job |

Labels and adjudications are versioned. Holdouts are not used for tuning; a
candidate release gets one scored holdout run. Ambiguous ground truth requires a
recorded two-reviewer adjudication. Promotion fails on any critical document or
segment gate even when aggregate metrics improve.

## Acceptance Criteria

| ID | Criterion | Pass condition |
|---|---|---|
| T-01 | Extraction accuracy | Rust is no worse than production Readability by more than 0.5 F1 points on each critical corpus; no critical-source regression is accepted without an explicit adjudication |
| T-01a | Metadata accuracy | Title/author/date/canonical exact-match or normalized-match is non-inferior on held-out fixtures |
| T-01b | Completeness | No promoted output loses more than 5% of reference article tokens unless the removed tokens are labeled boilerplate |
| T-02 | Vercel cron | Backfill performs claim/enqueue/return only; RSS may perform bounded feed/sitemap discovery but no article-body extraction; both return under 15 seconds p95 and record zero extraction runtime timeouts for seven days |
| T-03 | Contract parity | Native Rust, N-API, and HTTP adapters pass the same golden contract fixtures byte-for-byte after timestamp normalization |
| T-04 | Browser recovery | Every browser-promoted source proves a static failure and successful rendered extraction above quality threshold |
| T-04a | OCR text | Mixed-PDF oracle and G-OCR-CLEAN/G-OCR-HARD/G-COMPLETE pass; no aggregate score can hide a critical-segment regression |
| T-04b | Document structure | G-BLOCK/G-ORDER/G-TABLE/G-OFFICE pass for born-digital, scanned, mixed, table, and Office holdouts |
| T-04c | Document resource/SLO | G-PERF and G-QUEUE pass with engine/model checksums and reference hardware recorded |
| T-05 | Fast performance | Parse-only p95 <= 50 ms for HTML <= 2 MB on the reference runner; end-to-end static p95 <= 2 seconds excluding source-controlled slow responses |
| T-05a | Resource ceiling | Vercel fast path remains within 2 GB; browser worker survives declared concurrency without OOM or queue starvation |
| T-06 | Security | Hostile SSRF, redirect, DNS-rebinding, decompression, oversized-document, and Chromium-subresource fixtures are rejected before protected access |
| T-07 | Reliability | At-least-once duplicate jobs produce one effective article write and preserve a failed-job audit record |
| T-08 | Rollback | Feature flag returns Atomize to the current TS/Readability path without schema rollback or data transformation |
| T-09 | Result identity and stats | `/v1/extract` returns the requested/redirect-equivalent document or a typed failure; every response satisfies `attempted >= successful + failed` and successful never exceeds attempted |

## Approach Lenses

Analytical lens: DSM for component dependencies, Pugh selection for platform and
queue options, and backcasting for migration.

### Clean-sheet best approach

One extraction monorepo owns contracts, Rust core, Vercel API, Railway browser,
Railway document parsing, and evals. Atomize sends versioned requests and
persists versioned results. No parser code lives in Atomize.

### Current-constraints approach

Keep Atomize's existing queue, worker, writer, browser tier, and document-client
boundary.
Introduce the Rust core first through shadow adapters, then move generic service
code after parity. This avoids combining queue, persistence, engine, and
deployment changes in one release.

### Bridge/backcast

1. Freeze contract and corpus.
2. Build and benchmark pure Rust core with no production routing.
3. Add N-API and Vercel adapters in shadow mode.
4. Flip single-URL fast extraction behind a flag.
5. Turn Vercel batch crons into queue producers.
6. Replace Railway Playwright controller with IBR/CDP while retaining output.
7. Move generic browser service code and the OmniParse compatibility surface
   into the ingestion monorepo.
8. Delete duplicate Atomize extraction only after rollback window closes.

### Recommendation

Execute the constrained bridge. The clean-sheet target is correct, but the
current 23-commit local/production gap, unauthenticated Railway state, and beta
Vercel Rust/Services surfaces make a flag-day move unjustified.

## ADRs

### ADR-01: Rust core is canonical

Decision: Pure extraction, quality scoring, metadata normalization, discovery,
and network policy live in this repository.

Alternatives: keep Atomize TypeScript canonical; fork logic in both repos.

Tradeoff: Rust expertise and build tooling are required. Benefit: one fast,
memory-efficient engine and no JSDOM production dependency.

Rollback: Atomize retains the current extractor behind `SCRAPER_ENGINE=legacy`
until shadow acceptance and a defined rollback window pass.

### ADR-02: Separate Vercel project first

Decision: Deploy `scraper-fast-rs` separately from Atomize's Next project.

Alternatives: N-API inside Next; change Atomize to Vercel Services immediately.

Tradeoff: an HTTPS hop and service auth versus stronger isolation and rollback.

Rollback: route the Atomize client back to its in-process legacy adapter.

### ADR-03: Keep BullMQ/Redis

Decision: Reuse the current cross-cloud queue.

Alternatives: Vercel Queues poll mode or Vercel Workflow.

Tradeoff: continue operating Redis. Avoid a beta dependency, missing native
DLQ, a second queue system, and a queue migration during engine replacement.
Current Vercel Queue retention of up to seven days is sufficient for many jobs
and is not itself a rejection reason.

Revisit: Vercel Queues GA, an accepted poison-message/DLQ policy, and a measured
lower failure and operating burden than BullMQ.

### ADR-04: Browser stays Node/IBR on Railway

Decision: Replace Playwright control with IBR's custom CDP engine, not a Rust
browser replacement.

Alternatives: Chromium in Vercel; Rust CDP library; keep Playwright.

Tradeoff: a mixed Node/Rust worker. Benefit: reuse validated DOM-stability and
browser lifecycle code while Chrome remains the dominant resource.

Rollback: worker flag selects the current Playwright browser tier.

### ADR-05: OmniParse Native owns document parsing

Decision: Replace the dormant Docling target with a first-party Rust document
engine that preserves the user-owned OmniParse API and ports only verified local
behavior. PDFium supplies PDF interpretation/rendering; Tesseract is the first
proven OCR baseline; additional recognizers remain pluggable challengers.

Alternatives: keep Docling/Python; keep the current OmniParse PDF scanner; use a
paid parser API; run every document through a vision LLM.

Tradeoff: we own PDF/OCR integration, model packaging, and a larger evaluation
surface. Benefit: no paid parser dependency, no Python/Torch hot path, one typed
contract, targeted OCR cost, and direct reuse of working local algorithms.

Rollback: Atomize selects the current `docparse` adapter or disables document
escalation without affecting HTML extraction.

### ADR-06: First-party N-API binding

Decision: Build `bindings/ingestion-node` with napi-rs.

Alternatives: third-party `napi-rs-trafilatura`; subprocess CLI; WASM.

Tradeoff: cross-platform release work. Benefit: deterministic artifacts,
contract mapping, lower call overhead, and project-controlled provenance.

Rollback: Node worker calls Rust fast API or legacy TS extractor.

### ADR-07: Readability is the migration oracle

Decision: Rust must beat or match the current production baseline before flip.

Alternatives: replace based on speed or upstream README benchmarks.

Tradeoff: dual-run shadow cost during migration. Benefit: accuracy is protected.

Rollback: immediate feature-flag selection of Readability.

## Core Assumptions

| Assumption | Basis | Falsifier | Response |
|---|---|---|---|
| At least 80% of supported pages remain static-fetchable | Historical 57-source probe and current architecture | Browser/document share exceeds 30% for 14 days | Re-evaluate worker capacity and fast-path placement |
| Rust can meet Readability quality | `rs-trafilatura` candidate plus existing algorithms | T-01 fails after bounded tuning | Keep Readability or port validated missing logic |
| Existing BullMQ is sufficiently durable | Current production producer/consumer code | Lost/stuck jobs or queue SLO miss | Run Vercel Queue poll-mode bakeoff after GA |
| One warm browser worker is enough initially | Heavy path expected minority | Queue age p95 > 60 seconds or CPU/memory saturation | Add replicas or source-based partitions |
| Tesseract is a valid P0 OCR baseline, not the universal winner | Existing mixed-PDF oracle passed; market-research path passed the same sentinel probe live | A challenger wins a declared segment without violating resource ceilings | Route that segment through the versioned `OcrEngine` policy |
| PDFium can provide the required native PDF geometry/rendering | Chromium lineage and maintained Rust wrapper; not yet benchmarked in this repo | Corpus, binary packaging, license, or resource gate fails | Keep PyMuPDF as the oracle and evaluate another reviewed native PDF engine |
| Vercel Rust beta is acceptable behind a fallback | Official beta support plus reversible adapter | Error/cold-start regression above threshold | Keep Rust on Railway and use Node/N-API on Vercel temporarily |
| Production can be reconciled before migration | Local is 23 commits ahead of deployed origin | Release blocker cannot close safely | Build in isolated branch but do not route production |

## Tradeoffs Made

1. First-party native core over language uniformity theater: Rust owns web and
   document normalization, Node owns IBR/CDP, and C/C++ engines sit behind narrow
   FFI traits. Python implementations remain test oracles during migration.
2. Two compute platforms over one: Vercel for bursty fast work, Railway for warm
   stateful/native work. This minimizes normal latency without forcing Chrome
   into every invocation.
3. Existing queue over newest platform feature: BullMQ avoids simultaneous
   infrastructure migration and supports current workers.
4. Network API over in-process Atomize parser: adds a small hop but isolates
   dependencies, versions the engine, and enables independent rollout.
5. Shadow cost over risky replacement: dual extraction is temporary and sampled;
   it buys measurable accuracy protection.
6. Separate worker images over one dispatcher image: slightly more deployment
   configuration, substantially smaller blast radius and idle footprint.

## Capability Gap Map

| Capability | Current source | Target | Gap | Build action | Validation |
|---|---|---|---|---|---|
| Canonical extraction | Atomize TS plus scraper package | `scraper-core` Rust | Duplicate owners | Contract-first Rust core and adapters | T-01, T-03 |
| Feed/sitemap discovery | TS orchestrators | Rust bounded discovery | Sequential/repeated probes | Shared deadline and raced candidates | Discovery corpus and p95 |
| Vercel scheduled work | Synchronous extraction batches | Producer only | Runtime timeouts | Enqueue and return bounded stats | T-02 |
| Source learning | Writes capability only | Reads and routes | Dormant feedback loop | TTL profile router | Routing integration tests |
| Browser control | Playwright-core | IBR CDP | Heavy dependency and generic image | Dedicated worker/image | T-04, memory load test |
| Browser network safety | Main navigation checks | Every request checked | Subresource SSRF exposure | CDP request policy | T-06 |
| Document parsing | User OmniParse plus market-research Python parsers and dormant Docling adapter | `omniparse-core/office/pdf` plus private native worker | Fragmented contracts; weak PDF; OCR not routed | Port verified behavior, add page/block contract, PDFium, per-page OCR | T-04a, T-04b |
| Persistence boundary | Worker extracts and writes | Versioned result -> writer | Scraper knows Atomize schema | Result queue adapter | T-07 |
| Cross-runtime types | Handwritten TS | JSON Schema generated TS/Zod | Drift risk | `schemars` generation check | CI diff gate |
| Evaluation | TS DOE branch | Cross-engine corpus runner | Rust untested locally | Add Rust/Readability/production comparators | T-01 suite |

## From Here to There

### Dispatch Map

| Milestone | Dispatch tier | Risk boundary | Primary judgment |
|---|---|---|---|
| M0 | `dispatch_tier: sonnet` | deployment | Reconcile deployed state and establish evidence |
| M1 | `dispatch_tier: opus` | runtime protocol | Freeze a cross-language public contract and accuracy baseline |
| M2 | `dispatch_tier: opus` | security boundary | Bound network concurrency, cancellation, and hostile inputs |
| M3 | `dispatch_tier: sonnet` | deployment | Introduce reversible Vercel shadow traffic |
| M4 | `dispatch_tier: sonnet` | persistence contract | Change cron work into idempotent queue production |
| M5 | `dispatch_tier: opus` | deployment | Combine Rust parsing with IBR/CDP browser isolation |
| M6 | `dispatch_tier: opus` | deployment | Activate measured OmniParse Native document/OCR escalation |
| M7 | `dispatch_tier: sonnet` | deployment | Cut over only after production non-inferiority gates |

### Milestone 0: Reconcile and baseline

Goal: establish a deployable baseline before introducing Rust.

Actions:

1. Reconcile Atomize local `main` (23 commits ahead) with production and complete
   the existing release gates.
2. Restore Railway read access and capture service names, deploy revisions,
   memory/CPU, queue age, and current document-service state.
3. Contain the current public wrong-document failure before Rust: give the demo
   route an explicit article/listing mode, route article requests through the
   direct extractor, and return a typed failure instead of silently substituting
   feed/sitemap content.
4. Repair and lock measurement semantics before benchmarking: one elapsed-time
   implementation across root/SDK orchestrators, separate discovery/extraction
   counters, retry-state reset, and tests with a controlled non-zero delay.
5. Replace the non-enforcing quick F1 command with one executable acceptance
   gate; restore a license/provenance-safe corpus and version its references.
6. Export the current extraction contract and production source corpus.
7. Materialize DOE datasets from `codex/scraper-doe` into a versioned eval
   package without changing production routing.
8. Add candidate and metadata holdouts for synthetic dates, cross-host links,
   navigation/legal/feed pages, ambiguous slugs, and JSON-LD precedence.
9. Add the live wrong-document regression: article-shaped input must never return
   an unrelated feed/sitemap candidate, and statistics must satisfy invariants.
10. Record seven days of tier, quality, valid latency, timeout, and source-failure
   data.
11. Inventory every `@tyroneross/omniparse` consumer by package version, import
   path, exported symbol, option, output field, CLI use, and Node/module format;
   freeze the export-by-export compatibility matrix and 1.x rollback package.

Exit gate: current TS path is deployable, reproducible, and benchmarked; the
acceptance command fails on a below-threshold fixture, and elapsed-time tests
prove both public orchestrators report real duration. The OmniParse consumer and
export matrix has no unknown owner.

### Milestone 1: Contract and Rust walking skeleton

Goal: prove one URL -> one canonical result locally.

Actions:

1. Add Cargo workspace and `ingestion-contract`.
2. Generate TypeScript/Zod types and fail CI on drift.
3. Implement `scraper-core::extract_html` behind an `Extractor` trait.
4. Integrate pinned `rs-trafilatura` candidate plus first-party reconciliation.
5. Add the N-API adapter and local CLI only for verification.
6. Run all golden fixtures through Rust and current Readability.

Exit gate: T-01 and T-03 pass locally. No production routing.

### Milestone 2: Network and discovery

Goal: make the Rust service safe and bounded.

Actions:

1. Add SSRF-safe resolver/fetcher with redirect and body limits.
2. Add robots, feed, sitemap, and HTML discovery under one deadline.
3. Implement per-host limiter with real overlapping global concurrency.
4. Add validators, content hash, capability profile, and Redis cache adapter.
5. Add hostile fixtures and cancellation tests.

Exit gate: T-05 and T-06 pass; cancellation stops underlying work.

### Milestone 3: Vercel shadow service

Goal: validate Rust Runtime and network placement without user-visible change.

Actions:

1. Deploy `scraper-fast-rs` preview as a separate Vercel project.
2. Add HMAC/OIDC service auth, rate limits, and observability.
3. Prove `/v1/extract` identity and counter invariants against the live regression
   set before shadow traffic.
4. Shadow 5% of eligible Atomize extracts; do not persist Rust results.
5. Compare text, metadata, quality, latency, errors, and cost proxies.
6. Raise sampling to 25% only after no critical regression for seven days.

Exit gate: T-01, T-03, and T-05 pass in production shadow; rollback tested.

### Milestone 4: Remove Vercel batch work

Goal: eliminate the observed serverless timeout class.

Actions:

1. Change content backfill to claim rows, enqueue `ExtractionJobV1`, and return.
2. Keep RSS refresh bounded to source discovery and article insertion; enqueue
   extraction/enrichment separately.
3. Make jobs idempotent by article ID, URL normalization, engine version, and
   content hash.
4. Add queue-age and producer-completion SLOs.

Exit gate: T-02 passes for seven days and the per-run reconciliation assertion
`claimed = queued + terminal_failures` passes in production telemetry.

### Milestone 5: Railway heavy path

Goal: make browser escalation lighter and share the Rust core.

Actions:

1. Create dedicated multi-stage browser worker image.
2. Replace Playwright control with IBR CDP behind a reversible flag.
3. Load first-party Linux N-API core and parse rendered HTML locally.
4. Enforce SSRF policy on every CDP network request.
5. Add browser pool, recycle limits, health endpoint, deploy draining, and
   memory/concurrency load tests.
6. Publish `ExtractionResultV1` to the result queue.

Exit gate: T-04 through T-07 pass and browser memory is stable for a 24-hour soak.

### Milestone 6: Documents and OCR

Goal: activate document extraction without coupling it to HTML traffic.

Actions:

1. Freeze `ParsedDocumentV1` and the `PdfEngine`/`OcrEngine` traits before engine
   code moves.
2. Import the user OmniParse compatibility tests and market-research parser
   fixtures. Add the existing mixed DOCX/PDF OCR oracle unchanged.
3. Build `omniparse-core` plus bounded text/OOXML parsers; port XLSX/PPTX/DOCX
   behavior with golden parity before retiring either source implementation.
4. Build the Railway PDFium adapter for native text, glyph boxes, images, and
   page rendering. Reconstruct tables in the first-party layout layer and gate
   them independently with G-TABLE. Keep PyMuPDF outputs as an evaluator oracle.
5. Implement page-level text-coverage classification and Tesseract C-API OCR.
   Re-run OCR only for deficient pages/regions and preserve every block's source.
6. Compare Tesseract fast/best, RapidOCR ONNX, and PaddleOCR ONNX/C++ across
   clean, noisy, rotated, multilingual, mixed, multi-column, and table segments.
7. Put the worker on private Railway networking with auth, checksummed models,
   and byte/page/archive/pixel/time/output limits.
8. Add the `document-extraction` queue with deterministic job IDs, bounded
   concurrency, retry classes, terminal failed-job records, and publication to
   the existing result queue. Binary reclassification is idempotent.
9. Shadow the Atomize document adapter, mapping old `docparse` telemetry to the
   new `document` event until dashboards and rollback no longer require the alias.

Exit gate: T-04a, T-04b, and T-06 pass; cold/warm policy is chosen from measured
volume; no engine promotion regresses a critical format segment.

### Milestone 7: Canonical cutover and cleanup

Goal: remove duplicate production engines only after evidence closes the risk.

Actions:

1. Promote Rust fast path to primary for eligible single requests.
2. Route all Atomize scheduled extraction through jobs.
3. Run a 14-day rollback window.
4. Remove JSDOM/Readability/Cheerio from Atomize production graph only after the
   rollback window; retain them in eval tooling if useful.
5. Remove Playwright from browser runtime only after IBR parity.
6. Remove the root/SDK TypeScript orchestrator duplication after every public
   entrypoint delegates to the versioned Rust core or client.
7. Archive obsolete plans and update operations documentation.

Exit gate: one canonical engine, no duplicated parser ownership, stable SLOs,
and tested rollback artifacts.

## Dependency Graph

```text
M0 baseline
  -> M1 contract/core
      -> M2 network/discovery
          -> M3 Vercel shadow
              -> M4 queue-only crons
      -> M5 Railway browser adapter
      -> M6 OmniParse Native integration
M3 + M4 + M5 + M6
  -> M7 canonical cutover
```

Parallelization:

- After M1 contract freeze, M2 network, M3 adapter scaffolding, M5 browser-image
  work, and M6 document-engine work have disjoint primary write sets.
- Production routing stays sequential behind acceptance gates.
- This revision used independent read-only subagents for disjoint repository
  audits; the primary agent reconciled their findings against live source and
  executed the market-research parser/OCR probes directly.

## Single-Shot Build Guardrails

| Guardrail | What it prevents | Evidence |
|---|---|---|
| No flag-day replacement | Silent accuracy regression | T-01 shadow gate and ADR-07 |
| No batch extraction in Vercel cron | 300-second timeout recurrence | T-02 and route inspection |
| One generated contract | TS/Rust field drift | T-03 and CI schema diff |
| One absolute deadline | Rejected caller while work continues | cancellation integration test |
| Every browser request validated | Chromium subresource SSRF | T-06 hostile page |
| Browser and OCR isolated | All workers inherit heavy images | image-size and service manifest audit |
| Idempotent persistence | At-least-once duplicate writes | T-07 duplicate delivery test |
| No external benchmark trust | Upstream F1 becomes false confidence | local corpus report required |
| No paywall bypass | Legal/ethical and reliability risk | terminal-class tests |
| No beta queue migration | Compounded infrastructure change | ADR-03 |

## Read-Before-Edit Map

| Work item | Read first | Why | Edit after |
|---|---|---|---|
| Contract | Atomize `extracted-content.ts`, writer, queue types, scraper output types, user OmniParse `router.ts` | Preserve current consumers, compatibility API, dates, hashes, and document structure | `crates/ingestion-contract`, generated TS package |
| Core | DOE report/harness, Atomize tiers/select helpers, `rs-trafilatura` source/tests | Reuse validated rules and establish baseline | `crates/scraper-core`, evals |
| Network | Both repos' fetchers, robots checker, SSRF guard, rate limiter | Preserve policy and fix cancellation/concurrency | `crates/scraper-net`, discovery |
| Vercel | Rust Runtime docs, current `vercel.json`, deployed function config | Avoid unsupported duration/service assumptions | `apps/scraper-fast-vercel` |
| Queue migration | RSS service, content queue, backfill cron, single writer | Preserve claim/idempotency semantics | Atomize producer/writer adapters |
| Browser | IBR browser/driver/network code, Atomize browser tier, Docker manifests | Preserve DOM stability and close request-policy gaps | heavy worker and Dockerfile |
| Documents | User OmniParse router/Excel/PPTX/tests; market-research PDF/OCR/DOCX/PPTX/XLSX/tests; Atomize docparse adapter | Port proven behavior, reject the raw PDF scanner, and preserve the existing client boundary | `omniparse-*` crates, compatibility package, native worker |
| OCR/layout | Mixed-PDF oracle, Spectra Vision port/geometry/live test, Tesseract/RapidOCR/PaddleOCR sources | Preserve evidence coordinates and compare recognizers by segment | `omniparse-ocr`, document eval corpus |

## Depends-on (reads-from)

- Atomize `ExtractedContent` semantics and single-writer invariants - verified.
- BullMQ/Redis producer and consumer configuration - verified in source; live
  Railway state unverified and resolved by Milestone 0.
- Source capability database columns - verified in Atomize source/schema.
- Vercel Rust Runtime beta behavior - verified from current official docs.
- Vercel 30-minute support for Rust - explicitly not assumed.
- Railway service names/resources - unverified live; blocking only for deploy,
  not for local core development, and resolved by Milestone 0.
- Atomize's current document-service production state - unverified live; it is a
  rollback/data point, not the target architecture, and is resolved by M0/M6.

## Activation Map

- Vercel source cron - trigger: existing Vercel Cron schedules - verified-live: yes.
- Content extraction producer - trigger: RSS insert and backfill claim call sites - verified-live: pending; verified in Milestone 4 integration.
- Railway heavy consumer - trigger: BullMQ `content-extraction` queue - verified-live: pending; verified in Milestone 5 staging.
- OmniParse Native consumer - trigger: BullMQ `document-extraction` queue - verified-live: pending; verified in Milestone 6 staging.
- Result writer - trigger: BullMQ `content-extraction-results` queue - verified-live: pending; verified in Milestone 5 staging.

## Environment Contract

Names only; values belong in platform secret stores.

Shared:

- `SCRAPER_CONTRACT_VERSION`
- `SCRAPER_ENGINE_VERSION`
- `SCRAPER_SERVICE_AUTH_KEY` or platform OIDC configuration
- `REDIS_URL`
- `DOCUMENT_EXTRACTION_QUEUE=document-extraction`
- `EXTRACTION_RESULT_QUEUE=content-extraction-results`
- `OTEL_EXPORTER_OTLP_ENDPOINT`

Atomize:

- `SCRAPER_FAST_URL`
- `SCRAPER_ENGINE=legacy|shadow|rust`
- `SCRAPER_SHADOW_SAMPLE_RATE`

Railway heavy worker:

- `IBR_CDP_URL` or local Chrome path configuration
- `OMNIPARSE_SERVICE_URL`
- `OMNIPARSE_API_KEY`
- `CONTENT_EXTRACTION_CONCURRENCY`
- `BROWSER_CONTEXT_CONCURRENCY`

Railway OmniParse Native worker:

- `OMNIPARSE_JOB_CONCURRENCY`
- `OMNIPARSE_MAX_BYTES`
- `OMNIPARSE_MAX_PAGES`
- `OMNIPARSE_MAX_OCR_PIXELS`
- `OMNIPARSE_OCR_ENGINE_POLICY`
- `OMNIPARSE_TESSDATA_DIR`
- `OMNIPARSE_MODEL_MANIFEST`

All external calls require explicit timeout, maximum response bytes, retry
classification, and rate-limit handling. No endpoint accepts an unlimited body.

## Cost Envelope

Current public list prices, not a forecast:

- Vercel: from $0.128 active CPU-hour, $0.0106/GB-hour memory, and
  $0.0000006/invocation after applicable included usage.
- Railway: $10/GB-month RAM, $20/vCPU-month CPU, $0.05/GB egress, with a $5
  Hobby minimum that counts toward resource usage.

Planning scenario at 100,000 pages/month and a 90/8/2 static/browser/document
mix:

- At 90,000 Vercel fast-path pages, 150 ms active CPU and two seconds at 2 GB
  produce about 3.75 CPU-hours, 100 GB-hours of memory, and 90,000 invocations.
  That is inside current Hobby allowances but leaves only 15 CPU-minutes of
  margin; shadow traffic, retries, and other project functions make Hobby an
  unsafe production budget assumption. At current `iad1`/`pdx1` rates, the same
  raw Pro usage is roughly $1.60 before plan credits and transfer.
- One warm 2 GB browser worker at 0.25 average vCPU is roughly $25/month before
  egress.
- The live PyMuPDF/Tesseract mixed-PDF probe completed in 13.3 seconds with
  roughly 266 MB maximum RSS in a fresh Python process and recovered all three
  sentinels. This is a one-fixture baseline, not a capacity forecast. Target a
  <=1 GB native worker envelope before concurrency is raised. At current list
  rates, one warm 1 GB worker averaging 0.1 vCPU is roughly $12/month before
  egress; actual PDFium/model/concurrency measurements choose the deployed size.
- Additional browser replicas scale approximately with warm memory plus actual
  CPU. Do not add replicas until queue age or utilization crosses its SLO.

## Research Context

Depth: standard/balanced. Current platform claims are blocked unless cited.

Packet:
`.build-loop/research/2026-07-12-plan-optimal-rust-hybrid-scraper-architecture-across-vercel.md`

Primary official sources:

- https://vercel.com/docs/functions/runtimes/rust
- https://vercel.com/docs/functions/runtimes/edge
- https://vercel.com/docs/functions/usage-and-pricing
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/queues
- https://vercel.com/docs/services
- https://vercel.com/docs/caching/runtime-cache
- https://docs.railway.com/deployments/serverless
- https://docs.railway.com/functions
- https://docs.railway.com/config-as-code/reference
- https://docs.railway.com/pricing/plans

Open-source source reviews:

- https://github.com/Murrough-Foley/rs-trafilatura
- https://github.com/gorango/napi-rs-trafilatura
- https://github.com/ajrcarey/pdfium-render
- https://github.com/tesseract-ocr/tesseract
- https://github.com/RapidAI/RapidOCR
- https://github.com/PaddlePaddle/PaddleOCR

## Plan Acceptance Readback

- Checklist: clean, 22/22 items answered with zero structural warnings.
- Deterministic verifier: zero blockers; four activation warnings remain for
  components that do not exist or cannot be checked live yet.
- Independent architect review: incorporated. It identified invalid SDK timing,
  non-enforcing/inconsistent F1 gates, weak candidate/metadata handling, root/SDK
  drift, and stale extraction flags; Milestone 0 and the corpus now cover them.
- Document parser review: corrected and incorporated. The earlier packet audited
  the unrelated public Python OmniParse project. Live inspection of the user's
  `@tyroneross/omniparse` found reusable XLSX/PPTX behavior and passing tests,
  plus missing DOCX/OCR and a PDF scanner that must be replaced. Market-research
  and Spectra provide the stronger PDF/OCR behavior and geometry oracles.
- Scope auditor: pending at the Plan-to-Execute boundary because public contracts
  do not exist yet. Milestone 1 must enumerate all Atomize/package callers before
  freezing `ExtractedContentV1` or queue message signatures.

Gaps readback: no architecture blocker remains. Railway service inventory,
PDFium packaging, comparative document/OCR quality, producer/consumer activation,
and result-writer activation are deliberately unverified and mapped to
Milestones 0, 4, 5, and 6.

## Deployment Assumptions

No blocking design question remains for local Milestones 0-2.

Production-only facts to resolve before deployment:

- [ASSUMED: current BullMQ/Redis remains available across Vercel and Railway.]
- [ASSUMED: the Railway `scraper-worker` can be replaced or renamed without an
  external consumer depending on the service name.]
- [ASSUMED: current Vercel account permits a separate Rust preview project.]
- [ASSUMED: Railway can run a private native worker with PDFium, Tesseract, and
  optional ONNX assets within a measured 1-2 GB initial envelope.]

Each assumption has an explicit Milestone 0 readback and does not change the
P0 local-core tests.
