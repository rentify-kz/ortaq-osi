# 02. Модель данных

PostgreSQL 16, доступ через Prisma. Все идентификаторы — **UUIDv7** (сортируемые по времени, но непредсказуемые: последовательные ID позволили бы перебрать чужие записи).

## 1. Общие правила

**Мультитенантность.** Каждая доменная таблица несёт `house_id`. Скоуп подставляется автоматически через Prisma client extension и дублируется политиками Row Level Security на стороне БД. Подробности — в [13-security.md](13-security.md#1-изоляция-домов).

**Время.** Все метки — `timestamptz` в UTC. Отображение — в `Asia/Almaty`. Периоды начислений и отчётов — строка `YYYY-MM`, потому что «месяц» здесь бухгалтерская сущность, а не отрезок времени.

**Деньги.** `numeric(14,2)`, валюта KZT. **Никогда не `float`** — округление в отчёте, который подписывается ЭЦП, недопустимо.

**Мягкое удаление.** `deleted_at` там, где запись может исчезнуть из интерфейса, но должна остаться в истории (заявки, объявления, персонал). Финансовые записи, бюллетени и аудит **не удаляются вообще**.

**Аудит.** Изменения в таблицах с деньгами, голосами, ролями и реестром пишутся в `AuditLog`.

---

## 2. ERD — основные связи

```
Organization ──< House ──< Unit ──< UnitOwnership >── User
                  │                                    │
                  ├──< Invite                           ├──< Session
                  ├──< JoinRequest                      ├──< DeviceToken
                  ├──< HouseMembership >─────────────────┤
                  │                                      │
                  ├──< Request ──< RequestStage          │
                  │      │                               │
                  │      └──< Task ──< TaskCompletion ────┤
                  │             ^                        │
                  │             └── RecurringTaskTemplate │
                  │                                      │
                  ├──< Announcement ──< AnnouncementTarget
                  │                                      │
                  ├──< Vote ──< VoteQuestion ──< VoteOption
                  │      │                               │
                  │      ├──< VoteRegistrySnapshot        │
                  │      ├──< Ballot ──< BallotAnswer ────┤
                  │      └──── Protocol ──> Signature     │
                  │                                      │
                  ├──< FinanceAccount ──< Transaction ──> Receipt
                  │                          │
                  │                          └──> BudgetCategory
                  ├──< Charge ──< Payment ──> Receipt
                  │
                  ├──< StaffMember ──> User
                  ├──< Contractor ──< CommercialProposal ──> ProposalComparison
                  ├──< Report ──> ReportTemplate
                  ├──< VoiceNote ──< Task
                  ├──< WeeklySummary
                  └──< AuditLog
```

---

## 3. Организации, дома, помещения

### `Organization` — ОСИ или ПТ

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Наименование юрлица |
| `bin` | varchar(12) | БИН. Уникален |
| `management_form` | enum | `OSI` \| `PT` |
| `legal_address` | text | Юридический адрес |
| `bank_details` | jsonb | Реквизиты для отчёта |
| `status` | enum | `ACTIVE` \| `SUSPENDED` |
| `created_at` / `updated_at` | timestamptz | |

Организация может управлять несколькими домами — типичный случай для ОСИ, созданной на несколько зданий одного ЖК.

### `House` — объект кондоминиума

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | FK → `Organization` |
| `address` | text | Адрес |
| `display_name` | text | Как показывать жильцам («ЖК Асыл Арман, блок 3») |
| `entrance_count` | int | Количество подъездов — вводит админ |
| `unit_count` | int | Количество квартир — вводит админ |
| `floor_count` | int | Этажность, опционально |
| `built_year` | int | Опционально |
| `total_area` | numeric(12,2) | Сумма площадей помещений. **Вычисляется**, не вводится |
| `is_voting_ready` | boolean | Заполнены ли все площади. Вычисляется триггером |
| `registry_uploaded_at` | timestamptz | Когда загружен реестр собственников |
| `payment_mode` | enum | `RECEIPT` \| `KASPI_API` — режим сверки оплат |
| `kaspi_config` | jsonb | Реквизиты для ссылок и, позже, merchant API |
| `timezone` | text | По умолчанию `Asia/Almaty` |
| `created_at` / `updated_at` | timestamptz | |

`is_voting_ready` — не украшение интерфейса, а предохранитель. Пока он `false`, создание голосования блокируется на уровне сервиса. Причина: голоса по закону считаются пропорционально площади, и голосование с пустыми площадями даст юридически ничтожный протокол.

### `Unit` — помещение

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `number` | text | Номер помещения. Текст, потому что бывают «12А», «1/2» |
| `type` | enum | `APARTMENT` \| `COMMERCIAL` \| `PARKING` \| `STORAGE` |
| `area` | numeric(8,2) | **Площадь, м². Основа веса голоса.** Nullable до заполнения |
| `entrance` | int | Номер подъезда |
| `floor` | int | Этаж |
| `rooms` | int | Опционально |
| `is_excluded_from_voting` | boolean | Помещения, не участвующие в голосовании (например, общедомовые) |
| `created_at` / `updated_at` | timestamptz | |

Уникальность: `(house_id, number)`.

Помещения генерируются автоматически при создании дома из `entrance_count` и `unit_count` — со сквозной нумерацией и равномерным распределением по подъездам. Результат **редактируемый**: реальные дома почти никогда не делятся ровно, и генератор — это заготовка, а не истина.

### `UnitOwnership` — связь человека с помещением

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `unit_id` | uuid | FK → `Unit` |
| `user_id` | uuid | FK → `User` |
| `relation` | enum | `OWNER` \| `TENANT` \| `FAMILY` |
| `share` | numeric(5,4) | Доля собственности, по умолчанию `1.0000` |
| `verification_status` | enum | `PENDING` \| `VERIFIED` \| `REJECTED` |
| `verification_method` | enum | `EDS_REGISTRY_MATCH` \| `MANUAL_CHAIRMAN` |
| `verified_at` | timestamptz | |
| `verified_by` | uuid | Кто подтвердил, если вручную |
| `is_voting_representative` | boolean | Кто голосует от помещения при нескольких собственниках |

**Право голоса даёт только `relation = OWNER` с `verification_status = VERIFIED`.** Наниматель может создавать заявки и видеть объявления, но не голосует — голос принадлежит собственности, а не проживанию.

При долевой собственности голосует один представитель (`is_voting_representative`), иначе одно помещение подаст несколько бюллетеней. Ограничение: не более одного представителя на помещение.

### `OwnerRegistryEntry` — реестр собственников

Загружается председателем (XLSX/CSV) и служит эталоном для сверки при верификации.

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `unit_number` | text | Номер помещения из реестра |
| `iin_hash` | bytea | HMAC-SHA256 от ИИН. **Сам ИИН не хранится** |
| `full_name` | text | ФИО для сверки |
| `area` | numeric(8,2) | Площадь из реестра |
| `source_file_id` | uuid | FK → `File` |
| `imported_at` | timestamptz | |

Хранение ИИН в виде HMAC-хеша позволяет сверять личность, не храня сам номер: при верификации мы хешируем ИИН из сертификата ЭЦП тем же ключом и сравниваем. Утечка этой таблицы не раскрывает ИИН жильцов.

---

## 4. Пользователи, доступ, онбординг

### `User`

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `phone` | varchar(16) | E.164. Уникален. Основной вход для жильцов и работников |
| `email` | citext | Уникален. Вход для админа, председателя, бухгалтера |
| `password_hash` | text | Argon2id. Только для ролей с почтовым входом |
| `full_name` | text | |
| `iin_encrypted` | bytea | AES-256-GCM, ключ в Lockbox |
| `iin_hash` | bytea | HMAC для сверки без расшифровки |
| `identity_verified_at` | timestamptz | Когда подтверждена личность через ЭЦП |
| `avatar_file_id` | uuid | FK → `File` |
| `locale` | enum | `ru` \| `kk` |
| `totp_secret_encrypted` | bytea | 2FA. Обязательна для админа, председателя, бухгалтера |
| `status` | enum | `PENDING` \| `ACTIVE` \| `BLOCKED` |
| `last_login_at` | timestamptz | |

ИИН хранится в двух формах намеренно: зашифрованный — чтобы показать самому пользователю и вписать в протокол; хешированный — чтобы сверять с реестром и искать без расшифровки. Подробности в [14-compliance-privacy.md](14-compliance-privacy.md#3-шифрование-иин).

### `HouseMembership` — роль пользователя в доме

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `User` |
| `house_id` | uuid | FK → `House` |
| `role` | enum | `CHAIRMAN` \| `ACCOUNTANT` \| `WORKER` \| `RESIDENT` |
| `status` | enum | `PENDING` \| `ACTIVE` \| `REVOKED` |
| `joined_via` | enum | `ADMIN_PROVISION` \| `INVITE_LINK` \| `JOIN_REQUEST` \| `CHAIRMAN_ADD` |
| `created_at` / `revoked_at` | timestamptz | |

Роль привязана к дому, а не к пользователю глобально. Один человек может быть председателем в своём доме и обычным жильцом в доме родителей. `PLATFORM_ADMIN` — исключение: он глобальный и хранится в `User.is_platform_admin`.

Уникальность: `(user_id, house_id)` среди активных.

### `Invite` — ссылка-приглашение

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `token_hash` | bytea | SHA-256 от токена. **Сам токен не хранится** |
| `type` | enum | `PUBLIC_LINK` (в чат дома) \| `PERSONAL` (конкретному человеку) |
| `target_role` | enum | `RESIDENT` \| `WORKER` |
| `expires_at` | timestamptz | По умолчанию +14 дней |
| `max_uses` | int | `null` = без лимита |
| `use_count` | int | |
| `revoked_at` | timestamptz | |
| `created_by` | uuid | FK → `User` |

Токен — 128 бит случайности, показывается один раз при создании. В БД только хеш: утечка дампа не даёт рабочих ссылок.

Ссылка даёт ровно одно право — **начать регистрацию в доме X**. Она не подтверждает личность и не даёт доступа к данным дома до завершения верификации. Это принципиально: ссылка уходит в общий чат жильцов, откуда её могут переслать кому угодно.

### `JoinRequest` — заявка на вступление без ссылки

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `user_id` | uuid | FK → `User` |
| `claimed_unit_number` | text | Какую квартиру заявляет |
| `claimed_relation` | enum | `OWNER` \| `TENANT` |
| `comment` | text | Сообщение председателю |
| `status` | enum | `PENDING` \| `APPROVED` \| `REJECTED` |
| `reviewed_by` / `reviewed_at` | uuid / timestamptz | |
| `rejection_reason` | text | |

### `Session`, `OtpCode`, `DeviceToken`

`Session` — выданные refresh-токены: `token_hash`, `family_id` (для обнаружения повторного использования), `device_info`, `ip`, `expires_at`, `revoked_at`.

`OtpCode` — `phone`, `code_hash`, `purpose`, `attempts`, `expires_at`, `consumed_at`. Код хранится хешированным, живёт 5 минут, не более 5 попыток.

`DeviceToken` — `user_id`, `token`, `platform` (`ios`/`android`/`web`), `last_seen_at`.

---

## 5. Заявки и задачи

### `Request` — заявка

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `author_id` | uuid | FK → `User` |
| `number` | int | Порядковый номер в доме, чтобы можно было сослаться: «заявка №14» |
| `title` | text | |
| `description` | text | |
| `category` | enum | `PLUMBING`, `ELECTRICITY`, `HEATING`, `ELEVATOR`, `CLEANING`, `YARD`, `FACADE`, `ROOF`, `BASEMENT`, `TRASH`, `SECURITY`, `OTHER` |
| `location_type` | enum | `YARD`, `ENTRANCE`, `APARTMENT`, `FACADE`, `ROOF`, `BASEMENT`, `PARKING`, `COMMON_AREA` |
| `location_entrance` | int | Подъезд, если применимо |
| `location_floor` | int | Этаж, если применимо |
| `location_detail` | text | Уточнение: «у третьего окна слева» |
| `unit_id` | uuid | Если заявка про конкретное помещение |
| `priority` | enum | `CRITICAL` \| `HIGH` \| `NORMAL` \| `LOW` |
| `priority_set_by` | enum | `AI_SUGGESTED` \| `CHAIRMAN` |
| `status` | enum | `NEW`, `TRIAGE`, `REJECTED`, `ACCEPTED`, `IN_PROGRESS`, `DONE`, `CANCELLED` |
| `ai_triage` | jsonb | Результат триажа: осмысленность, категория, приоритет, обоснование |
| `duplicate_of_id` | uuid | FK → `Request`, если признана дубликатом |
| `rejection_reason` | text | |
| `accepted_at`, `done_at` | timestamptz | |
| `deleted_at` | timestamptz | |

Поля локации разделены намеренно: исходное требование — «выбор конкретного места/этажа (двор, наружная/внутренняя часть дома)». Структурированная локация нужна не для красоты, а чтобы находить дубликаты («течёт в 3 подъезде на 5 этаже» от четырёх жильцов — одна проблема) и чтобы назначать исполнителя по зоне ответственности.

`priority_set_by` фиксирует, ИИ предложил приоритет или человек поставил. Без этого невозможно оценить, насколько ИИ можно доверять.

### `RequestStage` — этапы работы

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `request_id` | uuid | FK → `Request` |
| `order` | int | Порядок |
| `title` | text | «Осмотр», «Закуп материалов», «Ремонт», «Проверка» |
| `status` | enum | `PENDING` \| `IN_PROGRESS` \| `DONE` \| `SKIPPED` |
| `completed_at` | timestamptz | |
| `completed_by` | uuid | |
| `note` | text | |

Прогресс заявки для жильца = доля завершённых этапов. Это и есть требование «у жильцов видно было прогресс заявки».

### `Task` — задача исполнителю

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `assignee_id` | uuid | FK → `User`, работник |
| `contractor_id` | uuid | FK → `Contractor`, если работу делает подрядчик |
| `request_id` | uuid | FK → `Request`, если задача из заявки |
| `stage_id` | uuid | FK → `RequestStage`, если привязана к этапу |
| `voice_note_id` | uuid | FK → `VoiceNote`, если извлечена из голосового |
| `recurring_template_id` | uuid | FK → `RecurringTaskTemplate`, если порождена расписанием |
| `title` / `description` | text | |
| `specialization` | enum | `PLUMBER`, `ELECTRICIAN`, `CLEANER`, `YARD_KEEPER`, `HANDYMAN`, `SECURITY`, `OTHER` |
| `priority` | enum | как у заявки |
| `due_at` | timestamptz | |
| `status` | enum | `ASSIGNED`, `IN_PROGRESS`, `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED` |
| `source` | enum | `MANUAL`, `FROM_REQUEST`, `FROM_VOICE`, `RECURRING` |
| `created_by` | uuid | |

Разделение `SUBMITTED` и `APPROVED` существенно: работник отмечает выполнение, но фото попадает жильцам только после подтверждения председателем. Это прямо следует из требования «фото сразу отображается у жителей после подтверждения выполнения председателем».

### `TaskCompletion` — отчёт о выполнении

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `task_id` | uuid | FK → `Task` |
| `completed_by` | uuid | FK → `User` |
| `note` | text | |
| `photo_file_ids` | uuid[] | Фотофиксация |
| `completed_at` | timestamptz | |
| `approved_by` / `approved_at` | uuid / timestamptz | |
| `rejection_reason` | text | |
| `visible_to_residents` | boolean | Ставится `true` при подтверждении |
| `include_in_report` | boolean | Попадёт ли фото в ежемесячный отчёт |

### `RecurringTaskTemplate` — рутинная работа по расписанию

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `title` / `description` | text | «Уборка двора» |
| `specialization` | enum | |
| `default_assignee_id` | uuid | |
| `rrule` | text | Расписание в формате RFC 5545 |
| `lead_time_hours` | int | За сколько часов создавать задачу |
| `requires_photo` | boolean | |
| `is_active` | boolean | |

RRULE выбран вместо cron, потому что бытовые расписания формулируются календарно: «каждый будний день», «первый понедельник месяца». Cron это выражает плохо.

---

## 6. Объявления

### `Announcement`

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `author_id` | uuid | FK → `User` |
| `title` / `body` | text | |
| `audience` | enum | `ALL` \| `STAFF` \| `SPECIFIC_USERS` \| `SPECIFIC_UNITS` \| `ENTRANCE` |
| `attachment_file_ids` | uuid[] | |
| `is_pinned` | boolean | |
| `published_at` / `expires_at` | timestamptz | |
| `deleted_at` | timestamptz | |

### `AnnouncementTarget` и `AnnouncementRead`

`AnnouncementTarget` — `announcement_id`, `user_id` \| `unit_id` \| `entrance` для адресных объявлений.

`AnnouncementRead` — `announcement_id`, `user_id`, `read_at`. Даёт председателю понимание охвата: объявление о плановом отключении воды, которое прочитали 12% дома, надо продублировать иначе.

---

## 7. Голосования

Полное описание логики — в [09-voting-legal.md](09-voting-legal.md).

### `Vote`

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `title` / `description` | text | |
| `legal_basis` | enum | `ART_42_MEETING` \| `ART_43_WRITTEN_SURVEY` \| `ART_44_ELECTRONIC` |
| `decision_type` | enum | Определяет порог. См. [09](09-voting-legal.md#3-пороги-принятия-решений) |
| `threshold` | enum | `SIMPLE_MAJORITY` \| `TWO_THIRDS`. Выводится из `decision_type`, хранится для истории |
| `quorum_basis` | enum | `BY_AREA` (по умолчанию) \| `BY_UNIT` |
| `notice_sent_at` | timestamptz | Когда разослано уведомление |
| `starts_at` / `ends_at` | timestamptz | |
| `status` | enum | `DRAFT`, `NOTICE_SENT`, `ACTIVE`, `CLOSED`, `CANCELLED` |
| `results_visible_during` | boolean | По умолчанию `false` |
| `snapshot_id` | uuid | FK → `VoteRegistrySnapshot` |
| `protocol_id` | uuid | FK → `Protocol` |
| `created_by` | uuid | |

Проверка при переходе в `ACTIVE`: `starts_at - notice_sent_at >= 5 дней`. Закон требует уведомления не позднее чем за 5 календарных дней; система не даёт это нарушить.

### `VoteRegistrySnapshot` — замороженный реестр

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `vote_id` | uuid | FK → `Vote` |
| `total_area` | numeric(12,2) | Общая площадь на момент старта |
| `total_units` | int | |
| `entries` | jsonb | `[{unit_id, area, owner_user_id, weight}]` |
| `created_at` | timestamptz | |

**Ключевое решение.** Веса голосов берутся из снимка, сделанного при запуске голосования, а не из текущего состояния `Unit`. Иначе правка площади в справочнике задним числом меняла бы результат уже завершённого голосования — то есть результат можно было бы переписать, не трогая ни одного бюллетеня.

### `Ballot` — бюллетень

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `vote_id` | uuid | FK → `Vote` |
| `unit_id` | uuid | FK → `Unit` |
| `user_id` | uuid | Кто подал |
| `weight` | numeric(10,6) | Доля площади из снимка. **Считается сервером** |
| `signature_id` | uuid | FK → `Signature` |
| `cast_at` | timestamptz | |
| `ip` / `user_agent` | text | Для расследования спорных случаев |

Уникальность: `(vote_id, unit_id)` — одно помещение, один бюллетень.

Таблица **append-only**: у приложения нет прав `UPDATE` и `DELETE`. Исправление возможно только новой записью с указанием причины и отметкой предыдущей как аннулированной — через отдельную привилегированную процедуру с записью в аудит.

### `BallotAnswer`, `VoteQuestion`, `VoteOption`

`VoteQuestion` — `vote_id`, `order`, `text`, `type` (`SINGLE_CHOICE` \| `MULTI_CHOICE` \| `YES_NO`).
`VoteOption` — `question_id`, `order`, `text`.
`BallotAnswer` — `ballot_id`, `question_id`, `option_id`.

После первого поданного бюллетеня вопросы и варианты неизменяемы — проверяется на уровне сервиса.

### `Signature` — подпись ЭЦП

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `provider` | enum | `SIGEX` |
| `external_id` | text | ID процедуры у провайдера |
| `purpose` | enum | `IDENTITY_VERIFICATION` \| `BALLOT` \| `PROTOCOL` \| `REPORT` |
| `document_hash` | bytea | SHA-256 подписанного документа |
| `signature_data` | bytea | CMS/CAdES |
| `signer_iin_hash` | bytea | ИИН подписанта, хеш |
| `signer_full_name` | text | Из сертификата |
| `cert_serial` | text | |
| `cert_valid_from` / `cert_valid_to` | timestamptz | |
| `verified_at` | timestamptz | Когда сервер проверил подпись |
| `verification_result` | jsonb | |

Подпись всегда проверяется **на сервере**. Утверждению клиента «подпись валидна» не доверяем ни при каких условиях.

### `Protocol`

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `vote_id` | uuid | FK → `Vote` |
| `number` | text | Номер протокола |
| `content` | jsonb | Структурированное содержание |
| `pdf_file_id` | uuid | Сгенерированный PDF |
| `signed_file_id` | uuid | Подписанный документ |
| `chairman_signature_id` | uuid | FK → `Signature` |
| `secretary_signature_id` | uuid | FK → `Signature` |
| `status` | enum | `DRAFT` \| `AWAITING_SIGNATURES` \| `SIGNED` \| `PUBLISHED` |
| `quorum_reached` | boolean | |
| `quorum_percent` | numeric(5,2) | |
| `results` | jsonb | Итоги по каждому вопросу |
| `retention_until` | date | `+5 лет` — требование закона |

---

## 8. Финансы

Подробная логика — в [10-finance-payments.md](10-finance-payments.md).

### `BudgetCategory` — план счетов

| Поле | Тип | Описание |
|---|---|---|
| `code` | varchar(10) | PK. Код строки официальной формы: `5.1`, `6.1.2`, `6.2.1` |
| `parent_code` | varchar(10) | Иерархия |
| `section` | enum | `INCOME` \| `EXPENSE` \| `BALANCE` |
| `name_ru` / `name_kk` | text | Формулировка из приказа |
| `is_leaf` | boolean | Можно ли проводить транзакции на этот код |
| `requires_contractor` | boolean | Для 6.2.1 — нужен субъект сервисной деятельности |
| `requires_assembly_decision` | boolean | Для капремонта (6.7) — только по решению собрания |
| `form_version` | text | Версия формы, к которой относится код |

**Справочник глобальный, а не по домам** — он задан государством. Дом не может придумать свою категорию: иначе отчёт не соберётся по форме.

Наполняется из сида, привязан к версии формы. Актуальная версия — Приказ №362 от 12.09.2025.

### `FinanceAccount` — счёт дома

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `type` | enum | `CURRENT` (текущий) \| `SAVINGS` (сберегательный на капремонт) |
| `bank_name` | text | Для строк 1 и 2 отчёта |
| `account_number_masked` | text | Показываем только последние 4 цифры |
| `opening_balance` | numeric(14,2) | |
| `current_balance` | numeric(14,2) | Пересчитывается по транзакциям |

Разделение счетов обязательно: накопления на капремонт по закону лежат на отдельном сберегательном счёте и тратятся только по решению собрания.

### `Transaction` — движение средств

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `account_id` | uuid | FK → `FinanceAccount` |
| `category_code` | varchar(10) | FK → `BudgetCategory`. **Обязателен** |
| `direction` | enum | `IN` \| `OUT` |
| `amount` | numeric(14,2) | Всегда положительное; знак задаёт `direction` |
| `occurred_on` | date | Дата операции |
| `period` | varchar(7) | `YYYY-MM`, к какому отчётному периоду относится |
| `description` | text | Название платежа — требование «добавление категории и названия платежа» |
| `contractor_id` | uuid | FK → `Contractor` |
| `receipt_id` | uuid | FK → `Receipt` |
| `attachment_file_ids` | uuid[] | Акты выполненных работ, договоры, дефектные акты |
| `payment_id` | uuid | FK → `Payment`, если это поступление от жильца |
| `status` | enum | `DRAFT` \| `CONFIRMED` \| `VOIDED` |
| `idempotency_key` | text | Уникален. Защита от двойного проведения |
| `created_by` / `confirmed_by` | uuid | |
| `voided_reason` | text | |

Транзакции **не удаляются**. Ошибочная запись переводится в `VOIDED` с указанием причины, история сохраняется. Отчёт, который меняется задним числом без следа, обесценивает всю заявленную прозрачность.

### `Charge` — начисление жильцу

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `unit_id` | uuid | FK → `Unit` |
| `period` | varchar(7) | `YYYY-MM` |
| `type` | enum | `MAINTENANCE` (взнос на содержание) \| `CAPITAL_REPAIR` \| `PARKING` \| `TARGETED` (целевой) \| `OTHER` |
| `title` | text | |
| `amount` | numeric(12,2) | |
| `calculation_basis` | jsonb | Как посчитано: тариф × площадь или фиксировано |
| `due_date` | date | |
| `status` | enum | `PENDING` \| `PARTIALLY_PAID` \| `PAID` \| `OVERDUE` \| `CANCELLED` |
| `paid_amount` | numeric(12,2) | |

Уникальность: `(unit_id, period, type)`.

### `Payment` — оплата жильцом

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `charge_id` | uuid | FK → `Charge` |
| `unit_id` | uuid | FK → `Unit` |
| `paid_by` | uuid | FK → `User` |
| `amount` | numeric(12,2) | |
| `paid_at` | timestamptz | |
| `method` | enum | `KASPI_LINK` \| `RECEIPT_UPLOAD` \| `KASPI_API` \| `CASH` \| `BANK_TRANSFER` |
| `receipt_id` | uuid | FK → `Receipt` |
| `external_ref` | text | Номер транзакции из чека или от Kaspi. **Уникален** |
| `status` | enum | `PENDING_REVIEW` \| `CONFIRMED` \| `REJECTED` \| `FLAGGED` |
| `flags` | jsonb | Что насторожило: сумма не сходится, чек уже загружался |
| `confirmed_by` / `confirmed_at` | uuid / timestamptz | |
| `rejection_reason` | text | |

`external_ref` под уникальным ограничением — это защита от повторной подачи одного чека под разные начисления.

### `Receipt` — чек

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `file_id` | uuid | FK → `File` |
| `uploaded_by` | uuid | |
| `purpose` | enum | `EXPENSE` (расход ОСИ) \| `RESIDENT_PAYMENT` |
| `ocr_status` | enum | `PENDING` \| `DONE` \| `FAILED` \| `MANUAL` |
| `ocr_raw` | text | Распознанный текст |
| `ocr_parsed` | jsonb | `{amount, date, merchant, ref, payer}` |
| `ocr_confidence` | numeric(3,2) | |
| `content_hash` | bytea | SHA-256 файла — точный дубликат |
| `perceptual_hash` | bytea | Перцептивный хеш — пересохранённый дубликат |
| `manual_override` | jsonb | Правки человека поверх распознанного |

Два хеша нужны потому, что защищают от разных вещей: `content_hash` ловит тот же файл, `perceptual_hash` — тот же чек, пересохранённый или переснятый.

---

## 9. Персонал и подрядчики

### `StaffMember`

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `user_id` | uuid | FK → `User`, если есть вход в систему |
| `full_name` | text | |
| `position` | text | «Сантехник», «Консьерж 2 подъезда» |
| `specializations` | enum[] | |
| `phone_public` | varchar(16) | Телефон, показываемый жильцам |
| `photo_file_id` | uuid | |
| `work_schedule` | text | |
| `visible_to_residents` | boolean | Требование прозрачности: жильцы видят, кто работает в доме |
| `employment_type` | enum | `STAFF` \| `CONTRACTOR` |
| `is_active` | boolean | |

### `Contractor`

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `name` | text | |
| `bin` | varchar(12) | |
| `specializations` | enum[] | |
| `contact_person` / `phone` / `email` | text | |
| `contract_file_ids` | uuid[] | |
| `contract_from` / `contract_to` | date | |
| `visible_to_residents` | boolean | |
| `is_active` | boolean | |

Подрядчик — субъект сервисной деятельности из строки 6.2.1 отчёта. Его наименование попадает в отчёт, поэтому справочник нужен, даже пока подрядчики не входят в систему.

### `CommercialProposal` и `ProposalComparison`

`CommercialProposal` — `house_id`, `comparison_id`, `contractor_name`, `file_id`, `parsed` (jsonb: цена, срок, объём работ, гарантия, условия оплаты), `parse_status`.

`ProposalComparison` — `house_id`, `title`, `subject` (что закупаем), `criteria` (jsonb), `ai_analysis` (jsonb: матрица сравнения и обоснование), `recommended_proposal_id`, `decided_proposal_id`, `decided_by`, `vote_id` (если выносилось на голосование).

Связь с голосованием намеренная: крупные расходы требуют решения собрания, и логичный путь — сравнить КП, затем вынести выбор на голосование.

---

## 10. Отчётность

### `ReportTemplate`

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `form_code` | text | `MONTHLY_CONDOMINIUM` \| `ANNUAL_CONDOMINIUM` |
| `version` | text | `order-362-2025` |
| `legal_source` | text | «Приказ №362 от 12.09.2025» |
| `effective_from` / `effective_to` | date | |
| `schema` | jsonb | Структура формы: разделы, строки, коды, формулы |
| `render_template` | text | Шаблон для PDF |

**Почему форма — это данные, а не код.** Приказ №20247 от 2020 года, утверждавший эти формы, был отменён 12.09.2025 и заменён Приказом №362. Такое произойдёт снова. Если структура отчёта зашита в код, каждая смена приказа означает релиз; если она в `schema` — это новая строка в таблице и переключение `effective_from`. Старые отчёты при этом остаются привязанными к своей версии формы и не «переписываются» задним числом.

### `Report`

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `template_id` | uuid | FK → `ReportTemplate` |
| `type` | enum | `MONTHLY` \| `ANNUAL` |
| `period` | varchar(7) | |
| `data` | jsonb | Заполненная форма: код строки → сумма |
| `generated_at` | timestamptz | |
| `pdf_file_id` / `signed_file_id` | uuid | |
| `chairman_signature_id` / `accountant_signature_id` | uuid | FK → `Signature` |
| `work_summary` | jsonb | Выполненные работы с фото из `TaskCompletion` |
| `status` | enum | `DRAFT` \| `REVIEW` \| `SIGNED` \| `PUBLISHED` |
| `published_at` | timestamptz | |
| `due_date` | date | 20 число следующего месяца |

Уникальность: `(house_id, type, period)`.

---

## 11. ИИ и вспомогательные сущности

### `AiJob` — каждый вызов модели

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | FK → `House` |
| `type` | enum | `REQUEST_TRIAGE`, `REQUEST_SUGGEST`, `RECEIPT_OCR`, `VOICE_EXTRACT`, `PROPOSAL_COMPARE`, `LEGAL_QA`, `WEEKLY_SUMMARY`, `PROTOCOL_DRAFT`, `REPORT_DRAFT` |
| `provider` / `model` | text | |
| `input_ref` | jsonb | Ссылка на сущность, а не сам текст |
| `redaction_map_id` | uuid | FK → `RedactionMap` |
| `output` | jsonb | Структурированный результат |
| `status` | enum | `QUEUED` \| `RUNNING` \| `DONE` \| `FAILED` \| `REJECTED` |
| `tokens_in` / `tokens_out` | int | Для лимитов |
| `latency_ms` | int | |
| `error` | text | |
| `human_decision` | enum | `ACCEPTED` \| `MODIFIED` \| `REJECTED` — что человек сделал с результатом |

`human_decision` — не бухгалтерия, а обратная связь: без неё невозможно понять, полезен ли триаж или председатель каждый раз переделывает за ИИ.

### `RedactionMap` — карта обезличивания

`id`, `ai_job_id`, `map_encrypted` (bytea, зашифрованное соответствие плейсхолдер → реальное значение), `created_at`, `expires_at`.

Карта нужна, чтобы восстановить имена в ответе модели. Хранится зашифрованной и удаляется через 30 дней — дольше она не нужна.

### `VoiceNote`

`id`, `house_id`, `author_id`, `audio_file_id`, `duration_sec`, `transcript`, `transcript_status`, `extracted_tasks` (jsonb), `status` (`UPLOADED` → `TRANSCRIBING` → `EXTRACTED` → `REVIEWED`).

### `LegalDocument` и `LegalChunk`

`LegalDocument` — `title`, `type` (`LAW` \| `RULES` \| `ORDER`), `source_url`, `version_date`, `is_current`.

`LegalChunk` — `document_id`, `article_number`, `article_title`, `content`, `embedding vector(768)`, `order`.

Разбиение по статьям, а не по абзацам: требование — «с цитатами статей», значит юридический помощник обязан возвращать точную ссылку на статью, а не приблизительный фрагмент.

### `WeeklySummary`

`id`, `house_id`, `week_start`, `week_end`, `content` (jsonb: что сделано, что решается, что требует внимания), `ai_job_id`, `published_at`.

---

## 12. Системные таблицы

### `File`

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | Для скоупа |
| `storage_key` | text | Случайный ключ в Object Storage |
| `original_name` | text | |
| `mime_type` | text | Определён по сигнатуре, а не по расширению |
| `size_bytes` | bigint | |
| `content_hash` | bytea | |
| `uploaded_by` | uuid | |
| `scan_status` | enum | `PENDING` \| `CLEAN` \| `INFECTED` |
| `exif_stripped` | boolean | |

Публичных URL не существует. Доступ — presigned URL с TTL 5 минут, выдаётся после проверки прав.

### `Notification`

`id`, `user_id`, `house_id`, `type`, `title`, `body`, `payload` (jsonb с deeplink), `channels` (enum[]: `PUSH`, `SMS`, `EMAIL`, `IN_APP`), `sent_at`, `read_at`, `priority`.

### `AuditLog`

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | PK |
| `house_id` | uuid | |
| `actor_id` | uuid | Кто. `null` для системных действий |
| `actor_role` | enum | Роль на момент действия |
| `action` | text | `transaction.confirm`, `vote.close`, `membership.revoke` |
| `entity_type` / `entity_id` | text / uuid | |
| `before` / `after` | jsonb | Состояние до и после, с вырезанными ПДн |
| `ip` / `user_agent` | text | |
| `created_at` | timestamptz | |
| `prev_hash` | bytea | Хеш предыдущей записи |
| `hash` | bytea | SHA-256 от содержимого + `prev_hash` |

**Append-only.** У пользователя БД, под которым работает приложение, есть только `INSERT`. Хеш-цепочка делает незаметную правку истории невозможной: изменение любой записи ломает все последующие хеши. Это стоит почти ничего, а заявленная прозрачность держится именно на этом журнале.

### `IdempotencyKey`

`key` (PK), `user_id`, `endpoint`, `request_hash`, `response` (jsonb), `created_at`, `expires_at`.

Защита от двойного проведения при повторной отправке запроса — актуально для создания транзакций и подтверждения оплат.

---

## 13. Ключевые индексы

| Таблица | Индекс | Зачем |
|---|---|---|
| `Request` | `(house_id, status, priority DESC, created_at DESC)` | Главный экран председателя: срочные вверху |
| `Request` | `(house_id, location_type, location_entrance, location_floor)` | Поиск дубликатов по месту |
| `Task` | `(assignee_id, status, due_at)` | Главный экран работника |
| `Transaction` | `(house_id, period, category_code)` | Сборка отчёта |
| `Charge` | `(house_id, period, status)` | Выявление должников |
| `Charge` | `(unit_id, period, type)` UNIQUE | Защита от двойного начисления |
| `Ballot` | `(vote_id, unit_id)` UNIQUE | Один бюллетень на помещение |
| `Payment` | `(external_ref)` UNIQUE WHERE NOT NULL | Защита от повторной подачи чека |
| `Receipt` | `(house_id, content_hash)` | Поиск дубликатов чеков |
| `AuditLog` | `(house_id, created_at DESC)`, `(entity_type, entity_id)` | Просмотр истории объекта |
| `LegalChunk` | HNSW по `embedding` | Векторный поиск для юрпомощника |
| `HouseMembership` | `(user_id, house_id)` UNIQUE WHERE `status='ACTIVE'` | Одна активная роль в доме |
