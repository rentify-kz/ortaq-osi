# 03. API-контракт

Базовый путь `/v1`. Формат — JSON. Аутентификация — `Authorization: Bearer <access_token>` для мобильного клиента, httpOnly cookie для веба.

## 1. Как читать таблицы

У каждого эндпоинта заполнены пять колонок безопасности. **Пустых ячеек быть не должно** — именно незаполненные требования превращаются в дыры.

| Колонка | Значения |
|---|---|
| **Роль** | Кто может вызвать. `—` = без аутентификации |
| **Скоуп** | Как ограничивается доступ: `house` (членство в доме), `self` (только свои данные), `global` |
| **Step-up** | Нужно ли повторное подтверждение личности. `да` для опасных действий |
| **Лимит** | Класс rate-limit: `auth` (жёсткий), `write`, `read`, `ai`, `upload` |
| **Аудит** | Пишется ли в `AuditLog` |

Классы rate-limit:

| Класс | Ограничение |
|---|---|
| `auth` | 5 запросов / 15 мин на IP+идентификатор, экспоненциальная задержка |
| `write` | 60 / мин на пользователя |
| `read` | 300 / мин на пользователя |
| `ai` | 20 / час на дом + лимит токенов |
| `upload` | 30 / час на пользователя |

**Правило скоупа `house`:** `house_id` берётся из пути и проверяется против активного `HouseMembership` вызывающего. Если членства нет — `404`, а не `403`: `403` подтвердил бы существование дома.

### Ограничения по клиенту

Права определяются ролью, а не устройством. **Единственное исключение — админ-панель (`/admin/*`), закрытая для мобильного клиента полностью.**

Председатель и бухгалтер вызывают свои эндпоинты и с веба, и из мобильного приложения. Часть действий при этом не выводится в мобильный интерфейс — формирование и подписание отчёта, создание голосования, реестр собственников, сравнение КП, экспорт. Это **продуктовое решение об уместности**, а не ограничение API: такие операции требуют работы с таблицами и многостраничными документами, где ошибка юридически или финансово дорога и не видна сразу.

API их не блокирует — иначе пришлось бы дублировать логику прав по типу клиента и поддерживать два расходящихся набора правил. Обоснование границы — [06-flows-chairman.md](06-flows-chairman.md#что-недоступно-на-мобильном-и-почему).

**Никогда не принимаем `house_id` из тела запроса для определения доступа.** Только из пути, и только после проверки членства.

## 2. Формат ошибок

```json
{
  "error": {
    "code": "VOTE_QUORUM_NOT_REACHED",
    "message": "Кворум не достигнут: 38.2% при необходимых 50%",
    "details": { "quorum_percent": 38.2, "required": 50 }
  }
}
```

| HTTP | Когда |
|---|---|
| `400` | Ошибка валидации |
| `401` | Нет или истёк токен |
| `403` | Роль не позволяет действие |
| `404` | Нет объекта **или нет доступа** |
| `409` | Конфликт состояния (голосование уже закрыто, чек уже загружен) |
| `422` | Бизнес-правило нарушено (кворум, срок уведомления, площади не заполнены) |
| `428` | Требуется step-up аутентификация |
| `429` | Превышен лимит |

Код `428 Precondition Required` используется для step-up: клиент получает его, показывает запрос подтверждения, повторяет запрос с заголовком `X-Step-Up-Token`.

---

## 3. Аутентификация

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| POST | `/auth/otp/request` | — | — | нет | `auth` | да |
| POST | `/auth/otp/verify` | — | — | нет | `auth` | да |
| POST | `/auth/password/login` | — | — | нет | `auth` | да |
| POST | `/auth/password/set` | — | — | нет | `auth` | да |
| POST | `/auth/2fa/setup` | все с почтой | `self` | да | `auth` | да |
| POST | `/auth/2fa/verify` | — | — | нет | `auth` | да |
| POST | `/auth/refresh` | — | — | нет | `auth` | да |
| POST | `/auth/logout` | любая | `self` | нет | `write` | да |
| POST | `/auth/step-up` | любая | `self` | нет | `auth` | да |
| GET | `/me` | любая | `self` | нет | `read` | нет |
| PATCH | `/me` | любая | `self` | нет | `write` | да |

`POST /auth/otp/request` отвечает `200` независимо от того, зарегистрирован номер или нет. Иначе через форму входа собирается база жильцов дома.

`POST /auth/step-up` принимает пароль, TOTP или биометрию (мобильное) и выдаёт краткоживущий `X-Step-Up-Token` на 5 минут.

---

## 4. Админ-панель

Все эндпоинты требуют `PLATFORM_ADMIN` и доступны **только из веба**. Мобильный клиент получает `403` независимо от роли.

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/admin/organizations` | admin | `global` | нет | `read` | нет |
| POST | `/admin/organizations` | admin | `global` | да | `write` | да |
| PATCH | `/admin/organizations/:id` | admin | `global` | да | `write` | да |
| GET | `/admin/houses` | admin | `global` | нет | `read` | нет |
| POST | `/admin/houses` | admin | `global` | да | `write` | да |
| PATCH | `/admin/houses/:id` | admin | `global` | да | `write` | да |
| POST | `/admin/houses/:id/generate-units` | admin | `global` | да | `write` | да |
| GET | `/admin/houses/:id/readiness` | admin | `global` | нет | `read` | нет |
| POST | `/admin/houses/:id/chairman` | admin | `global` | да | `write` | да |
| GET | `/admin/audit` | admin | `global` | нет | `read` | нет |

**`POST /admin/houses`**

```json
{
  "organization_id": "uuid",
  "address": "г. Алматы, ул. Абая 150",
  "display_name": "ЖК Асыл Арман, блок 3",
  "entrance_count": 4,
  "unit_count": 128,
  "floor_count": 9
}
```

Создание дома автоматически ставит в очередь генерацию помещений.

**`POST /admin/houses/:id/generate-units`** — перегенерация или ручная настройка:

```json
{
  "strategy": "SEQUENTIAL",
  "entrances": [
    { "entrance": 1, "from": 1, "to": 32, "floors": 9 },
    { "entrance": 2, "from": 33, "to": 64, "floors": 9 }
  ]
}
```

Отвечает `409`, если по дому уже есть голосования или начисления: перегенерация помещений после этого разрушила бы связи.

**`GET /admin/houses/:id/readiness`** — состояние подключения дома:

```json
{
  "units_generated": true,
  "areas_filled": 120,
  "areas_total": 128,
  "is_voting_ready": false,
  "registry_uploaded": true,
  "chairman_assigned": true,
  "chairman_activated": false,
  "residents_verified": 47,
  "blocking_issues": ["8 помещений без указанной площади"]
}
```

**`POST /admin/houses/:id/chairman`** — заводит учётку председателя по почте и отправляет письмо с приглашением:

```json
{ "email": "chairman@example.kz", "full_name": "Иванов И.И." }
```

---

## 5. Дома, помещения, реестр

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses` | любая | `self` | нет | `read` | нет |
| GET | `/houses/:id` | член дома | `house` | нет | `read` | нет |
| PATCH | `/houses/:id` | chairman | `house` | да | `write` | да |
| GET | `/houses/:id/units` | chairman, accountant | `house` | нет | `read` | нет |
| PATCH | `/houses/:id/units/:unitId` | chairman | `house` | да | `write` | да |
| POST | `/houses/:id/units/bulk-areas` | chairman | `house` | да | `write` | да |
| GET | `/houses/:id/registry` | chairman | `house` | нет | `read` | нет |
| POST | `/houses/:id/registry/imports` | chairman | `house` | нет | `write` | да |
| GET | `/houses/:id/registry/imports/:importId` | chairman | `house` | нет | `read` | нет |
| POST | `/houses/:id/registry/imports/:importId/apply` | chairman | `house` | да | `write` | да |
| DELETE | `/houses/:id/registry/imports/:importId` | chairman | `house` | нет | `write` | нет |
| GET | `/houses/:id/home` | член дома | `house` | нет | `read` | нет |

`GET /houses` возвращает дома, где у вызывающего есть активное членство. Для председателя с несколькими домами это источник данных для переключателя.

`POST /houses/:id/units/bulk-areas` — массовое заполнение площадей, главный путь к `is_voting_ready`.

`POST /houses/:id/registry/imports` принимает XLSX/CSV (multipart, поле `file`, до 5 МБ) и возвращает превью с ошибками; в реестр при этом ничего не пишется, поэтому без step-up. ИИН из файла сразу хешируется и в исходном виде не сохраняется, исходный файл тоже. `.../apply` (step-up) заменяет реестр целиком, заполняет площади (`areas`: `fill_empty` по умолчанию, `overwrite`, `skip`) и сразу сверяет с новым реестром жильцов, уже подтвердивших личность.

---

## 6. Членство и онбординг

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| POST | `/houses/:id/invites` | chairman | `house` | нет | `write` | да |
| GET | `/houses/:id/invites` | chairman | `house` | нет | `read` | нет |
| DELETE | `/houses/:id/invites/:inviteId` | chairman | `house` | нет | `write` | да |
| POST | `/houses/:id/invites/:inviteId/reissue` | chairman | `house` | нет | `write` | да |
| GET | `/invites/resolve/:token` | — | — | нет | `auth` | да |
| POST | `/invites/:token/accept` | аутентиф. | `self` | нет | `auth` | да |
| POST | `/join-requests` | аутентиф. | `self` | нет | `write` | да |
| GET | `/houses/:id/join-requests` | chairman | `house` | нет | `read` | нет |
| POST | `/houses/:id/join-requests/:requestId/approve` | chairman | `house` | да | `write` | да |
| POST | `/houses/:id/join-requests/:requestId/reject` | chairman | `house` | нет | `write` | да |
| GET | `/houses/:id/members` | chairman | `house` | нет | `read` | нет |
| POST | `/houses/:id/members` | chairman | `house` | да | `write` | да |
| DELETE | `/houses/:id/members/:userId` | chairman | `house` | да | `write` | да |

**`GET /invites/resolve/:token`** — единственный эндпоинт, отдающий что-то о доме до аутентификации. Отдаёт **минимум**:

```json
{ "house_display_name": "ЖК Асыл Арман, блок 3", "target_role": "RESIDENT", "valid": true }
```

Ни адреса, ни количества жильцов, ни финансов. Ссылка лежит в общем чате, и по ней нельзя получить данные дома.

---

## 7. Верификация личности

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| POST | `/verification/start` | аутентиф. | `self` | нет | `auth` | да |
| GET | `/verification/:id/status` | аутентиф. | `self` | нет | `read` | нет |
| POST | `/verification/:id/complete` | аутентиф. | `self` | нет | `auth` | да |
| POST | `/verification/:id/claim-unit` | аутентиф. | `self` | нет | `write` | да |
| GET | `/houses/:id/ownerships/pending` | chairman | `house` | нет | `read` | нет |
| POST | `/houses/:id/ownerships/:ownershipId/verify` | chairman | `house` | **да** | `write` | да |
| POST | `/houses/:id/ownerships/:ownershipId/reject` | chairman | `house` | **да** | `write` | да |

`POST /verification/start` создаёт процедуру подписания в SIGEX и возвращает QR и deeplink:

```json
{
  "verification_id": "uuid",
  "qr_url": "https://...",
  "deeplink": "egovmobile://sign?...",
  "expires_at": "2026-09-11T12:15:00Z"
}
```

`POST /verification/:id/complete` вызывается после подписания. Сервер **сам** забирает подпись у SIGEX, проверяет её, извлекает ИИН и ФИО из сертификата и сверяет с `OwnerRegistryEntry`. Клиент не сообщает результат — он только говорит «я закончил».

Ручное подтверждение собственности председателем (нет в реестре, расхождение ФИО) возможно только для жильца, чья личность уже подтверждена ЭЦП: иначе голос появился бы без идентификации по ст. 44.

В разработке вместо SIGEX работает заглушка (`SIGNATURE_PROVIDER=dev`): QR и deeplink ведут на `/dev/egov#<id>` веб-приложения, где документ подписывается тестовым сертификатом с введёнными ИИН и ФИО (`GET/POST /dev/egov/:externalId[/sign]`). Сервер проверяет такую подпись тем же путём, что и настоящую. В production заглушка запрещена проверкой конфигурации, а её маршруты не регистрируются.

---

## 8. Заявки

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/requests` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/requests` | член дома | `house` | нет | `write` | да |
| GET | `/requests/:id` | член дома | `house` | нет | `read` | нет |
| PATCH | `/requests/:id` | chairman, автор | `house` | нет | `write` | да |
| POST | `/requests/:id/accept` | chairman | `house` | нет | `write` | да |
| POST | `/requests/:id/reject` | chairman | `house` | нет | `write` | да |
| POST | `/requests/:id/merge` | chairman | `house` | нет | `write` | да |
| POST | `/requests/:id/stages` | chairman | `house` | нет | `write` | да |
| PATCH | `/stages/:id` | chairman, исполнитель | `house` | нет | `write` | да |
| POST | `/requests/:id/ai/suggest` | chairman | `house` | нет | `ai` | да |
| GET | `/requests/:id/activity` | член дома | `house` | нет | `read` | нет |

`GET /houses/:id/requests` фильтруется по роли: жилец видит свои заявки и все заявки по общему имуществу; заявки соседей про их квартиры ему не видны.

Сортировка по умолчанию: `priority DESC, created_at DESC` — срочные вверху, как требовалось.

---

## 9. Задачи

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/me/tasks` | worker | `self` | нет | `read` | нет |
| GET | `/houses/:id/tasks` | chairman | `house` | нет | `read` | нет |
| POST | `/houses/:id/tasks` | chairman | `house` | нет | `write` | да |
| PATCH | `/tasks/:id` | chairman | `house` | нет | `write` | да |
| POST | `/tasks/:id/start` | исполнитель | `house` | нет | `write` | да |
| POST | `/tasks/:id/complete` | исполнитель | `house` | нет | `upload` | да |
| POST | `/tasks/:id/approve` | chairman | `house` | нет | `write` | да |
| POST | `/tasks/:id/reject` | chairman | `house` | нет | `write` | да |
| GET | `/houses/:id/recurring-templates` | chairman | `house` | нет | `read` | нет |
| POST | `/houses/:id/recurring-templates` | chairman | `house` | нет | `write` | да |
| PATCH | `/recurring-templates/:id` | chairman | `house` | нет | `write` | да |

`POST /tasks/:id/complete` принимает `note` и `photo_file_ids`. Переводит задачу в `SUBMITTED`, а не в завершённое: фото станет видимым жильцам только после `approve` председателем.

---

## 10. Объявления

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/announcements` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/announcements` | chairman | `house` | нет | `write` | да |
| PATCH | `/announcements/:id` | chairman | `house` | нет | `write` | да |
| DELETE | `/announcements/:id` | chairman | `house` | нет | `write` | да |
| POST | `/announcements/:id/read` | член дома | `self` | нет | `write` | нет |
| GET | `/announcements/:id/stats` | chairman | `house` | нет | `read` | нет |

`GET` отдаёт только те объявления, которые адресованы вызывающему: `ALL`, либо `STAFF` для персонала, либо адресные, где он в `AnnouncementTarget`.

---

## 11. Голосования

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/votes` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/votes` | chairman | `house` | да | `write` | да |
| GET | `/votes/:id` | член дома | `house` | нет | `read` | нет |
| PATCH | `/votes/:id` | chairman | `house` | да | `write` | да |
| POST | `/votes/:id/send-notice` | chairman | `house` | да | `write` | да |
| POST | `/votes/:id/activate` | chairman | `house` | да | `write` | да |
| POST | `/votes/:id/cancel` | chairman | `house` | да | `write` | да |
| POST | `/votes/:id/ballot/start` | resident-owner | `house` | нет | `write` | да |
| POST | `/votes/:id/ballot/complete` | resident-owner | `house` | нет | `write` | да |
| GET | `/votes/:id/results` | член дома | `house` | нет | `read` | нет |
| POST | `/votes/:id/close` | chairman | `house` | да | `write` | да |
| GET | `/votes/:id/protocol` | член дома | `house` | нет | `read` | нет |
| POST | `/protocols/:id/sign` | chairman, secretary | `house` | да | `write` | да |

**`POST /houses/:id/votes`** отвечает `422`, если `house.is_voting_ready = false`:

```json
{
  "error": {
    "code": "HOUSE_NOT_VOTING_READY",
    "message": "Нельзя создать голосование: у 8 помещений не указана площадь",
    "details": { "units_without_area": 8 }
  }
}
```

**`POST /votes/:id/activate`** отвечает `422`, если с момента `notice_sent_at` прошло менее 5 календарных дней.

**`GET /votes/:id/results`** до закрытия отдаёт только явку и кворум, без распределения голосов — если `results_visible_during = false`. Иначе ход голосования влияет на тех, кто ещё не проголосовал.

**Подача бюллетеня — двухшаговая:** `ballot/start` формирует документ бюллетеня и инициирует подписание, `ballot/complete` вызывается после подписания, и сервер сам забирает и проверяет подпись. Вес голоса **не принимается от клиента** — он берётся из `VoteRegistrySnapshot`.

---

## 12. Финансы

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/finance/overview` | член дома | `house` | нет | `read` | нет |
| GET | `/houses/:id/accounts` | chairman, accountant | `house` | нет | `read` | нет |
| POST | `/houses/:id/accounts` | chairman | `house` | да | `write` | да |
| GET | `/houses/:id/transactions` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/transactions` | chairman, accountant | `house` | да | `write` | да |
| PATCH | `/transactions/:id` | chairman, accountant | `house` | да | `write` | да |
| POST | `/transactions/:id/confirm` | chairman | `house` | да | `write` | да |
| POST | `/transactions/:id/void` | chairman | `house` | да | `write` | да |
| POST | `/transactions/:id/attachments` | chairman, accountant | `house` | нет | `upload` | да |
| DELETE | `/transactions/:id/attachments/:fileId` | chairman, accountant | `house` | да | `write` | да |
| GET | `/budget-categories` | любая | `global` | нет | `read` | нет |

`GET /houses/:id/finance/overview` — дашборд. Для жильца и председателя структура одинаковая: это и есть прозрачность, обещанная жильцам.

```json
{
  "period": "2026-09",
  "accounts": [{ "type": "CURRENT", "balance": 1840000, "bank_name": "Halyk Bank" }],
  "income_total": 2100000,
  "expense_total": 1730000,
  "collection_rate": 87.4,
  "by_category": [
    { "code": "6.2.1", "name": "Услуги субъектов сервисной деятельности",
      "amount": 640000, "transaction_count": 6 }
  ]
}
```

`POST /houses/:id/transactions` **требует** `category_code` из справочника и `idempotency_key`. Без кода категории транзакция не попадёт в отчёт — поэтому поле обязательное, а не желательное.

`POST /transactions/:id/attachments` прикладывает акты выполненных работ, договоры и дефектные акты — это подтверждающие документы, которые по закону идут приложением к отчёту. Приложить их можно и после проведения транзакции: документы часто оформляются позже фактической оплаты, и требование приложить акт сразу заставило бы вести учёт мимо системы. Удаление приложения требует step-up — это изъятие подтверждающего документа из отчётности.

---

## 13. Начисления и оплаты

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/me/charges` | resident | `self` | нет | `read` | нет |
| GET | `/houses/:id/charges` | chairman, accountant | `house` | нет | `read` | нет |
| POST | `/houses/:id/charges/generate` | chairman | `house` | да | `write` | да |
| POST | `/houses/:id/charges` | chairman | `house` | да | `write` | да |
| GET | `/charges/:id/payment-link` | resident (свой) | `self` | нет | `read` | да |
| POST | `/charges/:id/payment` | resident (свой) | `self` | нет | `upload` | да |
| GET | `/houses/:id/payments` | chairman, accountant | `house` | нет | `read` | нет |
| POST | `/payments/:id/confirm` | chairman, accountant | `house` | да | `write` | да |
| POST | `/payments/:id/reject` | chairman, accountant | `house` | да | `write` | да |
| GET | `/houses/:id/debtors` | chairman, accountant | `house` | нет | `read` | да |

**`GET /houses/:id/debtors` доступен только председателю и бухгалтеру.** Жилец получает `403`. Обоснование — в [14-compliance-privacy.md](14-compliance-privacy.md#4-приватность-внутри-дома): публикация поимённого списка должников на весь дом раскрывает персональные данные и порождает конфликты между соседями. Просмотр списка пишется в аудит.

`GET /charges/:id/payment-link` возвращает deeplink Kaspi для режима `RECEIPT`; в режиме `KASPI_API` — счёт, выставленный через merchant API.

`POST /charges/:id/payment` — загрузка чека. Ставит платёж в `PENDING_REVIEW` и запускает OCR.

---

## 14. Чеки и файлы

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| POST | `/files/upload-url` | аутентиф. | `house` | нет | `upload` | да |
| POST | `/files/:id/finalize` | аутентиф. | `house` | нет | `write` | да |
| GET | `/files/:id/download-url` | по правам объекта | `house` | нет | `read` | да |
| POST | `/houses/:id/receipts` | chairman, accountant | `house` | нет | `upload` | да |
| GET | `/receipts/:id` | по правам объекта | `house` | нет | `read` | нет |
| PATCH | `/receipts/:id` | chairman, accountant | `house` | нет | `write` | да |

Загрузка двухэтапная: клиент запрашивает presigned URL, грузит файл напрямую в Object Storage, затем вызывает `finalize`. Сервер на этапе `finalize` проверяет сигнатуру файла, вырезает EXIF, считает хеши и ставит в очередь антивирусную проверку.

`GET /files/:id/download-url` выдаёт presigned URL на 5 минут **после проверки прав на родительский объект**. Право на файл не самостоятельно — оно наследуется от чека, заявки или объявления, к которым файл привязан.

---

## 15. Персонал и подрядчики

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/staff` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/staff` | chairman | `house` | нет | `write` | да |
| PATCH | `/staff/:id` | chairman | `house` | нет | `write` | да |
| GET | `/houses/:id/contractors` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/contractors` | chairman | `house` | нет | `write` | да |
| PATCH | `/contractors/:id` | chairman | `house` | нет | `write` | да |

Жилец видит только записи с `visible_to_residents = true` и без служебных полей (зарплата, паспортные данные). Это требование прозрачности — «чтобы этот персонал был виден жителям».

---

## 16. Отчёты

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/reports` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/reports/generate` | chairman, accountant | `house` | да | `write` | да |
| GET | `/reports/:id` | член дома | `house` | нет | `read` | нет |
| PATCH | `/reports/:id` | chairman, accountant | `house` | да | `write` | да |
| POST | `/reports/:id/sign` | chairman, accountant | `house` | да | `write` | да |
| POST | `/reports/:id/publish` | chairman | `house` | да | `write` | да |

Опубликованный отчёт виден всем жильцам — это требование закона о размещении отчёта в общедоступном месте.

---

## 17. ИИ

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| POST | `/houses/:id/legal/ask` | chairman, accountant | `house` | нет | `ai` | да |
| GET | `/houses/:id/legal/history` | chairman | `house` | нет | `read` | нет |
| POST | `/houses/:id/voice-notes` | chairman | `house` | нет | `upload` | да |
| GET | `/voice-notes/:id` | chairman | `house` | нет | `read` | нет |
| POST | `/voice-notes/:id/confirm-tasks` | chairman | `house` | нет | `write` | да |
| POST | `/houses/:id/proposals/compare` | chairman | `house` | нет | `ai` | да |
| GET | `/comparisons/:id` | chairman | `house` | нет | `read` | нет |
| GET | `/houses/:id/summary/latest` | член дома | `house` | нет | `read` | нет |
| GET | `/houses/:id/ai/usage` | chairman | `house` | нет | `read` | нет |

Все ИИ-эндпоинты асинхронные: возвращают `ai_job_id`, результат приходит через WebSocket или опросом.

**`POST /voice-notes/:id/confirm-tasks`** — существует потому, что ИИ не создаёт задачи сам. Модель извлекает кандидатов, председатель правит и подтверждает, и только тогда задачи появляются у работников с уведомлением.

---

## 18. Уведомления

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/me/notifications` | любая | `self` | нет | `read` | нет |
| POST | `/notifications/:id/read` | любая | `self` | нет | `write` | нет |
| POST | `/me/devices` | любая | `self` | нет | `write` | да |
| DELETE | `/me/devices/:id` | любая | `self` | нет | `write` | да |
| GET | `/me/notification-settings` | любая | `self` | нет | `read` | нет |
| PATCH | `/me/notification-settings` | любая | `self` | нет | `write` | да |

## 19. Аудит

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/audit` | chairman | `house` | нет | `read` | да |
| GET | `/houses/:id/audit/verify` | chairman | `house` | нет | `read` | да |

`GET /houses/:id/audit/verify` пересчитывает хеш-цепочку и подтверждает, что журнал не изменялся. Это функция, которую председатель может показать недоверчивому жильцу — и на которой держится заявление о прозрачности.

---

## 20. WebSocket

Подключение `wss://api/v1/ws` с access-токеном. Каналы: `house:{id}` (события дома, по членству), `user:{id}` (личные уведомления).

События: `request.created`, `request.status_changed`, `task.assigned`, `task.approved`, `vote.started`, `vote.closing_soon`, `payment.confirmed`, `announcement.published`, `ai_job.completed`.

Права на канал проверяются при подписке и **перепроверяются при отзыве членства** — иначе исключённый из дома жилец продолжит получать события через открытое соединение.
