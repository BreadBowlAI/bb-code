# QKV competitive edge and integration boundary

Status: public product and provider contract  
Updated: 2026-08-05

QKV is bb-code's optional proprietary semantic retrieval provider. It improves
which statements become candidates for a request; it does not own project truth,
authority, scope, revisions, Git applicability, or the final context shown to
an agent.

This document deliberately explains the advantage well enough to guide bb-code
product and integration work without publishing QKV's private checkpoints,
training data, loss implementation, mining recipes, experiment results, or
service internals.

## Why retrieval is the commercial leverage

The local FTS5 provider can find direct lexical matches and keeps bb-code useful
offline. The harder cases use different words for the same engineering
constraint:

```text
Earlier commitment
  "Accounts remain optional. Local data is authoritative."

Later request
  "Add cross-device sync and resolve conflicts on the server."
```

A useful continuity system must recover the earlier decision even when the
request does not repeat its vocabulary. It must also distinguish a relevant
constraint from merely similar text. Better candidate recall creates the
opportunity for bb-code's transparent policy layer to prevent a mistake.

## Retrieval thesis

Conventional embedding models compress an entire query or document into one
vector. That is efficient, but one vector must carry every topic, entity,
relation, exception, and constraint in the text.

QKV uses a fixed number of learned slots and late interaction:

```text
query text     -> routing slots + value slots
statement text -> routing slots + value slots

routing interaction -> efficient candidate generation
value interaction   -> more precise reranking
```

The high-level advantages are:

- **More than one semantic facet.** Multiple slots can preserve distinct parts
  of a request or statement that a single pooled vector may blur together.
- **Routing and content are separated.** Routing vectors answer where a match
  may be; value vectors help decide what information the routed match carries.
- **Late-interaction quality with bounded representation size.** Learned slots
  retain more structure than one vector while avoiding an unbounded token
  vector index.
- **Precomputable documents.** Statement representations are encoded ahead of
  time, so QKV remains usable as retrieval infrastructure rather than requiring
  a cross-encoder over every stored statement.
- **Coarse-to-exact retrieval.** Approximate slot search produces candidates;
  exact QKV interaction reranks that bounded set.

The research hypothesis is concise:

> Single-vector embeddings lose useful detail; cross-encoders are too expensive
> for first-stage retrieval; fixed-slot late interaction can preserve more
> detail while keeping documents precomputable and indexable.

## Why QKV fits bb-code

An engineering request is usually multi-faceted: desired outcome, affected paths,
architectural constraints, failure symptoms, and verification expectations can
all appear together. Durable statements are also typed and scoped. QKV's
multi-vector representation is intended to improve recall when one facet of the
new request matches one consequential facet of an older statement.

QKV still cannot decide whether the retrieved statement should govern the request.
That decision requires bb-code's open policy layer:

1. QKV returns candidate statement and revision IDs with scores.
2. bb-code hydrates the authoritative revisions from local SQLite.
3. bb-code rejects stale, inactive, out-of-scope, or Git-inapplicable items.
4. bb-code combines lexical and semantic ranks.
5. bb-code renders a small cited context set.

This separation is strategic. QKV can improve rapidly without becoming an
opaque memory authority, while the open-source runtime remains inspectable and
useful without it.

## Provider contract

The core depends on a provider-shaped capability, not QKV transport types:

```ts
type SemanticCandidate = {
  statementId: string
  revisionId?: string
  score: number
}

interface SemanticRetrievalProvider {
  search(input: {
    query: string
    topK: number
    candidateK: number
    signal?: AbortSignal
  }): Promise<SemanticCandidate[]>
}
```

The QKV client maps this capability to a versioned HTTPS API with operations to
create an index, upsert or delete documents, and search. Clients must ignore
unknown response fields, treat scores as ordering values within one response,
and preserve request IDs for troubleshooting without logging request bodies.

## Indexed document contract

Only the current durable statement revision is eligible for remote indexing:

```text
document id
statement id
revision id
statement kind
statement body
minimal non-sensitive retrieval metadata
```

Index creation requests `text_retention: "none"`. Source text is processed to
derive retrieval data but is not stored as retrievable source content. The
remote service may retain identifiers, supplied metadata, derived retrieval
data, and aggregate usage records. SQLite remains authoritative and hydrates
every returned ID.

Never send:

- source code or diffs;
- user prompts or agent responses;
- tool inputs, outputs, or terminal transcripts;
- environment values, credentials, tokens, or secrets;
- raw evidence whose only purpose is local provenance;
- regulated or third-party data that is not approved for processing.

Filtering and QKV scores are not authorization boundaries. bb-code must apply
current local policy after hydration.

Search input is a bounded deterministic term/path projection of the active
request. The open runtime removes code blocks, obvious secret assignments,
authorization values, and high-entropy tokens before transport; it does not
send the locally stored raw prompt or use another LLM to rewrite it.

## Failure and fallback contract

QKV is optional and must remain outside latency-critical correctness:

- local FTS5 always remains available;
- semantic search uses a bounded timeout;
- network, authentication, parsing, or service errors degrade to lexical
  candidates rather than failing run start;
- queued indexing is idempotent and tied to a specific current revision;
- deleting or superseding a local revision eventually removes its remote search
  document;
- disabling QKV stops new remote work without damaging local knowledge.

The open-source runtime should make the fallback visible in diagnostics and
retrieval logs, but normal agent work should continue.

## Evaluation contract

The proprietary advantage should be demonstrated through product outcomes, not
asserted from model architecture alone.

Offline retrieval evaluation should compare local FTS5, conventional semantic
baselines, and QKV on representative request-to-statement judgments using recall,
MRR or nDCG, latency, and failure rate.

The decisive bb-code metrics are downstream:

- retrieved commitments that changed a plan;
- conflicts that caused useful clarification;
- violations avoided;
- verification changed because relevant context appeared;
- repeated explanations avoided across hosts;
- irrelevant context rate and user rejection rate.

`bb_finish_run` context effects provide a first measurement channel, but they
are agent reports rather than ground truth. Combine them with human review,
controlled fixtures, and inspectable retrieval logs.

## Open-core rule

QKV may be the better retrieval engine, but it must never be required to recover
or understand a project's durable state. A user who disables the service keeps
their statements, history, evidence, review workflow, Git model, adapters, MCP
tools, and local retrieval.

That boundary is both the trust model and the business model: open governance
of project knowledge, optional proprietary quality at retrieval scale.
