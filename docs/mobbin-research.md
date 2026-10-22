# Mobbin research: patterns for Ortaq

Research date: 2026-10-15. Source: Mobbin (iOS + web), 18 searches covering flows, screens and web dashboards. This is reference material, not part of the spec: decisions live in files 00–15.

## Read this first

Mobbin has **no dedicated HOA / OSI / building-management apps** (no BuildingLink, AppFolio Resident and the like). Every pattern below comes from an adjacent category that solves the same sub-problem:

| Ortaq problem | Best-in-class analogue on Mobbin |
|---|---|
| Resident request tracking | Food delivery and order trackers (Bolt Food, sweetgreen, 7-Eleven, Hers) |
| Dues payment | Fintech and utilities (Apple Wallet, ANZ Plus, Octopus Energy) |
| Budget transparency, receipts | Shared expenses and bookkeeping (Splitwise, GoPay, Revolut Business, Starling) |
| Voting | Community polls (Glassdoor, Runna, GroupMe, Nextdoor) |
| Worker day | Field-service (Jobber) |
| AI suggestions | Planners and assistants (Structured, Me+, Gemini) |
| Chairperson web | Jobber web, Zillow Rentals, Zendesk, Monarch, YNAB |

Several references break the brief's hard rules (borders, shadows, emoji, uppercase with tracking). Borrow the **structure**, never the styling. See section 4, "Don't copy".

---

## 1. Killer features worth stealing

Ranked by impact on Ortaq's three core promises: transparency, requests that don't get lost, and a chairperson who isn't buried in routine work.

### 1.1 Request as a delivery order: stepper on the home card
The resident's active request sits at the top of the home screen as a card with a 4-step progress bar and an unread-message link. This is the strongest pattern for UX principle 1 ("what do I do in one second").

- [Hers home](https://mobbin.com/screens/e36b5e4e-8334-43c8-a1a4-4f71ea9f8043): "A provider is reviewing your request", with steps Requested → Reviewed → Shipped → Delivered and an "Unread message — View" row
- [Hims home](https://mobbin.com/screens/1fda61b6-f5ae-4921-b07e-9ca9aaddb864): the same card after approval, where the status headline changes
- [7-Eleven order status](https://mobbin.com/screens/2edc331f-158c-488d-893a-ff2ee5a920ae): stepper plus "Matthew is on the way", with Call / Message / Map buttons
- [Gopuff Live Activity](https://mobbin.com/screens/916669e9-f3bd-4cbc-86a6-5e342a2fa219): the stepper on the lock screen / Dynamic Island

**For Ortaq:** the "Моя заявка" card has the steps Принята → Назначена → В работе → Выполнена, and the worker's name and a call button appear at "В работе". For emergency requests (a burst pipe), use a Live Activity on the lock screen. That's push you can actually see, and it sets Ortaq apart from WhatsApp.

### 1.2 Every expense has a receipt, and AI prepares it
- [GoPay split bill](https://mobbin.com/screens/465e2773-660b-4a11-b7af-fb9747fef87e): a scanned receipt with a thumbnail and "Rescan", parsed into line items. The doubtful field is highlighted with a warning fill: "Make sure this amount is correct"
- [Starling attachment](https://mobbin.com/screens/2b9071e0-54cd-45a3-a56d-89828d9d81cd): "If you upload a receipt, we use AI to create a digital version", with photo / library / PDF options
- [Revolut Business expense](https://mobbin.com/screens/6e9c86d9-ff41-4202-9669-3856bc64d5b0): an "Info required" status, a Receipts → Upload row, a "No receipt" toggle, and accounting category per split
- [Splitwise add expense](https://mobbin.com/screens/80642174-05d9-4c9c-b05f-bf22778e8f5c): "Scan receipt" next to take / choose photo

**For Ortaq:** the GoPay pattern implements principle 4 ("AI prepares, a human decides") exactly. OCR fills the amount and category, and **only the uncertain fields** get the `warning` fill. The chairperson confirms. Revolut's "Info required" status for an expense without a receipt drives the "чеки в кармане" problem toward zero.

### 1.3 Earmarked collection with a progress bar
- [PayPal pool](https://mobbin.com/screens/9bf9dc38-7a52-4f4c-9445-5cf3e97af343): "Amount received / Goal", a progress bar and a deadline, with Share / Contribute
- [YNAB plan](https://mobbin.com/screens/15747c12-b670-42aa-81b9-d9b4d1998c5a): each bill has a fill bar, "Funded" or "$60 more needed by the 30th"

**For Ortaq:** a collection for a specific repair ("Замена лифта: собрано 1,2 из 3 млн ₸, до 1 декабря") plus a budget-versus-actual bar for each budget category. Residents see where the money goes before it's spent.

### 1.4 Dues: two states and a summary before payment
- [Apple Wallet autopay](https://mobbin.com/flows/f9571d52-cc73-41a9-901a-f00a9668e128): a "Payment Due 1 Apr / Pay Early" tile that becomes "Nothing to pay ✓" after payment. It's a calm state instead of an empty one
- [ANZ Plus "Ready to pay?"](https://mobbin.com/flows/58ae4fb9-9382-4ea8-a2c6-5bae06c192dc): recipient and amount on separate surfaces, plus a "Pay on / Recurs / Ends — Edit" summary strip and a "Schedule Payment" secondary action
- [Octopus Energy Bills](https://mobbin.com/screens/6fa88e1d-fd31-4c58-b789-8d9fe118f770): balance, monthly payment, day of month, then a Transactions / Bills segment with a "View" link for each period. Top right is a **property switcher** ("Property TW8 9QP")

**For Ortaq:** the payment card ("карточка взноса", the brief's single accent fill) has two states: "К оплате 12 400 ₸ до 25 октября" and "Оплачено". There's a recurring-payment strip and an apartment switcher for owners with more than one apartment.

### 1.5 Voting: deadline, count, results after the vote
- [Glassdoor poll](https://mobbin.com/flows/5f650ec8-e09a-42b4-a108-edb4bebea4cd): options turn into percentage bars after a tap, with the footer "389 votes · 4 days left"
- [Runna poll](https://mobbin.com/flows/54159559-cadc-47f6-b449-a300582062d6): results are hidden until you vote ("Vote to see the results"), and your choice is highlighted
- [GroupMe Polls](https://mobbin.com/flows/f92c4187-5430-446d-b1c7-eea8d69d48ab): Active / Completed tabs, with "Voting ends: 21/11/24, 7:15 PM" on the card
- [Nextdoor](https://mobbin.com/flows/5bff685e-bf8a-4f10-8f58-601cec9e82ce): a poll is one of the post types in the composer ("Poll your neighbors")

**For Ortaq:** take the Active / Completed split, the deadline on the card, and the reveal after the vote. **What Mobbin doesn't have:** a quorum indicator ("проголосовало 54% площади, нужно 50%+1"), vote weighting by apartment area, or a legally binding confirmation. That has to be designed from scratch (see `09-voting-legal.md`), and it's the main differentiator from a generic chat poll.

### 1.6 AI cards: Accept, Edit, Discard
- [Structured AI](https://mobbin.com/screens/ba8c306d-b55c-4b77-8103-13ef9d9378ce): a generated task card with **Add / Edit / Discard** buttons, plus "Accept All" and a "The AI may make mistakes…" note above
- [Me+](https://mobbin.com/screens/e3d6a34a-b9a7-40c2-bee2-04ae1790d8d9): "Add to my schedule / Help me edit it / Discard plan"
- [Gemini](https://mobbin.com/screens/319ea467-c382-4bb6-957f-ac3730f49097): a plan card with "Edit plan / Start research" before execution

**For Ortaq:** Structured is a ready-made template for the brief's AI cards: a voice note from the chairperson becomes 3 task cards, each with Принять / Изменить / Отклонить, plus "Принять все". This matches the `accent-50` background in principle 4.

### 1.7 Announcements targeted at people who haven't read them
- [Givingli announcement](https://mobbin.com/screens/c36a0a20-073a-411a-83f2-c020644fda45): "Send to:" with segment chips (Attending / Opened / **Unopened**)
- [Partiful message details](https://mobbin.com/screens/d1c49f04-df0e-4033-87ba-b34995e8bb9d): a sent message shows its recipients and responses

**For Ortaq:** after an "Отключение воды завтра" announcement, the chairperson sees "Прочитали 64 из 120" and can send a reminder to unread residents only. For an important notice, that replaces knocking on doors.

### 1.8 Quick create from a FAB (chairperson on mobile)
- [Jobber speed-dial](https://mobbin.com/flows/23b599ad-18e2-45aa-93de-710cfe134d3d): a "+" opens a menu with Request / Task / Expense / Invoice / Quote / Job / Client

**For Ortaq:** "+" opens Заявка / Поручение / Расход (камера чека) / Объявление / Голосование. That covers the 30-second-to-2-minute scenario from section 2 of the brief.

---

## 2. Flows by role

### Resident (mobile)

| Flow | Reference | What to take |
|---|---|---|
| Join a building | [Abode join by code](https://mobbin.com/flows/844af9dc-5327-4704-89f0-4d230768b828) | After the code is entered, a preview line ("You're about to join Crunchy Coven") appears before confirmation. For Ortaq: "Вы присоединяетесь: ЖК Асыл Арман, блок 3" |
| | [KOHO invite code](https://mobbin.com/flows/1cb66235-f725-48a1-ab2c-947933fc8b81) | A separate error screen, "Unable to accept invitation", with a single "Go back" |
| | [Buddy QR join](https://mobbin.com/flows/5270584e-3e25-4586-b4bb-d7dc91640815) | A QR code to join. For Ortaq: a poster in the lobby, so nobody types a code |
| Submit a request | [Bird report issue](https://mobbin.com/flows/4bb0fda2-0003-46b3-b0e0-9ab39d7a7721) | The camera first, with a "Snap a photo that shows the issue" hint, then a **chip choice** of what happened (no free text), then "Thanks for reporting". That's 3 steps, which fits principle 2 |
| | [Forest report damage](https://mobbin.com/flows/583931fc-466d-4805-a858-7b5d04b4882b) | After submit, a toast on the same screen ("We've received your damage report") instead of a separate screen |
| | [Etsy help request](https://mobbin.com/flows/7148d585-1005-4a53-869b-dd19da37ecd4) | A structured choice of problem and outcome, after which the request turns into a **chat thread** with a summary as the first message |
| Meter readings | [Octopus meter reading](https://mobbin.com/screens/6cbe2771-b61b-4a24-a1ac-111c6846b133) | Under each field is "Last billed reading 29482 · 05/02/2025", which guards against typos. There's also a "How do I read my meter?" link and a date chooser |
| | [Forest evidence camera](https://mobbin.com/screens/e35b52bd-5922-47df-9eb3-6e13ede253c0) | A framing overlay with a hint. Use it for meter photos with OCR |
| Pay dues | see 1.4 | |
| Vote | see 1.5 | |

### Chairperson (web)

| Screen | Reference | What to take |
|---|---|---|
| Request list | [Jobber Requests](https://mobbin.com/screens/a6fb2d6f-b990-48c4-91c0-9a4dac929ea4) | An Overview card with a status legend and counts (New / Overdue / Unscheduled), a "New requests, past 30 days ↑100%" metric, then a table with status pills, a Status chip filter and search |
| | [Zendesk dashboard](https://mobbin.com/screens/9a6a8c5d-5d9c-449c-a352-cd63bbe1d49d) | "Tickets requiring your attention (31)" goes first, and the stream of updates goes in a left column |
| Building / apartment page | [Zillow Rentals property](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd) | Tabs for Overview / Applications / Leases / Payments / Maintenance, plus a **"Next steps"** sidebar of recommended actions |
| Action log | [Bonsai activity](https://mobbin.com/screens/58dd96f4-3332-455b-90df-25205c9c9e99) | A timeline: "Joe Doe signed the contract · Feb 8, 6:52 PM". This is "каждое действие оставляет след" made literal |
| Finance report | [Monarch spending](https://mobbin.com/screens/535fbe4d-18fb-4935-9065-2417c513a70e) | A category chart, transactions underneath and a Summary side panel |
| | [YNAB breakdown](https://mobbin.com/screens/e391a769-690a-4fce-aec4-2f8cc882374d) | A donut beside a category list with bars and percentages |
| | [Rocket Money](https://mobbin.com/screens/0a6f64c2-d9f6-44c4-9c1a-6e491a03ca02) | A category table with change versus last month, plus a "Needs categorization: Update 42 transactions" block. For Ortaq: "12 расходов без чека" |
| | [Posh P&L](https://mobbin.com/screens/9d74ad25-145a-4a1a-b5bd-6407aaf77ddb) | A formal statement grouped as Revenue → categories → Total, Expenses → categories, then Net. This is the skeleton of the official report due by the 20th |
| | [Xero insights](https://mobbin.com/screens/83db4774-ef6b-48fd-ab1a-62a0104ef713) | AI prompt chips under the chart ("Explain the trends in my income and expenses") |
| Inviting residents | [Nextdoor invite neighbors](https://mobbin.com/flows/9656f8b2-d139-4902-a8ab-9bdc9538f506) | A list of building apartments ("57 W 58th St Apt 9H"), each with an "Invite" button that becomes "Invited". For Ortaq: an apartment register showing who has joined the app |
| Seasonal plan | [Angi home to-dos](https://mobbin.com/screens/c80853ab-e6a7-489e-999f-ac6bc0162e14) | A checklist by month ("January: Flush water heater") with an "Answer 3 questions to refine your list" refinement. For Ortaq: a building maintenance calendar (heating season preparation, meter verification) |
| Comparing commercial quotes | [Angi request quotes](https://mobbin.com/screens/79459363-9904-465d-9499-c4cd10d104a3), [Cleo plan compare](https://mobbin.com/screens/c330c3f7-92f0-4323-8260-19342d065716) | Vendor cards with ratings and "Request quotes from all", plus a comparison table with **one highlighted column**. For Ortaq: AI highlights its recommended quote, and the chairperson chooses |
| Signing the protocol | [Docusign agreements](https://mobbin.com/flows/22b0fde8-3002-4616-bd24-1380c38ab146) | Two counters, "Action Required" and "Waiting for Others", and a document list with statuses (Completed / Draft / Voided / Waiting) |
| | [Docusign signing](https://mobbin.com/flows/77ec56cf-b142-4bb5-9277-c6de0af8092a) | A step-by-step walk through signature fields with Next, then Finish |

### Worker (mobile)

| Flow | Reference | What to take |
|---|---|---|
| Today's tasks | [Jobber Today's appointments](https://mobbin.com/flows/679bedde-48f4-452c-a0e7-67c32ebad4d2) | A segmented control for Completed / **Active** / To Go, with a card showing time and address |
| Task card | [Jobber task](https://mobbin.com/flows/23b599ad-18e2-45aa-93de-710cfe134d3d) | One big primary "Complete Task" near the top, Instructions as a separate block, and Directions |
| Photo proof | [Forest evidence camera](https://mobbin.com/screens/e35b52bd-5922-47df-9eb3-6e13ede253c0) | A framing overlay with a hint. For Ortaq: "Сфотографируйте результат работы" |

Jobber doesn't show offline mode or before-and-after photos on Mobbin. Those have to be designed from scratch to meet principle 6.

---

## 3. Component patterns

| Pattern | Where it shows up | How to adapt to Ortaq's rules |
|---|---|---|
| Horizontal 4-step stepper | Hers, 7-Eleven, sweetgreen, Wonder | Filled steps in `brand-600`, empty ones in `surface-3`. No outlined circles |
| Vertical timeline with explanations | IKEA order, StubHub listing | Request history in the web view: each step with a time and an actor |
| Calm "all good" state | Apple Wallet "Nothing to pay" | Show a calm state in place of the dues card and request block |
| Hint under a field ("last value") | Octopus meter reading | All numeric inputs for meters and amounts |
| Inline warning on a doubtful field | GoPay "Make sure this amount is correct" | OCR results: `warning` background, no outline |
| Summary strip of 3 cells | ANZ "Pay on / Recurs / Ends" | Autopay, vote deadline, request deadline |
| Counter tiles for action and waiting | Docusign "Action Required / Waiting for Others" | Chairperson home: "Ждут решения" / "Ждут других" |
| Audience segment chips | Givingli "Send to" | Announcements, reminders to debtors |
| FAB speed-dial | Jobber, Docusign | Chairperson's mobile quick create |
| Context switcher in the header | Octopus "Property", Nextdoor neighborhood | Switching apartment or building |
| Activity feed | Bonsai, Outseta | Action log for the building and for each request |
| "Remind" button on a debt | [Chime pending](https://mobbin.com/screens/9b3cefde-7aec-41a0-916e-d9bc2a87c7ed) | A soft reminder about dues, with no public shaming |

---

## 4. Don't copy

These references break hard rules from section 4 of the brief and CLAUDE.md:

- **Uppercase with tracking:** Bird (chips "BRAKES", "THROTTLE"), Forest ("PROVIDE GOOD PARKING EVIDENCE"), Revolut Business section labels. Take the structure, write labels in normal case
- **Outlines as separators:** Jobber (bordered cards and inputs), Etsy, Glassdoor options. In Ortaq, separation comes from changing between `surface` and `surface-2`
- **Emoji in the interface:** YNAB category icons, Peanut, Runna. In Ortaq, icons come only from lucide
- **Shadows:** 7-Eleven, Gopuff Live Activity. Use tonal layers and glass on floating layers
- **Public debtor lists:** Revolut group ("Owes $3.38" in red next to a name) works between friends but will cause conflict in a building. Show a resident only their own debt. The chairperson sees the debtor list on the web, and residents see only the aggregate ("собрано 87% взносов")

---

## 5. Gaps Mobbin couldn't cover

These need to be designed without an analogue, and they make up Ortaq's real moat:

1. **Legally binding voting:** quorum by area, vote weight, a protocol with a digital signature, and a mixed online plus paper mode
2. **The official report due by the 20th:** an auto-built document from the same data residents see, with a "Сдать" button and a submission status
3. **Offline mode for workers:** a queue of photos and completions without a connection, with an "Отправится, когда появится сеть" indicator
4. **Two languages (Russian and Kazakh)** in the same layout, at 200% font size. Check text length in Kazakh
5. **Delegation inside the building:** owner versus tenant, with one apartment having several accounts and different permissions
