# Research Packet: Rust Hybrid Scraper Architecture

Date: 2026-07-12
Mode: Build Loop research, balanced depth
Status: current external claims verified from official vendor documentation

## Decision Summary

Build one canonical Rust extraction core in `blog-content-scraper`. Run its
stateless HTTP/discovery adapter on Vercel and its native Node binding inside a
Railway browser worker. Keep Atomize responsible for scheduling, queueing, and
persistence. Keep Docling/Python as a separate Railway document/OCR service.

Do not make the migration depend on Vercel Services, Vercel Queues, Vercel
Workflows, or Railway Functions while those products are beta or structurally
inferior to the existing Redis/BullMQ path.

## Current-State Evidence

- [VERIFIED: local code] `atomize-ai` has a canonical extraction chain:
  JSON-LD -> Readability -> Cheerio -> Railway browser -> Railway Docling -> LLM.
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

## Railway Findings

1. Compute shape
   - [VERIFIED: official docs] Railway Services are long-running containers;
     serverless mode sleeps a service after more than ten minutes without
     outbound traffic and adds cold-boot latency.
   - [DECISION] Keep one warm browser worker when browser p95 matters. Allow
     Docling to sleep only if measured document volume makes cold model loading
     acceptable.
   - Source: https://docs.railway.com/deployments/serverless

2. Functions
   - [VERIFIED: official docs] Railway Functions are single-file TypeScript/Bun
     services with a 96 KB source limit.
   - [DECISION] They are unsuitable for Chromium, Rust extraction, or Docling.
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

### Current Atomize Docling service

- [VERIFIED: source inspection] The service pins `docling[rapidocr]==2.102.1`,
  preloads a text-layer converter and a RapidOCR/ONNX converter, authenticates
  production calls, revalidates redirects, and caps downloaded bytes.
- [DEFECT] `ocr=auto` selects OCR for image inputs only. It does not inspect a
  PDF text-layer result and retry OCR when a scanned or mixed PDF yields too
  little text.
- [DECISION] Keep Docling, add a page/text-density fallback, and preserve
  per-page OCR/layout evidence in the canonical result.

### IBM models versus OCR

- [VERIFIED: official Docling docs] Docling's IBM model package supplies layout
  detection and TableFormer table structure. Text recognition is a selectable
  backend such as RapidOCR, Tesseract, or EasyOCR.
- [DECISION] Use RapidOCR/ONNX as the lightweight CPU baseline because it is
  already implemented locally. Promote a different backend only on held-out
  accuracy, language, latency, and memory evidence.
- Sources:
  - https://docling-project.github.io/docling/usage/model_catalog/
  - https://docling-project.github.io/docling/getting_started/installation/

### OmniParse

- [VERIFIED: source inspection at `9d1ae83`] The latest repository commit is
  dated 2024-11-04. The service depends on Torch, Surya OCR, Marker, Whisper,
  Selenium, Flash Attention, Gradio, and LibreOffice-oriented flows.
- [VERIFIED: source inspection] Routes read whole uploads without an explicit
  size ceiling, expose wildcard CORS without service auth, and are registered
  once at import and again from `main()`.
- [RISK] Repository `LICENSE` is GPL-3.0 while `pyproject.toml` says Apache;
  README also identifies Marker/model commercial restrictions and an 8-10 GB
  GPU expectation.
- [DECISION] Do not use OmniParse in P0. It can be evaluated only after license
  review and service hardening, and only if it beats Docling on the same corpus.
- Source: https://github.com/adithya-s-k/omniparse

## Cost Model Assumptions

Planning scenario, not a bill forecast:

- 100,000 pages/month.
- 90% complete on the Rust HTTP path.
- 8% require browser rendering.
- 2% are PDF/image/document jobs.
- Fast path: 150 ms active CPU, 2 seconds provisioned memory per page.
- Browser worker: 2 GB warm RAM and 0.25 average vCPU.
- Docling: 2-4 GB when warm; workload-dependent CPU.

At those assumptions, 90,000 Vercel fast-path pages consume about 3.75 active
CPU-hours, 100 GB-hours of provisioned memory, and 90,000 invocations. That is
inside current Hobby allowances but leaves only 15 active CPU-minutes of margin;
shadow traffic, retries, and Atomize's other Functions make Hobby an unsafe
production budget assumption. At current `iad1`/`pdx1` rates, those raw Pro
resources are roughly $1.60 before plan credits and transfer. A warm Railway
browser worker is roughly $25/month before egress; a warm Docling service adds
roughly $20-$50/month depending on memory and CPU. Sleeping Docling lowers idle
cost but increases first-document latency and the first request can return 502.
Actual sizing requires live Railway metrics.

## Falsifiers

Revisit the architecture if any of these becomes true:

1. Rust non-inferiority fails on any critical corpus after tuning.
2. More than 30% of successful pages require browser or OCR escalation.
3. Cross-service p95 adds more than 250 ms compared with in-process parsing.
4. Vercel Rust beta produces a material error/cold-start regression.
5. BullMQ queue loss, latency, or operational cost exceeds an equivalent
   Vercel Queue poll-mode trial after Vercel Queues reaches GA.

## Confidence

- Context coverage: high for the scraper, Atomize extraction/cron/worker, IBR
  browser engine, local Docling service, and inspected open-source candidates.
- Verification coverage: high for local source and Vercel; medium for Railway
  because the CLI session is unauthenticated and live topology is unavailable.
- Evidence quality: high for platform contracts and Docling capabilities from
  official docs; medium for Rust/OmniParse quality because upstream claims were
  not accepted without a local corpus run.
- Overall: medium until Milestone 0 restores Railway read access and produces a
  valid current baseline.

## Next Action

Execute Milestone 0 only: reconcile Atomize, verify Railway/Docling live state,
repair measurement gates, and lock the corpus before writing production Rust.
