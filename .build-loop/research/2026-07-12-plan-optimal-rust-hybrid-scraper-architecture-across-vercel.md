# Research Packet: Rust Hybrid Scraper Architecture

Date: 2026-07-12
Mode: Build Loop research, balanced depth
Status: current external claims verified from official vendor documentation

## Decision Summary

Build one canonical first-party Rust ingestion platform in
`blog-content-scraper`. Run bounded web/text/Office work on Vercel and native
browser/PDF/OCR escalation on Railway. Keep Atomize responsible for scheduling,
queueing, candidate selection, persistence, and downstream work. Preserve the
user-owned `@tyroneross/omniparse` API while replacing its PDF scanner with
OmniParse Native; do not use Docling or a paid parser in the target architecture.
Route document work through a dedicated BullMQ queue into the native worker and
reuse Atomize's existing result queue/writer, so browser and OCR capacity fail
and scale independently.

Do not make the migration depend on Vercel Services, Vercel Queues, Vercel
Workflows, or Railway Functions while those products are beta or structurally
inferior to the existing Redis/BullMQ path.

## Current-State Evidence

- [VERIFIED: local code] `atomize-ai` has a canonical extraction chain:
  JSON-LD -> Readability -> Cheerio -> Railway browser -> Railway document tier
  -> LLM. The document client boundary is reusable even though its current
  Docling implementation is not the target.
- [VERIFIED: local code] Vercel content backfill still performs extraction and
  persistence synchronously for batches of up to 50 with a 270-second budget.
- [VERIFIED: live Vercel] Production has recorded repeated 60- and 300-second
  timeouts on `/api/cron/content-backfill` and `/api/cron/refresh-rss`.
- [VERIFIED: live Vercel] The production deployment is currently Node-only and
  is deployed from `origin/main`; local Atomize `main` is 23 commits ahead.
- [VERIFIED: local code] Atomize's Railway image installs Chromium for the
  shared worker image and dispatches worker roles from `RAILWAY_SERVICE_NAME`.
- [VERIFIED: local code] Atomize already has a BullMQ `content-extraction`
  producer/consumer path and a single persistence writer.
- [VERIFIED: local code] Source capability outcomes are persisted, but the
  canonical extractor does not currently read them to route subsequent work.
- [VERIFIED: live and local probe] The public demo API always enters source
  orchestration. A valid Vercel article input returned a different changelog
  URL and impossible extraction counters (`attempted: 1`, `successful: 1331`).
  A separate article-shaped 404 also fell through to sitemap discovery and
  returned a different post. This is shared algorithm/API behavior, not merely
  deployment drift.
- [VERIFIED: local control] Calling `extractArticle` or `smartScrape` directly
  on the same valid article returns the requested 881-word document with 0.9
  confidence. The immediate containment is correct route/mode wiring; Rust is
  not required to stop the wrong-document failure.
- [UNVERIFIED: live Railway] Railway CLI 4.9.0 is installed but unauthenticated;
  the current Railway service inventory, utilization, and deploy state could
  not be refreshed.
- [VERIFIED: local code and tests] User OmniParse has reusable XLSX/PPTX
  normalization, rich spreadsheet semantics, deterministic chunks, and a
  compatibility API. `npm test` passed 51/51 assertions and typecheck passed.
  It has no DOCX/OCR and its PDF path is a raw `BT/ET`/`Tj`/`TJ` stream scan.
- [VERIFIED: local code and tests] Market-research-platform has in-process
  PyMuPDF, DOCX, PPTX-image, rich XLSX, image, and Tesseract parsers. The targeted
  parser suite passed 19/19 live.
- [VERIFIED: live local probe] Its PyMuPDF/Tesseract full-page OCR path recovered
  all three digital/OCR sentinel strings from the mixed-PDF fixture in 13.3
  seconds with about 266 MB maximum RSS in a fresh Python process. The ordinary
  PDF parser correctly marked the fixture `likely_scanned`, but does not call
  its own OCR function.

## Vercel Findings

1. Rust Runtime
   - [VERIFIED: official docs] Native Rust Functions are beta on all plans.
   - They support Fluid Compute, Active CPU pricing, streaming, `waitUntil`,
     logs, and request metrics.
   - Source: https://vercel.com/docs/functions/runtimes/rust

2. Edge Runtime
   - [VERIFIED: official docs] Edge exposes a limited Web/Node API surface,
     small compressed bundles, and a 25-second initial-response requirement.
     Vercel currently recommends Node over Edge for improved performance and
     reliability.
   - [DECISION] Do not parse articles, PDFs, images, or rendered pages at Edge.
     Rust extraction runs as a Fluid Function. Existing Edge/Routing Middleware
     may perform only cheap routing, auth, flags, or cached-status decisions.
   - Source: https://vercel.com/docs/functions/runtimes/edge

3. Fluid Compute
   - [VERIFIED: official docs] Standard instances are 1 vCPU/2 GB; Performance
     instances are 2 vCPU/4 GB.
   - [VERIFIED: official changelog] Node and Python can opt into 1,800-second
     durations on Pro/Enterprise; support for additional runtimes is still
     pending. The Rust fast path therefore must not depend on 30-minute support.
   - Sources:
     - https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes
     - https://vercel.com/docs/functions/usage-and-pricing

4. Pricing
   - [VERIFIED: official docs] Washington, D.C. and Portland pricing starts at
     $0.128/active CPU-hour and $0.0106/GB-hour of provisioned memory.
   - Function invocations are $0.0000006 each after applicable included usage.
   - Source: https://vercel.com/docs/functions/usage-and-pricing

5. Services and Bindings
   - [VERIFIED: official docs/changelog] Vercel Services is currently Private
     Beta with access by request; private service bindings are beta. Bindings
     route internally and inject service URLs.
   - [DECISION] Do not switch the existing Atomize project framework during the
     first migration. Start the Rust API as a separate project from the same
     repository; consider a binding after the feature and Rust service support
     are verified on a preview deployment.
   - Sources:
     - https://vercel.com/docs/services
     - https://vercel.com/changelog/secure-internal-communication-between-services

6. Queues and Workflows
   - [VERIFIED: official docs] Vercel Queues is beta, supports push and external
     poll consumers, at-least-once delivery, idempotency keys, and concurrency
     limits. Retention is configurable from 60 seconds to seven days (24 hours
     by default), and there is no built-in DLQ.
   - [DECISION] Keep BullMQ/Redis. Replacing a working cross-cloud queue during
     an engine migration adds risk and creates two queue systems for Atomize's
     existing workers. The rejection is based on migration and operational
     continuity, not the now-expanded retention limit.
   - [DECISION] Do not add Workflow. Extraction is a message-driven job, not a
     business process that benefits from durable step syntax.
   - Sources:
     - https://vercel.com/docs/queues
     - https://vercel.com/docs/queues/concepts
     - https://vercel.com/workflows

7. Runtime Cache
   - [VERIFIED: official docs] Runtime Cache is regional and ephemeral.
   - [DECISION] It can be an optional Vercel L1, but Redis must remain the shared
     cross-cloud result/capability cache and never delegate correctness to L1.
   - Source: https://vercel.com/docs/caching/runtime-cache

8. Function payload limit
   - [VERIFIED: official docs, updated 2026-07-01] Function request and response
     payloads are limited to 4.5 MB.
   - [DECISION] `/v1/parse` prefers approved storage references. Inline raw bytes
     are capped at 3 MiB to leave base64/JSON/header margin; projected large
     results become asynchronous jobs and return by reference.
   - Source: https://vercel.com/docs/functions/limitations#request-body-size

## Railway Findings

1. Compute shape
   - [VERIFIED: official docs] Railway Services are long-running containers;
     serverless mode sleeps a service after more than ten minutes without
     outbound traffic and adds cold-boot latency.
   - [DECISION] Keep both BullMQ consumers warm. Their persistent Redis traffic
     prevents Railway's no-outbound-traffic sleep condition from being a valid
     scale-to-zero assumption. Sleeping workers would require a separate
     always-on queue-to-push gateway and are outside P0.
   - Source: https://docs.railway.com/deployments/serverless

2. Functions
   - [VERIFIED: official docs] Railway Functions are single-file TypeScript/Bun
     services with a 96 KB source limit.
   - [DECISION] They are unsuitable for Chromium, Rust extraction, PDFium, or OCR
     models.
   - Source: https://docs.railway.com/functions

3. Rust and containers
   - [VERIFIED: official docs] Railpack supports Rust, and Railway also supports
     explicit Dockerfiles, health checks, restart policies, deploy draining, and
     multi-region replicas through config as code.
   - [DECISION] Use an explicit multi-stage Dockerfile for the browser worker so
     Chrome and the Linux N-API artifact exist only in that image.
   - Sources:
     - https://docs.railway.com/builds/railpack
     - https://docs.railway.com/config-as-code/reference

4. Pricing
   - [VERIFIED: official docs] Railway lists $10/GB-month RAM,
     $20/vCPU-month CPU, and $0.05/GB egress; Hobby has a $5 monthly minimum
     that counts toward usage.
   - Source: https://docs.railway.com/pricing/plans

## Rust Component Review

### `rs-trafilatura` 0.2.2

- [VERIFIED: source inspection] The repository is roughly 46,000 lines across
  source and tests, forbids unsafe code, and includes metadata, page-type,
  quality, Markdown, malformed-HTML, and real-world fixture tests.
- [VERIFIED: local run] `cargo test --all-features --quiet` passed locally.
- [RISK] It is a young, single-maintainer project. Its F1 claims were not
  independently reproduced in this run and cannot be treated as acceptance
  evidence.
- [DECISION] Treat it as candidate implementation code pinned to an exact
  revision. Promotion requires the repo's own DOE corpus and holdouts.
- Source: https://github.com/Murrough-Foley/rs-trafilatura

### `napi-rs-trafilatura` 0.2.0

- [VERIFIED: source inspection] The binding is a thin N-API wrapper over
  `rs-trafilatura` and publishes platform-specific optional packages.
- [VERIFIED: local run] The repository test initially failed because no native
  artifact was installed; building locally made all 27 Node tests pass.
- [DECISION] Do not depend on this package directly. Build a first-party N-API
  adapter in the scraper workspace so Linux artifacts, schema mapping, and
  release provenance remain under project control.
- Source: https://github.com/gorango/napi-rs-trafilatura

### Feed and robots components

- [VERIFIED: current crate docs] `feed-rs` 2.4 provides one model for Atom,
  RSS variants, and JSON Feed and uses streaming `quick-xml` internally.
- [VERIFIED: current crate docs] `robotxt` exposes allow/disallow, sitemap, and
  crawl-delay data; `robotstxt` is a native Rust port of Google's matcher with
  the original test behavior.
- [DECISION] Put either robots implementation behind a first-party policy
  adapter and select through RFC 9309, Common Crawl, and fuzz fixtures. Robots
  behavior is policy-critical and should not leak a crate API into the core.
- Sources:
  - https://docs.rs/feed-rs/latest/feed_rs/
  - https://docs.rs/robotxt/latest/robotxt/
  - https://docs.rs/robotstxt/latest/robotstxt/

## Document and OCR Component Review

### Correction: which OmniParse

The previous packet inspected `adithya-s-k/omniparse`. The user meant the local
`/Users/tyroneross/dev/git-folder/Omniparse` package published as
`@tyroneross/omniparse`. The third-party license, GPU, and Python dependency
findings are a naming-collision artifact and must not drive this architecture.

### User OmniParse

- [VERIFIED: Navigator and live source] Private TypeScript npm monorepo with SDK
  and web workspaces; its router exposes one generic file/directory API.
- [VERIFIED: live tests] 51/51 assertions and TypeScript typecheck passed.
- [REUSE] XLSX/XLS/XLSB/ODS/CSV/TSV normalization, rich spreadsheet structures,
  PPTX slide/notes/chart text, Markdown, chunks, and compatibility API.
- [COMPATIBILITY SURFACE] Unified `parse`/`parseMultiple`/directory routing,
  direct file/buffer parsers, Python source parsing, rich extraction, public
  result types, CJS/ESM plus `./parsers` exports, and the CLI all need explicit
  owners. Native PDF/OCR work does not justify shrinking the 1.x package.
- [GAP] No DOCX parser, no OCR/image interpretation, no typed page/block/bounding-
  box contract, and no PDF/OCR quality corpus.
- [REJECT] PDF currently scans raw streams for `BT/ET`, `Tj`, and `TJ` with
  optional zlib inflation. It lacks CMaps, geometry, images, encryption, layout,
  and OCR. The custom rich-XLSX ZIP reader also needs bounded, standards-aware
  replacement before hostile uploads.

### Market-research-platform parser

- [VERIFIED: Navigator, live source, live tests] Canonical in-process parsers use
  PyMuPDF, `python-docx`, `python-pptx`, `openpyxl`, Pillow, and Tesseract. The
  targeted parser suite passed 19/19.
- [REUSE AS ORACLE] Per-page PDF dimensions/text/tables, scan-density detection,
  DOCX sections/tables, PPTX notes/images, and rich XLSX semantics. The rich XLSX
  implementation is itself a hardened port from user OmniParse.
- [VERIFIED: live OCR probe] On the existing mixed PDF, the normal path returned
  four words and set `likely_scanned`; the explicit 300-DPI Tesseract path
  returned nine words and all `PDFTEXTALPHA593`, `ORIONCHART731`, and `MARGIN427`
  sentinels. Fresh-process runtime was 13.3 seconds and maximum RSS about 266 MB.
- [GAP] The PDF router only flags low text; it never calls `ocr_pdf_pages`.
  `image_to_data()` output is discarded, image tests mock recognition, and the
  result contract does not preserve block geometry/provenance.
- [DECISION] Port behavior and fixtures into Rust; do not carry the Python
  runtime into the production target.

### PDF engine

- [VERIFIED: official source] `pdfium-render` wraps the PDFium engine used by
  Chromium and supports page rendering plus text/image extraction.
- [DECISION] Put PDFium behind a first-party `PdfEngine` trait in the Railway
  worker first. Pin wrapper revision, PDFium binary/checksum, license inventory,
  and target architecture. Do not assume it fits or outperforms on Vercel until
  the local corpus and preview packaging gates pass.
- [DECISION] Keep PyMuPDF as the behavior oracle during migration. A pure-Rust
  PDF library may be a lightweight classifier/probe, but cannot become the
  accuracy path based on package claims.
- Source: https://github.com/ajrcarey/pdfium-render

### OCR engines

- [VERIFIED: official source and local oracle] Tesseract is Apache-2.0, exposes
  `libtesseract` plus a CLI, and its local binary already passes the mixed-PDF
  oracle. Use the C API in production and retain the CLI path as a differential
  test oracle.
- [VERIFIED: official source] RapidOCR packages Paddle-derived models across
  ONNX/OpenVINO/C++ and other runtimes under Apache-2.0 project licensing, while
  noting that model copyright belongs to Baidu. It is a lightweight challenger,
  not a license-free assumption.
- [VERIFIED: official source] PaddleOCR supports C++ and ONNX-oriented local
  deployment, document structure, and broad language coverage under Apache-2.0.
  Its framework is too broad for the fast image, but selected exported models may
  compete behind the same native recognizer interface.
- [DECISION] Compare Tesseract fast/best, RapidOCR ONNX, and PaddleOCR ONNX/C++
  by corpus segment. Accuracy floors are hard; among passers choose the faster/
  lighter engine. Do not install Python OCR frameworks in production.
- Sources:
  - https://github.com/tesseract-ocr/tesseract
  - https://github.com/RapidAI/RapidOCR
  - https://github.com/PaddlePaddle/PaddleOCR
  - https://github.com/PaddlePaddle/PaddleOCR/tree/main/deploy

### IBM OCR and layout models

IBM's useful open components are layout/table models rather than a reason to
retain Docling. They may enter the layout/table DOE only as exported, license-
reviewed model challengers behind `LayoutEngine`; no IBM/Docling framework is in
P0 and no model is selected without local table/block evidence.

### Apple Vision and layout algorithms

- [VERIFIED: live historical test] Spectra's Apple Vision adapter found four real
  text nodes and landed the OCR-derived Retina click with zero-pixel delta.
- [REUSE] Its `{label,bounds,confidence}` port, coordinate transforms, and
  geometry clustering. Its simple top-to-bottom sort and keyword-derived UI roles
  are insufficient for document reading order.
- [PLACEMENT] Apple Vision is a macOS/local OmniParse adapter and comparator, not
  a Linux/Vercel/Railway dependency.
- `screen-extractor` has no OCR; reuse only its Rust parser-state-machine,
  Unicode-width, typed-snapshot, and differential-oracle testing patterns.

## Historical Build Loop Findings

- 2026-04-26: research already proposed a thin router: URLs to scraper-app,
  files to user OmniParse, and scanned PDFs to an OCR tier. It correctly found
  the OmniParse PDF path text-layer-only but contained no completed OCR bakeoff.
- 2026-06-08: the scraper `0.5.2` release deliberately left a broad
  "Omniparse-era" branch unmerged because it exceeded release scope; that is why
  substantial parser work did not become the published scraper package.
- 2026-06-11: the content-platform experiment, later reflected in
  market-research-platform, chose in-process deterministic parsers over the
  OmniParse HTTP `/parse` sidecar and retained the sidecar only for `/scrape`.
- 2026-06-13: Atomize's 57-source probe found zero sources that were truly
  JavaScript-only; static fetch plus structured data/Readability/quality selection
  handled the corpus. PDF recall, not browser rendering, remained the larger
  content gap.
- 2026-06-14: extraction consolidation established two non-negotiable controls:
  one SSRF policy across every redirect/fetch and terminal failure markers that
  stop infinite retries.
- 2026-06-15/16: Docling remained researched and deployment-blocked. It never
  became a proven quality baseline.
- 2026-07-01: Spectra's production Apple Vision path passed a live macOS OCR and
  exact-coordinate grounding test.
- 2026-07-03: research called for data-shape routing, page/section/bounding-box
  provenance, native-versus-OCR source labels, and machine-readable confidence.
- 2026-07-05: PyMuPDF plus the local Tesseract binary passed the mixed DOCX/PDF
  content oracle without `pytesseract`.

The chronology is internally consistent: keep the scraper and parser as separate
packages behind one ingestion contract, but build/deploy them from one monorepo
so contracts, native engines, evals, and release provenance cannot drift.

## Cost Model Assumptions

Planning scenario, not a bill forecast:

- 100,000 pages/month.
- 90% complete on the Rust HTTP path.
- 8% require browser rendering.
- 2% are PDF/image/document jobs.
- Fast path: 150 ms active CPU, 2 seconds provisioned memory per page.
- Browser worker: 2 GB warm RAM and 0.25 average vCPU.
- OmniParse Native initial target: <=1 GB warm RSS at concurrency 1; actual
  PDFium/Tesseract/ONNX memory and CPU are experiment outputs.

At those assumptions, 90,000 Vercel fast-path pages consume about 3.75 active
CPU-hours, 100 GB-hours of provisioned memory, and 90,000 invocations. That is
inside current Hobby allowances but leaves only 15 active CPU-minutes of margin;
shadow traffic, retries, and Atomize's other Functions make Hobby an unsafe
production budget assumption. At current `iad1`/`pdx1` rates, those raw Pro
resources are roughly $1.60 before plan credits and transfer. A warm Railway
browser worker is roughly $25/month before egress. At Railway list rates, a warm
1 GB OmniParse Native worker averaging 0.1 vCPU is roughly $12/month before
egress. The live Python/Tesseract one-fixture probe peaked near 266 MB, but that
does not include PDFium, concurrent requests, or optional ONNX models. Budget the
BullMQ consumer as always warm; serverless sleep is not included. Actual sizing
requires the document DOE and live Railway metrics.

## Falsifiers

Revisit the architecture if any of these becomes true:

1. Rust non-inferiority fails on any critical corpus after tuning.
2. More than 30% of successful pages require browser or OCR escalation.
3. Cross-service p95 adds more than 250 ms compared with in-process parsing.
4. Vercel Rust beta produces a material error/cold-start regression.
5. BullMQ queue loss, latency, or operational cost exceeds an equivalent
   Vercel Queue poll-mode trial after Vercel Queues reaches GA.
6. PDFium, Tesseract, and every native challenger fail a critical document
   segment that the current local oracles pass.
7. The native document worker cannot meet the 1-2 GB initial envelope without
   dropping required accuracy; in that case increase Railway sizing or isolate a
   measured heavy segment rather than moving OCR to Vercel.

## Confidence

- Context coverage: high for the scraper, Atomize extraction/cron/worker, IBR
  browser engine, user OmniParse, market-research parsers, Spectra Vision,
  screen-extractor, historical research, and inspected open-source candidates.
- Verification coverage: high for local source and Vercel; medium for Railway
  because the CLI session is unauthenticated and live topology is unavailable.
- Evidence quality: high for local parser contracts/tests and current official
  component/platform capabilities; medium for comparative PDF/OCR quality because
  only one real mixed-PDF oracle and one live macOS screen test exist today.
- Overall: medium until Milestone 0 restores Railway read access and produces a
  valid current baseline.

## Next Action

Execute Milestone 0 only: reconcile Atomize, verify Railway state, repair web
measurement gates, import the user OmniParse and market-research fixtures, and
lock the document/OCR corpus before writing production Rust engine code.
