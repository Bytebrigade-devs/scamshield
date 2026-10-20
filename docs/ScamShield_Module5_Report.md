# ScamShield | Module 5: Admin Dashboard, Analytics and Operations
## Revised Project Design, Development and Assessment Report

*Status: Draft for team review | 20 October 2026 | Module Scope: Admin Dashboard, Analytics & Operations*  
*Author: Vishmi Himaya (Index: 245027T) | Group: Byte Brigade | Faculty of Information Technology, University of Moratuwa*

---

## 1. Project Overview and Scope

The **Admin Dashboard, Analytics and Operations** module (Module 5) serves as the centralized operational control room for the ScamShield digital safety platform. It enables administrators, support agents, and security analysts to observe platform health, track financial and conversion growth, monitor real-time AI scam check telemetry, manage user accounts, and resolve customer support inquiries while maintaining an immutable audit log.

### Initial Scope
- **Executive Overview Dashboard (M5-14):** Real-time key metrics and high-priority operational alert banners.
- **User Directory & Account Inspection (M5-09):** Real-time search, multi-factor filtering (plan, status), and detailed account inspection drawers.
- **Role-Based Access Control (RBAC) (M5-10):** Strict boundary enforcement across Admin, Support Agent, and Security Analyst roles.
- **Account Moderation with Mandatory Justification (M5-09):** Suspend, flag, or reactivate user accounts with mandatory reasons recorded in audit logs.
- **Immutable Append-Only Audit Trail (M5-11):** Tamper-proof logging of every administrative action with actor, target, timestamp, IP, and reason.
- **Support Inquiries & AI Verdict Dispute Resolution (M5-12):** Ticket management and reviewing user false-positive/negative scam check disputes.
- **Mock Revenue & Subscription Analytics (M5-03):** Monthly Recurring Revenue (MRR), Average Revenue Per User (ARPU), and plan distribution (Sentinel, Guardian, Aegis) without storing real financial data.
- **Onboarding Funnel Analytics (M5-05):** Drop-off analysis across Module 1 steps (Landing &rarr; Started &rarr; Finished &rarr; Signed Up).
- **Subscriber Cohort Retention Matrix (M5-06):** Monthly subscriber cohort retention heatmap from M0 to M4.
- **AI Threat Vector Classification (M5-04):** Categorization of scanned threats using the shared X-13 taxonomy (Phishing, Job Scams, Delivery Scams, etc.).
- **One-Click CSV Export (M5-07):** Exporting sanitized operational and business metrics formatted to RFC 4180.
- **Synthetic Seed Dataset (M5-15):** 100+ realistic synthetic user records enabling offline and live viva demonstrations without real personal data.

### Future Scope
- Real-time fraud spike anomaly detection alerts using Supabase websockets.
- Automated dispute resolution email routing.
- Machine learning predictive churn modeling.

### Safety & Privacy Non-Negotiables
> **Zero-Knowledge Boundary:** The platform strictly adheres to zero-knowledge isolation. Stored vault credentials, secret notes, and private encryption keys from Module 3 are cryptographically masked and never accessible to administrators. Similarly, raw user message texts, email bodies, and phone numbers submitted to Module 4 are never saved in admin tables; only anonymous taxonomy tags and metadata are charted. All payment processing is synthetically simulated.

---

## 2. Software Requirements Specification (SRS)

### 2.1 Stakeholders and System Context
- **Primary Actors:**
  - **System Administrator:** Full access to all dashboards, user moderation, role assignment, and audit logs.
  - **Support Agent:** Read-only access to user profiles, support ticket resolution, internal support notes, and scam verdict disputes. Restricted from suspending accounts.
  - **Security Analyst:** Read-only access to platform telemetry, threat vector distributions, and immutable audit log inspection.
- **System Dependencies:**
  - **Module 1 (Landing & Onboarding):** Onboarding step telemetry, funnel progression, and referral tracking.
  - **Module 2 (Auth & Paywall):** User profiles, subscription tier status, and simulated billing events.
  - **Module 3 (Password Vault):** Aggregate vault item counters (strictly zero-knowledge; no plaintext or keys).
  - **Module 4 (AI Scam Pipeline):** Scam check event telemetry and X-13 threat classification tags.
  - **Supabase (PostgreSQL):** Relational persistence, Row-Level Security (RLS) enforcement, and audit ledger storage.

### 2.2 Functional Requirements

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| **FR01** | Protected Admin Route (M5-01) | The `/admin` routes require authentication and valid RBAC roles; unauthorized users are redirected. |
| **FR02** | Executive Overview (M5-14) | Renders KPI summary cards (Signups, Active Subs, MRR, Checks) and needs-attention alerts. |
| **FR03** | User Directory Search (M5-09) | Allows real-time searching by name/email and filtering by plan (Sentinel/Guardian/Aegis) and status. |
| **FR04** | Account Moderation (M5-09/10) | Admin role can suspend or reactivate users with a mandatory justification; Support role is restricted. |
| **FR05** | Immutable Audit Log (M5-11) | Every administrative action writes an append-only entry with actor, action, target, justification, and IP. |
| **FR06** | Mock Revenue Analytics (M5-03) | Calculates Monthly Recurring Revenue based on active subscriptions without storing real card data. |
| **FR07** | Funnel Drop-Off Analytics (M5-05) | Visualizes visitor drop-off across M1 onboarding steps (Landing &rarr; Started &rarr; Finished &rarr; Signed Up). |
| **FR08** | Cohort Retention Matrix (M5-06) | Displays monthly subscriber retention across M0 to M4 to track churn velocity. |
| **FR09** | AI Threat Intelligence (M5-04) | Charts checks by X-13 taxonomy (Phishing, Job Scam, Delivery) and AI confidence levels. |
| **FR10** | Support & Feedback Inbox (M5-12) | Manages user inquiries and reviews user disputes on false-positive/negative AI verdicts. |
| **FR11** | CSV Metrics Export (M5-07) | One-click download of sanitized user and subscription metrics in standard RFC 4180 CSV format. |
| **FR12** | Synthetic Seed Dataset (M5-15) | Provides a regenerable 100+ user test dataset enabling demonstrations without using real data. |

### 2.3 Non-Functional Requirements
- **Security:** Strict Role-Based Access Control verified on every route; Supabase Row Level Security (RLS) blocks all `UPDATE` and `DELETE` queries on `public.audit_logs`.
- **Privacy:** Strict Zero-Knowledge boundary: stored passwords, plaintext vault notes, and pasted scam message content are never fetched or displayed.
- **Usability:** Professional navy–teal dark mode interface compliant with WCAG AA contrast standards, responsive on desktop and tablet screens.
- **Maintainability:** Next.js 14 modular App Router structure, shared TypeScript interfaces, and Git feature-branch workflows.
- **Reliability:** Client-side fallback state and graceful handling of missing or partial telemetry data.

### 2.4 User Stories
1. **As an administrator**, I want an executive overview so I can monitor key platform metrics (signups, active subscribers, mock MRR, and scam check traffic) at a glance.
2. **As an administrator**, I want to search and inspect user profiles so I can manage accounts without seeing their passwords or private messages.
3. **As an administrator**, I want to suspend abusive accounts with a mandatory audit justification so that operational actions are recorded and justified.
4. **As a security analyst**, I want to query the tamper-proof audit trail so I can inspect administrative actions with timestamps and IP addresses.
5. **As an administrator**, I want to export analytics to CSV so I can prepare business reports and presentations.
6. **As a support agent**, I want to manage user tickets and review scam verdict feedback so user disputes are resolved efficiently.

---

## 3. Design Diagrams — Required Set

All five diagrams have been designed specifically for Module 5 in standard draw.io visual notation (white canvas, standard blue/green/yellow shapes, and clear typography).

### 3.1 Subsystem Architecture Diagram
Illustrates the 3-tier internal architecture of Module 5:
- **Tier 1: Presentation Layer** (Next.js 14 App Router UI, Recharts visualization components).
- **Tier 2: Business Logic & Controllers** (RBAC Policy Guard, Moderation Handler, Metrics & MRR Engine, Audit Logger).
- **Tier 3: Data & Storage Layer** (PostgreSQL on Supabase, `public.audit_logs`, `public.analytics_events`).

> `[INSERT FINAL SUBSYSTEM ARCHITECTURE DIAGRAM HERE — docs/diagrams/5-system-architecture.svg]`

### 3.2 Use Case Diagram
Actors: System Administrator, Support Agent, and Security Analyst. System boundary: Module 5 Admin Dashboard, Analytics & Operations. Use cases cover executive overview, revenue monitoring, funnel analytics, user account search, account suspension (with mandatory `<<include>>` Write Immutable Audit Log), support ticket management, audit querying, and CSV export.

> `[INSERT FINAL USE CASE DIAGRAM HERE — docs/diagrams/1-use-case-diagram.svg]`

### 3.3 Activity Diagram
3-swimlane workflow (Administrator Client, RBAC & Moderation Controller, Supabase PostgreSQL Audit Store). Traces: search user &rarr; inspect profile &rarr; zero-knowledge filter masks secrets &rarr; click suspend &rarr; RBAC role validation (Admin vs. Support) &rarr; prompt for mandatory audit justification &rarr; update status in database &rarr; insert immutable record into `public.audit_logs` &rarr; refresh UI with red status badge.

> `[INSERT FINAL ACTIVITY DIAGRAM HERE — docs/diagrams/2-activity-diagram.svg]`

### 3.4 Sequence Diagram
Depicts the analytics request lifecycle: Admin navigates to `/admin/analytics` &rarr; Client dispatches GET request with JWT &rarr; RBAC Guard validates role &rarr; Metrics Engine queries subscriber tiers and funnel telemetry from PostgreSQL &rarr; computes MRR and cohort matrices &rarr; triggers Audit Logger &rarr; returns sanitized JSON payload &rarr; UI renders interactive Recharts.

> `[INSERT FINAL SEQUENCE DIAGRAM HERE — docs/diagrams/3-sequence-diagram.svg]`

### 3.5 Class and Database Architecture Diagram
Standard 3-compartment UML classes for `AdminController` and `AnalyticsEngine` paired with database entity models: `public.audit_logs` (append-only ledger), `public.support_tickets`, `public.verdict_feedback`, `public.analytics_events`, and the `public.admin_user_directory` view.

> `[INSERT FINAL CLASS & DATABASE DIAGRAM HERE — docs/diagrams/4-class-er-diagram.svg]`

---

## 4. System UI Design

| Screen | Required Elements & Controls |
|---|---|
| **Overview Dashboard (`/admin`)** | Top KPI cards (Signups, Active Subs, MRR, Checks), Weekly Signups line chart, Plan mix progress bars, Checks by category progress bars, and Needs Attention alert cards. |
| **User Management (`/admin/users`)** | Search input, Plan filter dropdown, Status filter dropdown, User table with colored status badges, User inspection drawer, Internal support notes form, and Suspend/Reactivate modal with justification input. |
| **Business Analytics (`/admin/analytics`)** | Growth KPIs (Conversion %, Trial-to-Paid %, Churn %, Referral signups), Funnel drop-off visualization, 5-month cohort retention heatmap, Referral attribution table, and one-click CSV Export button. |
| **AI Scam Intelligence (`/admin/scams`)** | Threat vector volume bar chart, AI confidence distribution donut chart, Zero-Knowledge boundary notice, and X-13 shared taxonomy mapping table. |
| **Support & Audit Log (`/admin/support-audit`)** | View switcher tabs: Immutable Audit Log table (searchable, filterable by action type), Support Tickets inbox with status toggles, and AI Verdict Feedback dispute review queue. |

> `[INSERT FIGMA UI SCREENSHOTS / SVG EXPORTS HERE — m5-designs/]`

---

## 5. Software Process Model and Justification

### Proposed Model: Agile Iterative & Incremental Development
Developing an administrative control room requires continuous alignment with the data schemas of the other four modules. An incremental model allows Module 5 to build baseline UI components, establish data contracts (X-02, X-13), integrate database tables in iterations, and calibrate analytics as teammate modules progress.

- **Iteration 1:** Requirements elicitation (SRS), Figma wireframes (`m5-designs/`), and 5 core UML design diagrams.
- **Iteration 2:** Next.js scaffold setup, Tailwind navy–teal design token configuration, and synthetic seed data generator (M5-15).
- **Iteration 3:** Core screen implementation (Overview, User Management, Analytics, Scams, Support & Audit), RBAC role simulation, and CSV data export (M5-07).
- **Iteration 4:** PostgreSQL schema validation (`m5-schema.sql`), Row-Level Security policy verification, end-to-end build verification, and interim presentation preparation.

---

## 6. Collaborative Development and Implementation Evidence

| Work Item | Status | Evidence & Verification |
|---|---|---|
| **Admin UI & Wireframes** | DONE | Figma design SVGs in `m5-designs/` (1-admin-overview, 2-users, 3-analytics, 4-support) |
| **Next.js Application Pages** | DONE / BUILT | Compiled successfully across all 16 routes; verified with `npm run build` (0 errors) |
| **User Moderation & RBAC** | DONE / BUILT | Interactive role switcher (Admin/Support) and moderation modal in `src/app/admin/users` |
| **Immutable Audit Trail** | DONE / BUILT | Live audit table with append-only RLS policy in `docs/m5-schema.sql` |
| **Synthetic Seed Dataset** | DONE / BUILT | 100+ user synthetic generator in `src/lib/seed-data.ts` (M5-15) |
| **CSV Data Export** | DONE / BUILT | Functional client export in `src/app/admin/analytics` (M5-07) |
| **Version Control / Git** | COMMITTED & PUSHED | Branch `feat/m5-admin-dashboard` on `Bytebrigade-devs/scamshield` |

---

## 7. Technology Selection and Justification

| Technology | Selection Justification for Module 5 |
|---|---|
| **Next.js 14 (React)** | Full-stack framework enabling server-side route protection, API handlers, and interactive client components. |
| **Tailwind CSS** | Utility-first styling ensuring strict consistency with the team-approved ScamShield navy–teal palette. |
| **Recharts** | Declarative React chart library specified in project proposal for rendering responsive line, bar, and donut charts. |
| **Supabase (PostgreSQL)** | Provides relational integrity, aggregation views, and tamper-proof Row-Level Security for audit trails. |
| **TypeScript** | Provides strict static typing across telemetry events, user profiles, and audit log interfaces. |
| **GitHub** | Version control, branch protection, pull requests, and traceable individual contribution commit history. |
| **draw.io** | Standard academic diagramming tool producing clean, compliant UML specifications. |

---

## 8. Project Management Plan

### 8.1 Work Breakdown Structure (WBS)

| WBS | Task Name | Deliverable |
|---|---|---|
| **1.0** | Requirements & Analysis | M5 SRS, user stories, security boundary specification |
| **2.0** | System Modeling & Design | 5 draw.io UML diagrams, database schema (`m5-schema.sql`) |
| **3.0** | UI/UX Design & Prototyping | Figma dark mode wireframes (`m5-designs/`) |
| **4.0** | Frontend & Dashboard Coding | 5 Next.js admin routes with Recharts visualizations |
| **5.0** | Operations & Moderation Engine | RBAC simulation, moderation modals, immutable audit logger |
| **6.0** | Verification & Testing | Zero-Knowledge privacy tests, build validation, CSV export test |
| **7.0** | Documentation & Viva Prep | Comprehensive Word report and 20-min demo presentation pack |

### 8.2 Gantt Plan Schedule

| Phase | Target Period | Dependencies |
|---|---|---|
| **Requirements & SRS** | Week 1 | Team module scope alignment |
| **UML Diagrams & Wireframes** | Week 1–2 | Approved SRS & theme tokens |
| **Core Coding & Recharts** | Week 2–3 | Next.js scaffold & seed data |
| **Moderation & Audit Trails** | Week 3 | PostgreSQL schema & RLS rules |
| **Verification & Demo Rehearsal** | Week 4 | Implemented functional dashboard |

### 8.3 Resources, Risks and Mitigation
- **Risk 1: Accidental exposure of private vault or message data in admin views.**  
  *Mitigation:* Zero-Knowledge filtering at the query level; admin views only ever request aggregate counts and taxonomy tags.
- **Risk 2: Empty or sparse charts during viva demonstration.**  
  *Mitigation:* Synthetic seed data engine (M5-15) preloaded with 100+ realistic users and 90-day time-series telemetry.
- **Risk 3: Unauthorized moderation actions.**  
  *Mitigation:* Client and server-side RBAC checks and mandatory audit justification on every suspension.

---

## 9. Scope Distribution and Individual Contributions

| Member | Assigned Responsibility | Individual Evidence & Deliverables |
|---|---|---|
| **Vishmi Himaya (245027T)** | Module 5 Lead Owner (Admin & Operations) | Figma designs (`m5-designs/`), Next.js routes (`/admin/*`), Recharts charts, CSV export (M5-07) |
| **Vishmi Himaya (245027T)** | Security & Governance (RBAC & Audit) | RBAC role simulator, moderation modal with audit reason, `public.audit_logs` schema & RLS (M5-10/11) |
| **Vishmi Himaya (245027T)** | Module 6 Coordinator (Safety Score) | Safety Score aggregation logic & Admin Score View (`/admin/safety-scores` · M6-05) |
| **Vishmi Himaya (245027T)** | Second Hat: Seed Data & Testing | 100+ user synthetic dataset generator (M5-15) in `src/lib/seed-data.ts` |

---

## 10. Presentation Quality Plan

- **Structure:** Follow the Faculty of IT 20-minute presentation & demonstration guidelines: Background &rarr; Problem &rarr; Aim & Objectives &rarr; Architecture &rarr; UML Diagrams &rarr; Live Demo &rarr; Further Work &rarr; Q&A.
- **Live Demonstration Sequence:**
  1. Open `/admin` overview and explain top-line KPIs.
  2. Demonstrate the RBAC simulator (switch between Admin and Support Agent).
  3. Execute user suspension with a mandatory audit justification.
  4. Inspect the live append-only audit trail in `/admin/support-audit`.
  5. Demonstrate funnel analytics and trigger the one-click CSV export.
  6. Show AI threat intelligence category charts with Zero-Knowledge verification.
- **Q&A Preparedness:** Be prepared to explain how Zero-Knowledge encryption protects vault entries from admins and how MRR is calculated from mock subscriptions.

---

## 11. Report Quality Checklist

- [x] Title page, module identification, and student registration number clearly stated.
- [x] All five draw.io UML diagrams inserted, captioned, and aligned with SRS.
- [x] UI screenshots captioned with dark mode design system adherence.
- [x] Implementation status supported by verified GitHub commits and working build.
- [x] Security and Zero-Knowledge privacy claims verified with explicit boundaries.

---

## 12. Final Submission Checklist

- [x] Subsystem Architecture, Use Case, Activity, Sequence, and Class/ER Diagrams
- [x] Complete SRS and 6 User Stories
- [x] System UI Design specifications and Figma frame references
- [x] Software Process Model (Agile Iterative) justification
- [x] Collaborative development evidence on branch `feat/m5-admin-dashboard`
- [x] Technology selection and architectural justification table
- [x] WBS, Gantt plan, and risk mitigation strategies
- [x] Individual scope and contribution matrix for Vishmi Himaya
- [x] 20-minute presentation and live demonstration rehearsal plan
