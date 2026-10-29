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

`POST /houses/:id/members` добавляет только бухгалтера (по почте, с письмом для задания пароля и обязательной 2FA); работники вступают по персональной ссылке, жильцы — по ссылке или заявке. `DELETE` отзывает членство, закрывает собственность (`REJECTED`, право голоса пропадает) и отвязывает запись персонала; председателя меняет только админ платформы.

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

Пути под домом (`/houses/:id/requests/...`): членство проверяется до обращения к заявке.

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/requests` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/requests` | жилец, правление | `house` | нет | `write` | да |
| GET | `/houses/:id/requests/:requestId` | член дома | `house` | нет | `read` | нет |
| GET | `/houses/:id/requests/:requestId/activity` | член дома | `house` | нет | `read` | нет |
| PATCH | `/houses/:id/requests/:requestId` | chairman | `house` | нет | `write` | да |
| POST | `/houses/:id/requests/:requestId/accept` | chairman | `house` | нет | `write` | да |
| POST | `/houses/:id/requests/:requestId/reject` | chairman | `house` | нет | `write` | да |
| POST | `/houses/:id/requests/:requestId/merge` | chairman | `house` | нет | `write` | да |
| POST | `/houses/:id/requests/:requestId/close` | chairman | `house` | нет | `write` | да |
| POST | `/houses/:id/requests/:requestId/ai/suggest` | chairman | `house` | нет | `write` | да |
| POST | `/houses/:id/requests/:requestId/cancel` | автор | `house` | нет | `write` | да |
| POST | `/houses/:id/requests/:requestId/follow` | жилец | `house` | нет | `write` | нет |
| POST | `/houses/:id/requests/:requestId/comments` | автор, присоединившийся, правление | `house` | нет | `write` | нет |
| POST | `/houses/:id/requests/:requestId/rate` | автор | `house` | нет | `write` | нет |

Видимость: жилец видит свои заявки, те, к которым присоединился, и все по общему имуществу; заявки соседей про их квартиры ему не видны. Работник видит только заявки, по которым у него задача. Фото заявки наследуют это правило.

Сортировка: `priority` от `CRITICAL` к `LOW`, затем `created_at DESC` — срочные вверху.

Подача: точный дубликат от того же автора в течение часа склеивается с первой заявкой (`merged: true`). Иначе заявка получает номер в доме и статус `TRIAGE`, проходит триаж (кандидаты в дубли по локации + подсказка модели через слой обезличивания) и ждёт решения председателя. ИИ ничего не отклоняет: ставит предложенный приоритет и пометки `NEEDS_CLARIFICATION`, `SUSPICIOUS`, `POSSIBLE_DUPLICATE`; при отказе модели — `NO_AUTOCHECK` и `NORMAL`. Заявка председателя триаж пропускает. Модель в разработке — правила с тем же контрактом (`RulesAiProvider`), каждый вызов пишется в `ai_jobs`, решение председателя по подсказке — в `human_decision`.

---

## 9. Этапы и задачи

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| POST | `/houses/:id/requests/:requestId/stages` | chairman | `house` | нет | `write` | да |
| PATCH | `/houses/:id/requests/:requestId/stages/:stageId` | chairman, исполнитель этапа | `house` | нет | `write` | да |
| GET | `/houses/:id/my-tasks` | worker | `house` | нет | `read` | нет |
| GET | `/houses/:id/tasks` | chairman | `house` | нет | `read` | нет |
| GET | `/houses/:id/tasks/assignees` | chairman | `house` | нет | `read` | нет |
| POST | `/houses/:id/tasks` | chairman | `house` | нет | `write` | да |
| GET | `/houses/:id/tasks/:taskId` | chairman, исполнитель | `house` | нет | `read` | нет |
| PATCH | `/houses/:id/tasks/:taskId` | chairman | `house` | нет | `write` | да |
| POST | `/houses/:id/tasks/:taskId/start` | исполнитель | `house` | нет | `write` | да |
| POST | `/houses/:id/tasks/:taskId/complete` | исполнитель; chairman — за подрядчика | `house` | нет | `upload` | да |
| POST | `/houses/:id/tasks/:taskId/approve` | chairman | `house` | нет | `write` | да |
| POST | `/houses/:id/tasks/:taskId/reject` | chairman | `house` | нет | `write` | да |

`complete` принимает `note`, `photo_file_ids`, `client_key` и `completed_at` и переводит задачу в `SUBMITTED`: фото станут видны жильцам только после `approve` с `visible_to_residents`. Повтор с тем же `client_key` (офлайн-очередь) не создаёт второй отчёт; время берётся с телефона, но не из будущего. Задача, отменённая председателем, пока работник был без связи, всё равно принимает отчёт: факт работы не теряется. `approve` закрывает этап задачи; `reject` требует причину и возвращает задачу в `IN_PROGRESS` с прежними фото. Работник видит только свои задачи и заявки, по которым они назначены.

### Рутина по расписанию

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/recurring` | chairman | `house` | нет | `read` | нет |
| POST | `/houses/:id/recurring/preview` | chairman | `house` | нет | `write` | нет |
| POST | `/houses/:id/recurring` | chairman | `house` | нет | `write` | да |
| PATCH | `/houses/:id/recurring/:templateId` | chairman | `house` | нет | `write` | да |

Расписание — RRULE по RFC 5545 без DTSTART, в местном времени дома (`FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9`), не чаще раза в день. Планировщик в процессе API раз в 10 минут создаёт задачи за `lead_time_hours` до вхождения (срок — конец местного дня), прошлое не догоняет. Невыполненная рутина не копится: с наступлением следующего вхождения старая задача закрывается как `EXPIRED`; на третьем пропуске подряд председатель получает сигнал. Выключение шаблона отменяет его будущие задачи.

---

## 10. Объявления

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/announcements` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/announcements` | chairman | `house` | нет | `write` | да |
| PATCH | `/houses/:id/announcements/:announcementId` | chairman | `house` | нет | `write` | да |
| DELETE | `/houses/:id/announcements/:announcementId` | chairman | `house` | нет | `write` | да |
| POST | `/houses/:id/announcements/:announcementId/read` | член дома | `house` | нет | `write` | нет |
| GET | `/houses/:id/announcements/:announcementId/stats` | chairman | `house` | нет | `read` | нет |
| POST | `/houses/:id/announcements/:announcementId/remind` | chairman | `house` | нет | `write` | да |

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
| PATCH | `/houses/:id/accounts/:accountId` | chairman | `house` | да | `write` | да |
| GET | `/houses/:id/transactions` | член дома | `house` | нет | `read` | нет |
| GET | `/houses/:id/transactions/:txId` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/transactions` | chairman, accountant | `house` | да | `write` | да |
| PATCH | `/houses/:id/transactions/:txId` | chairman, accountant | `house` | да | `write` | да |
| POST | `/houses/:id/transactions/:txId/confirm` | chairman | `house` | да | `write` | да |
| POST | `/houses/:id/transactions/:txId/void` | chairman; accountant — свой черновик | `house` | да | `write` | да |
| POST | `/houses/:id/transactions/:txId/documents` | chairman, accountant | `house` | нет | `upload` | да |
| POST | `/houses/:id/transactions/:txId/documents/:documentId/remove` | chairman; accountant — у черновика | `house` | да | `write` | да |
| GET | `/budget-categories` | любая | `global` | нет | `read` | нет |

`GET /houses/:id/finance/overview` — дашборд. Для жильца и председателя структура одинаковая: это и есть прозрачность, обещанная жильцам. Параметр `period` (по умолчанию текущий месяц); в ответе — остатки, итоги и разбивка по строкам формы за месяц, `collection_rate` (оплачено от начисленного за месяц), динамика за 6 месяцев. Правлению дополнительно `board`: черновики, расходы без документов, оплаты на проверке, просроченный долг.

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

Жилец и работник видят в журнале проведённые и аннулированные операции, без черновиков и без того, кто вносил запись. Бухгалтер вносит черновик, председатель проводит (`confirm` с `revision` — отпечатком той версии черновика, которую он видел: если черновик изменили после просмотра, ответ `409`) или вносит сразу с `confirm: true`. Снятый бухгалтером черновик жильцам не показывается. `PATCH` работает только для черновика: проведённая операция исправляется аннулированием с причиной и новой записью с `corrects_id`. Ошибки: `CATEGORY_INVALID` (не конечная строка формы), `ACCOUNT_MISMATCH` (взносы на капремонт не на сберегательный счёт или расход со сберегательного не на капремонт), `CONTRACTOR_REQUIRED` (строка 7.2.1 без исполнителя), `TRANSACTION_STATE`, `IDEMPOTENCY_CONFLICT`. В ответе `missing_documents` — чего не хватает для отчёта; проведению это не мешает.

`POST /houses/:id/transactions/:txId/documents` (`{file_id, kind}`) прикладывает акты выполненных работ, договоры и дефектные акты — это подтверждающие документы, которые по закону идут приложением к отчёту. Приложить их можно и после проведения транзакции: документы часто оформляются позже фактической оплаты, и требование приложить акт сразу заставило бы вести учёт мимо системы. Изъятие документа требует step-up — это изъятие подтверждающего документа из отчётности. У проведённой операции изымает только председатель и с причиной (`{reason}`). Изъятие мягкое: запись и файл остаются, жильцы документ больше не видят. Финансовые документы (`purpose = FINANCE_DOCUMENT`) загружают только председатель и бухгалтер; файл привязывается только к объекту своего назначения.

---

## 13. Начисления и оплаты

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/tariffs` | chairman, accountant | `house` | нет | `read` | нет |
| POST | `/houses/:id/tariffs` | chairman | `house` | да | `write` | да |
| GET | `/houses/:id/my-charges` | член дома (свои помещения) | `self` | нет | `read` | нет |
| GET | `/houses/:id/charges` | chairman, accountant | `house` | нет | `read` | нет |
| GET | `/houses/:id/charges/summary?period=` | chairman, accountant | `house` | нет | `read` | нет |
| POST | `/houses/:id/charges/generate` | chairman | `house` | да | `write` | да |
| POST | `/houses/:id/charge-collections` | chairman | `house` | да | `write` | да |
| PATCH | `/houses/:id/charges/:chargeId` | chairman | `house` | да | `write` | да |
| POST | `/houses/:id/charges/:chargeId/cancel` | chairman | `house` | да | `write` | да |
| GET | `/houses/:id/payment-settings` | chairman, accountant | `house` | нет | `read` | нет |
| PUT | `/houses/:id/payment-settings` | chairman | `house` | да | `write` | да |
| GET | `/houses/:id/charges/:chargeId/payment-link` | член дома (своё помещение) | `self` | нет | `read` | да |
| POST | `/houses/:id/charges/:chargeId/payments` | член дома (своё помещение) | `self` | нет | `upload` | да |
| GET | `/houses/:id/my-payments` | член дома | `self` | нет | `read` | нет |
| GET | `/houses/:id/payments?status=review` | chairman, accountant | `house` | нет | `read` | нет |
| GET | `/houses/:id/payments/:paymentId` | правление; плательщик — свою | `house` | нет | `read` | нет |
| POST | `/houses/:id/payments` | chairman, accountant | `house` | да | `write` | да |
| POST | `/houses/:id/payments/:paymentId/confirm` | chairman | `house` | да | `write` | да |
| POST | `/houses/:id/payments/:paymentId/reject` | chairman, accountant | `house` | да | `write` | да |
| POST | `/houses/:id/receipts/scan` | chairman, accountant | `house` | нет | `upload` | да |
| GET | `/houses/:id/debtors` | chairman, accountant | `house` | нет | `read` | да |
| POST | `/houses/:id/debtors/remind` | chairman, accountant | `house` | нет | `write` | да |

**`GET /houses/:id/debtors` доступен только председателю и бухгалтеру.** Жилец получает `403`. Обоснование — в [14-compliance-privacy.md](14-compliance-privacy.md#4-приватность-внутри-дома): публикация поимённого списка должников на весь дом раскрывает персональные данные и порождает конфликты между соседями. Просмотр списка пишется в аудит. Градация по числу просроченных месяцев: 1 — `REMIND`, 2–3 — `REPEAT`, больше 3 — `PRETRIAL`. `debtors/remind` (`{unit_ids}`) отправляет личное уведомление собственникам с подтверждённой собственностью; тому же помещению — не чаще раза в трое суток.

**Тарифы** задаются с текущего месяца или позже и не правятся: новый тариф того же вида закрывает предыдущий (`effective_to`). Виды: `MAINTENANCE` и `CAPITAL_REPAIR` — за м² для квартир и нежилых помещений, `PARKING` — фиксированно для парковочных мест и кладовок (по умолчанию; `unit_types` можно задать). **Начисление** за месяц идёт 1 числа по расписанию и вручную (`generate`, текущий или прошлый месяц); повторный запуск добавляет только недостающее. Помещения без площади пропускаются и возвращаются списком в `skipped_units`. Срок оплаты — последний день месяца; после него неоплаченное становится `OVERDUE`. Сумму начисления можно исправить или отменить только до первой оплаты и с причиной. **Целевой сбор** (`charge-collections`) требует `decision_note` — основание из протокола собрания; файл протокола виден всем жильцам. `my-charges` показывает начисления только по помещениям с подтверждённой собственностью.

`payment-link` возвращает ссылку Kaspi Pay из реквизитов дома (`pay_url` на домене kaspi.kz, `recipient_name`), сумму к оплате и назначение; без реквизитов — `409 PAYMENT_SETTINGS_MISSING`. Смена реквизитов — step-up и аудит: подмена реквизитов — классический способ увода денег.

`POST .../payments` принимает чек (`file_id` с `purpose = PAYMENT_RECEIPT`, фото или PDF) и необязательные `amount`, `external_ref`, `paid_at`. Сервер распознаёт чек (в разработке — текстовый слой PDF), сверяет и ставит `PENDING_REVIEW` или `FLAGGED` с флагами: `DUPLICATE_FILE` (тот же файл, в том числе в другом доме), `SIMILAR_IMAGE` (перцептивный хеш), `DUPLICATE_REF` (номер операции уже в другой оплате), `AMOUNT_MISMATCH`, `RECIPIENT_MISMATCH`, `NOT_RECOGNIZED`. Автоматического отказа нет. Сумму не распознать и не ввести — `422` с полем `amount`. Чек видят только плательщик и правление.

`confirm` (`{amount?, acknowledge_flags}`) атомарно закрывает начисление (не больше остатка), создаёт проведённое поступление в журнале по строке формы (6.1, 6.2, 6.3 — на сберегательный, 6.5/6.6, 6.7) без номера помещения и имени плательщика и уведомляет плательщика. Флаги требуют `acknowledge_flags: true`. Номер операции банка подтверждается один раз во всей системе — частичный уникальный индекс в базе. `POST /payments` — наличные или перевод по выписке: от председателя — сразу зачтены, от бухгалтера — ждут подтверждения председателя (деньги проводит председатель, как и операции). Замечания (`flags`) видит только правление: плательщику не сообщается, что такой файл или номер есть в другом доме. `receipts/scan` распознаёт чек расхода для предзаполнения формы и предупреждает о повторе.

---

## 14. Чеки и файлы

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| POST | `/houses/:id/files/upload-url` | член дома | `house` | нет | `upload` | нет |
| POST | `/houses/:id/files/:fileId/finalize` | загрузивший | `house` | нет | `write` | да |
| GET | `/houses/:id/files/:fileId/download-url` | по правам объекта | `house` | нет | `read` | нет |
| POST | `/houses/:id/receipts` | chairman, accountant | `house` | нет | `upload` | да |
| GET | `/receipts/:id` | по правам объекта | `house` | нет | `read` | нет |
| PATCH | `/receipts/:id` | chairman, accountant | `house` | нет | `write` | да |

Загрузка двухэтапная: клиент запрашивает presigned URL, грузит файл напрямую в Object Storage, затем вызывает `finalize`. Тип и размер зашиты в подпись ссылки: подменить их при загрузке нельзя. Файл сначала лежит во «входящих»; на `finalize` сервер проверяет сигнатуру содержимого (JPEG, PNG, WebP), перекодирует изображение в JPEG — EXIF с координатами не переживает перекодирование, поворот применяется к пикселям — считает хеш и переносит файл в постоянное место. Не изображение — `FILE_REJECTED`, файл удаляется. Для `purpose = FINANCE_DOCUMENT` принимается и PDF: он не перекодируется, поэтому перед сохранением проходит антивирус (в разработке — эвристика, отклоняющая активное содержимое). В разработке хранилище — SeaweedFS из docker-compose, в тестах — память.

`GET /files/:id/download-url` выдаёт presigned URL на 5 минут **после проверки прав на родительский объект**. Право на файл не самостоятельно — оно наследуется от чека, заявки или объявления, к которым файл привязан.

---

## 15. Персонал и подрядчики

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/staff` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/staff` | chairman | `house` | нет | `write` | да |
| PATCH | `/houses/:id/staff/:staffId` | chairman | `house` | нет | `write` | да |
| GET | `/houses/:id/contractors` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/contractors` | chairman | `house` | нет | `write` | да |
| PATCH | `/houses/:id/contractors/:contractorId` | chairman | `house` | нет | `write` | да |

Жилец видит только записи с `visible_to_residents = true` и без служебных полей (зарплата, паспортные данные). Это требование прозрачности — «чтобы этот персонал был виден жителям».

---

## 16. Отчёты

| Метод | Путь | Роль | Скоуп | Step-up | Лимит | Аудит |
|---|---|---|---|---|---|---|
| GET | `/houses/:id/reports` | член дома | `house` | нет | `read` | нет |
| GET | `/houses/:id/reports/:reportId` | член дома | `house` | нет | `read` | нет |
| POST | `/houses/:id/reports/generate` | chairman, accountant | `house` | да | `write` | да |
| POST | `/houses/:id/reports/:reportId/sign` | chairman, accountant | `house` | да | `write` | да |
| POST | `/houses/:id/reports/:reportId/sign/complete` | chairman, accountant | `house` | нет | `write` | да |
| POST | `/houses/:id/reports/:reportId/publish` | chairman | `house` | да | `write` | да |

Черновик собирается 15 числа по расписанию (за прошлый месяц) и вручную (`generate`, `{period}`); пересобирается, пока на нём нет ни одной подписи. Строки — по шаблону формы (`report_templates`): остатки счетов на конец месяца, долги по видам начислений, суммы проведённых операций по кодам строк, суммы строк; для 7.2.1 — исполнители и виды услуг. В `issues` — что исправить до срока (операции без документов, непроведённые черновики, оплаты на проверке, помещения без площади); жильцам недочёты не показываются. Подписание: `sign` начинает процедуру eGov mobile над SHA-256 канонического содержимого, `sign/complete` забирает и проверяет подпись; ИИН из сертификата должен совпасть с подтверждённым ИИН пользователя (без подтверждённой личности — `IDENTITY_REQUIRED`). Первая подпись закрывает месяц: операции и начисления этого периода не вносятся, не меняются и не аннулируются (`409 PERIOD_CLOSED`), отчёт не пересобирается; проверка и подпись сериализованы блокировкой строки отчёта. Перед подписанием неподписанный черновик пересобирается, если журнал изменился после его сборки, а при завершении подписи содержимое сверяется с журналом ещё раз — подпись всегда покрывает актуальные цифры и фотоотчёт. Подписи председателя и бухгалтера (если бухгалтер в доме есть) → `SIGNED`; публикация — председатель, уведомление всем членам дома. Напоминания правлению — 18 и 19 числа, если не подписан.

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
| POST | `/me/notifications/read-all` | любая | `self` | нет | `write` | нет |
| POST | `/notifications/:id/read` | любая | `self` | нет | `write` | нет |
| POST | `/me/devices` | любая | `self` | нет | `write` | да |
| DELETE | `/me/devices/:id` | любая | `self` | нет | `write` | да |
| GET | `/me/notification-settings` | любая | `self` | нет | `read` | нет |
| PATCH | `/me/notification-settings` | любая | `self` | нет | `write` | да |

Уведомления пишутся в исходящую очередь (`notifications`) отдельной системной транзакцией после основного действия; диспетчер в процессе API забирает строки через `FOR UPDATE SKIP LOCKED` раз в 30 секунд. Каналы и тихие часы — по [08-flows-system.md](08-flows-system.md#811-уведомления-правила-отправки). Push по категории `VOTES` не отключается. Push и SMS в разработке — заглушки с тем же интерфейсом (SMS приходят в Mailpit). Группировка однотипных уведомлений появится вместе с заявками.

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
