# bb-code documentation

This directory makes the product vision, implementation contract, and QKV
boundary self-contained. Start here rather than inferring the product from the
folder structure.

## Reading order

1. [`PRODUCT_DECISIONS.md`](PRODUCT_DECISIONS.md) — the short list of accepted
   product and architecture decisions.
2. [`BB_CODE_MVP.md`](BB_CODE_MVP.md) — the complete product thesis, software
   engineering flow, integration analysis, Git model, launch strategy, and
   long-term ambition. This is preserved verbatim from the design repository.
3. [`BB_CODE_IMPLEMENTATION_PLAN.md`](BB_CODE_IMPLEMENTATION_PLAN.md) — the
   complete original MVP specification, including interfaces, tables,
   processes, and acceptance criteria. This is also preserved verbatim.
4. [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) — the concise contract for
   the current `0.1.0` codebase.
5. [`ARCHITECTURE.md`](ARCHITECTURE.md) and
   [`DATA_MODEL.md`](DATA_MODEL.md) — the implemented layering and persistence
   model.
6. [`QKV_COMPETITIVE_EDGE.md`](QKV_COMPETITIVE_EDGE.md) — why the optional QKV
   provider matters, what its public boundary is, and which details remain
   proprietary.
7. [`GLOSSARY.md`](GLOSSARY.md) — precise definitions for the product and
   database language.
8. [`TESTING.md`](TESTING.md) — automated release gates and the boundary between
   deterministic acceptance checks and live dogfood/QKV evidence.

## Document precedence

Use the documents for different questions rather than treating all prose as
equally authoritative:

| Question | Source of truth |
|---|---|
| What problem is bb-code solving? | `BB_CODE_MVP.md` |
| Which product and architecture choices are settled? | `PRODUCT_DECISIONS.md` |
| What is the complete MVP target? | `BB_CODE_IMPLEMENTATION_PLAN.md` |
| What does the current `0.1.0` repository implement? | Checked-in code, then `IMPLEMENTATION_PLAN.md` |
| How must new code fit the layers? | `ARCHITECTURE.md` |
| What is persisted and why? | `DATA_MODEL.md` |
| What may leave the machine? | `PRIVACY.md` |
| How should behavior be verified? | `TESTING.md` |
| What does QKV add without owning truth? | `QKV_COMPETITIVE_EDGE.md` |

When prose and current behavior differ, the checked-in code and tests describe
current behavior. Do not silently narrow the product thesis because a feature
has not been implemented yet.

## Public and proprietary boundary

The open-source repository contains everything required to understand and run
bb-code locally: domain rules, provenance, revisions, review, Git awareness,
host adapters, MCP tools, and lexical retrieval.

QKV is an optional proprietary retrieval provider. This repository documents
its product role, public provider/API contract, safety rules, and evaluation
expectations. It intentionally does not contain QKV checkpoints, training data,
losses, mining recipes, private experiment results, infrastructure internals,
or credentials.

## Terminology policy

Use direct concepts: intents, beliefs, commitments, evidence, candidates,
sessions, runs, and context effects. Do not reintroduce the discarded “Project
Mind”, “Compass”, or “Map” vocabulary.
