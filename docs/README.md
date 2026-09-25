# Документация Ortaq

Исходная спецификация продукта лежит в [`spec/`](spec/). Это источник истины: при расхождении кода и спецификации сначала правится спецификация, затем код.

| Файл | Что внутри | Когда открывать |
|---|---|---|
| [00-overview](spec/00-overview.md) | Проблема, роли, глоссарий, границы MVP, трассируемость требований | Вопрос «входит ли это в MVP» |
| [01-architecture](spec/01-architecture.md) | Монорепо, модули API, очереди, Yandex Cloud `kz1`, CI/CD, адаптеры | Структура кода, новый модуль |
| [02-data-model](spec/02-data-model.md) | Все таблицы, поля, enum'ы, индексы | Prisma-схема, миграции |
| [03-api-contract](spec/03-api-contract.md) | Эндпоинты с ролью, скоупом, step-up, лимитом, аудитом | Новый контроллер |
| [04-flows-admin-onboarding](spec/04-flows-admin-onboarding.md) | Админка, дома, помещения, приглашения, верификация (Digital ID + ГБД РН), бухгалтер | Фаза 0–1 |
| [05-flows-resident](spec/05-flows-resident.md) | Экраны и сценарии жильца | UI жильца |
| [06-flows-chairman](spec/06-flows-chairman.md) | Председатель и бухгалтер, веб и мобильное | UI председателя |
| [07-flows-worker](spec/07-flows-worker.md) | Работник, офлайн-режим | UI работника |
| [08-flows-system](spec/08-flows-system.md) | Cron, фоновые задачи, отказы интеграций | `apps/worker` |
| [09-voting-legal](spec/09-voting-legal.md) | Кворум, пороги, подписание через Smart Bridge, снимок реестра, протокол, тайна голосования | Фаза 4 |
| [10-finance-payments](spec/10-finance-payments.md) | План счетов (Приказ №362), транзакции, начисления, отчёт | Фаза 3 |
| [11-ai-layer](spec/11-ai-layer.md) | Обезличивание, функции ИИ, лимиты | Фаза 5, триаж в фазе 2 |
| [12-design-system](spec/12-design-system.md) | Цвета, типографика, компоненты, навигация | `packages/design-tokens`, UI |
| [13-security](spec/13-security.md) | Модель угроз, изоляция домов, сессии, аудит | Любой эндпоинт |
| [14-compliance-privacy](spec/14-compliance-privacy.md) | ПДн, шифрование ИИН, матрица видимости, сроки хранения | Любые ПДн |
| [15-roadmap](spec/15-roadmap.md) | Фазы 0–5, безопасность по фазам, риски | Планирование |

Дополнительно:

- [ANALYSIS.md](ANALYSIS.md) — пробелы и противоречия спецификации, решения, которые нужно принять до соответствующей фазы.
