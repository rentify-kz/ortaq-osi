# apps/worker

Фоновые задачи на BullMQ (docs/spec/01-architecture.md §5, docs/spec/08-flows-system.md).
Каркас появится вместе с первой очередью: письма через outbox (фаза 1), повторяющиеся задачи (фаза 2).
