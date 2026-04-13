# Yape Code Challenge 🚀

Welcome. This challenge is designed for experienced engineers being considered for **tech lead and staff-level** roles. It tests your ability to reason about distributed systems, event-driven architecture, and platform design — not just your ability to ship working code.

There are three challenges. **Pick one.** Go deep rather than broad.

---

## Table of Contents

- [What we're evaluating](#what-were-evaluating)
- [Challenge 1 — Payment settlement pipeline](#challenge-1--payment-settlement-pipeline)
- [Challenge 2 — Wallet transfer with distributed saga](#challenge-2--wallet-transfer-with-distributed-saga)
- [Challenge 3 — Shared platform library design](#challenge-3--shared-platform-library-design)
- [Tech stack](#tech-stack)
- [Submission](#submission)

---

## What we're evaluating

We're not looking for a perfect system. We're looking for evidence that you think like a tech lead:

- You treat trade-offs as first-class decisions, not implementation details.
- You build for the engineer who reads your code six months from now, not for the PR reviewer today.
- You can identify the antipattern in a brief before someone points it out to you.
- You know what you deliberately left out — and why.

Every challenge includes an **optional escalation**. It's genuinely optional; finishing the core well beats rushing to the escalation.

---

## Challenge 1 — Payment settlement pipeline

### Premise

You're building the payment processing backbone for a multi-country wallet. A payment initiated in one country may touch ledger entries, fraud scoring, and notification services that are fully independent. Your solution must remain correct under partial failures and message redelivery.

### Architecture overview


```
Payment API ──► Outbox table ──[relay]──► Kafka topic
                                          (payment.created.v1)
                                               │
                          ┌────────────────────┼────────────────────┐
                          ▼                    ▼                    ▼
                   FraudConsumer        LedgerConsumer       NotifyConsumer
                   (risk scoring)    (double-entry write)   (push / email)
                          │                    │
                          └────────┬───────────┘
                                   ▼
                             Status saga
                          (eventual consistency)
                               │
                    ┌──────────┴──────────┐
                    ▼ (on failure)        ▼ (on success)
               DLT topic            payment.settled.v1
          (payment.failed.v1)
```

### Required deliverables

1. **Transactional outbox** — A `PaymentService` (NestJS) that writes a payment record and its outbox entry in a single local transaction. A separate relay process publishes to Kafka. The broker must never be called inside the database transaction.

2. **Idempotent consumers** — At least two downstream consumers (`FraudConsumer`, `LedgerConsumer`) in separate NestJS modules. Reprocessing the same event twice must produce no observable side effect.

3. **DLT handler** — When a consumer exceeds its retry budget, emit a compensating event to a Dead Letter Topic rather than silently dropping the message.

4. **Status query endpoint** — A GET endpoint that reflects eventual consistency honestly. A payment may return `pending` after creation and only transition to `settled` or `failed` once both consumers have acknowledged.

### What a strong solution looks like

- The outbox relay is a distinct process boundary — not a `setInterval` in the same NestJS app.
- Idempotency keys live on the consumer side (keyed by `eventId`), not on the producer side.
- The status endpoint documents its consistency guarantees explicitly — either in code comments or in an API response envelope.
- The candidate can explain what happens if the relay crashes between writing the outbox entry and publishing to Kafka.

### What disqualifies a solution

- Calling `kafkaClient.emit()` directly inside a `@Transaction()` decorator. This is the most common mistake at this level and it produces silent data loss.

### Optional escalation

Add a per-country topic namespace (`pe.payments.payment.created.v1`, `mx.payments.payment.created.v1`) and document what that implies for consumer group strategy across countries.

---

## Challenge 2 — Wallet transfer with distributed saga

### Premise

Transferring funds between two wallets in different countries requires debiting one ledger and crediting another atomically — without a distributed transaction. You will implement a saga that is safe to replay from any step.

### Required deliverables

1. **Transfer orchestrator** — Implement a `TransferOrchestrator` that drives the following steps in order:

   ```
   DebitWallet → CreditWallet → SettleFX → EmitReceipt
   ```

   You may use Temporal, a hand-rolled state machine, or pure Kafka choreography. You must justify the choice in writing.

2. **Compensation on failure** — If `CreditWallet` fails after `DebitWallet` succeeds, the orchestrator must issue a `ReverseDebit` compensation event. Silent failure is not acceptable.

3. **CQRS read model** — A `TransferReadModel` updated via projected events, not by reading the write-side database. The read model must be consistent enough to serve a GET within 500ms of the saga completing.

4. **Concurrency safety** — If two transfers attempt to debit the same wallet simultaneously, the second must detect the conflict and fail fast. A negative balance is never acceptable.

### What a strong solution looks like

- The candidate picks a clear position on choreography vs. orchestration and can articulate the trade-off: choreography reduces coupling but makes the overall saga state invisible; orchestration makes state explicit but introduces a coordinator as a single point of failure.
- The idempotency key is placed on the saga instance, not on individual commands, and the candidate can explain why.
- The read model answers the question: "how do I know the read model isn't serving stale data immediately after the saga closes?" — whether via versioned events, a subscription mechanism, or a documented staleness window.

### What disqualifies a solution

A single database transaction spanning two service databases. This is the antipattern the challenge is explicitly designed to surface.

### Optional escalation

Model the FX settlement step as an external API call with a timeout. Show how the saga handles a timeout that leaves the FX state ambiguous — neither confirmed nor rejected.

---

## Challenge 3 — Shared platform library design

### Premise

Your platform team owns the internal libraries that all product squads import. You've been asked to design and ship `@yape/kafka-module` — a NestJS dynamic module that wraps Kafka producer and consumer setup, enforces topic naming conventions, wires DLT automatically, and exposes typed event contracts. You are the only author. Four squads will consume it within the quarter.

### Required deliverables

1. **Dynamic module API** — A `KafkaModule.forFeature({ topics, consumerGroup })` dynamic module. The module must register producers and consumers via NestJS dependency injection, not global singletons.

2. **`@KafkaEvent()` decorator** — A `@KafkaEvent(topicName)` decorator that binds a handler method to a Kafka consumer, analogous to how NestJS `@MessagePattern` works internally.

3. **Automatic DLT wiring** — If a handler throws and exceeds `maxRetries`, the module routes the message to `{original-topic}.dlt` without any code change required in the consuming squad.

4. **`EventContract<T>` type** — A generic type that enforces schema shape at compile time. Squads must not be able to publish to a topic with a payload that doesn't match the declared contract. A type mismatch must be a TypeScript compile error, not a runtime exception.

5. **ADR (Architecture Decision Record)** — Written in MADR format, covering:
   - Why NestJS dynamic modules over a plain exported class.
   - How you handle schema evolution without breaking consumers who still reference an older version.
   - What you would add with two more weeks.

### What a strong solution looks like

- The module API feels native to NestJS. A squad importing it should not need to understand Kafka internals to publish an event.
- Schema evolution is addressed concretely: additive fields, topic versioning (`payment.created.v2`), or a schema registry — the candidate picks one and defends it, with trade-offs acknowledged.
- The ADR reads like it was written for a real team, not as a post-hoc justification. It documents the options that were rejected and why.

### What a weak solution looks like

- The module wraps Kafka imperatively and tells squads to call `producer.send()` directly.
- `EventContract<T>` is a runtime validation only (e.g. a Zod schema), with no compile-time enforcement.
- The ADR is a bulleted list with no trade-off reasoning.

### Optional escalation

Publish the module to a local [Verdaccio](https://verdaccio.org/) registry. Document your versioning and release strategy, including how you would communicate breaking changes to consuming squads.

---

## Tech stack

The following is the expected stack. Deviations are acceptable if you document the reason.

| Layer | Expected |
|---|---|
| Runtime | Node.js 20+ |
| Framework | NestJS |
| Messaging | Kafka (local via Docker, or Confluent Cloud) |
| Database | Your choice — document why |
| Orchestration | Temporal, native Kafka, or a state machine — justify the choice |
| Language | TypeScript (strict mode) |
| Containers | Docker Compose for local environment |

---

## Submission

1. Fork this repository.
2. Create a branch named `challenge/{your-name}`.
3. Open a pull request against `main` in this repository.

Your PR description must include:

- Which challenge you chose and why.
- The key architectural decisions you made and the alternatives you rejected.
- What you would do differently with more time.
- Any known limitations or shortcuts taken.

**There is no time limit stated intentionally.** A focused solution delivered in four hours tells us more than an exhaustive one delivered in two days. Prioritise depth of reasoning over breadth of features.

If you have questions, open an issue on this repository. We respond to issues within one business day.


