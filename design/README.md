# Ortaq: Design Documentation

Ortaq is a platform for running apartment-building associations (OSI) in Kazakhstan.

## Design Overview

The mockups are a clickable working prototype, not static images.

- **Process:**
  1. Research the roles and scenarios.
  2. Write the design brief ([DESIGN-BRIEF.md].
  3. Build the prototype in code.
  4. Review in the browser and export PNGs with headless Chrome.
- **Principles:**
  - depth comes from surface layers, not shadows or borders;
  - one accent per screen;
  - 44 px minimum tap targets;
  - motion respects reduced-motion settings.
- **UX artifacts:** personas, customer journeys, a sitemap and user flows (`ux.png`), plus a screen board (`board.png`, `screens/`).

## Project Scope and Requirements

| Role | Surface | Features |
|---|---|---|
| Chairman | Web | Requests, tasks, legal votes, finances, monthly report, residents registry, AI legal assistant |
| Chairman | Mobile | Assign tasks, voice delegation, announcements |
| Worker | Mobile | Daily tasks, photo completion, offline queue |
| Resident | Mobile | Report issues, track progress, vote, pay dues, view house budget |

| Stakeholder need | Design answer |
|---|---|
| Requests get lost in WhatsApp | One queue, critical requests first, three taps to assign |
| Reports are due by the 20th | Draft builds itself; missing documents flagged before signing |
| Votes must be legally valid | Wizard enforces thresholds and deadlines; eGov signature |
| Residents distrust spending | Budget drills down to each receipt |
| No signal in basements | Completions queue offline and sync later |

## Technical Specifications

- **Prototype:**
  - React 19
  - TypeScript
  - Vite
  - Tailwind CSS v4
  - Motion
  - Lucide icons
  - Manrope and Onest fonts
- **Planned production stack:**
  - NestJS as a modular monolith (REST and WebSocket)
  - PostgreSQL with pgvector
  - Redis with BullMQ background workers
  - Object storage
  - React Native (Expo) for mobile
  - Hosting on Servercore in Kazakhstan (`kz1`)
- **Integrations:**
  - SIGEX for eGov digital signatures
  - Kaspi for payments
  - Gemini for AI, receiving only anonymised data
  - SMS and push notifications

