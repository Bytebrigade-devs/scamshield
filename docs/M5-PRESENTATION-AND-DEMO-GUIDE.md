# IS2901 Interim Presentation & Live Demonstration Guide
## Module 5: Admin Dashboard, Analytics and Operations

- **Presenter:** Vishmi Himaya (@Vish-Himaya)
- **Student Registration / Index:** 245027T
- **Group:** Byte Brigade
- **Project:** ScamShield
- **Evaluation Format:** 20 Minutes Presentation & Live Demonstration + 10 Minutes Q&A

---

## 1. Slide Deck Structure & Content (Individual Contribution Focus)

### Slide 1: Title & Group Overview
* **Title:** ScamShield — Integrated Digital Safety Platform
* **Subtitle:** Module 5: Admin Dashboard, Analytics & Operations
* **Presenter:** Vishmi Himaya (Index: 245027T)
* **Team:** Byte Brigade · Faculty of IT, University of Moratuwa

### Slide 2: Problem & Operational Challenges
* **The Blind SaaS Problem:** A security and scam detection platform cannot function safely without back-office observability into subscriber churn, conversion leaks, and AI scan traffic.
* **The Privacy Paradox:** How do you give administrators operational control while enforcing strict zero raw-content access to vault records and private message bodies?
* **Accountability Need:** Administrative actions (account suspensions, role assignments) carry high operational impact; every action requires a persistent audit trail.

### Slide 3: Module 5 Aim and Objectives
* **Aim:** To develop a secure, privacy-preserving administrative back-office and real-time business analytics engine for ScamShield.
* **Key Objectives:**
  1. Build a protected admin portal (`/admin`) implementing role-restricted access.
  2. Implement business & growth telemetry (Mock MRR, conversion funnels, retention cohorts, CSV export).
  3. Visualize AI scam threat trends using standardized canonical taxonomy metadata (`X-13`).
  4. Provide operational tools: user search, account moderation with mandatory audit justifications, and support ticket management.
  5. Build the administrative view for Module 6 (Digital Safety Score) aggregation.

### Slide 4: System Architecture & Privacy Boundaries
* **Architecture Diagram:** Next.js App Router, Supabase PostgreSQL, Recharts, and Tailwind CSS.
* **The Non-Negotiable Privacy Boundaries:**
  * *Boundary 1:* Admins never view stored passwords, secure notes, or encryption keys. Module 3 holds credentials under server-side AES-256-GCM custody; only item counts reach the dashboard.
  * *Boundary 2:* Raw message texts, phone numbers, or email bodies are blocked from admin views; only categorical metadata tags travel to analytics.
  * *Boundary 3:* All payments and cards are simulated synthetic entities.

### Slide 5: Analysis & Design (SRS & UML)
* **Use Case Diagram:** Highlight 2 actor roles (*Super Admin*, *Support Admin*).
* **Activity Diagram:** Walk through the Account Suspension workflow: Search User $\to$ Verify RBAC $\to$ Input Audit Reason $\to$ Status Updated $\to$ Audit Log Created.
* **Sequence Diagram:** Demonstrate how the analytics pipeline queries sanitized metadata while preserving credential privacy boundaries.

### Slide 6: Individual Contribution (Vishmi Himaya — 245027T)
* **Lead Owner — Module 5 (Admin Dashboard, Analytics & Operations):**
  * Built all core routes: `/admin`, `/admin/users`, `/admin/analytics`, `/admin/support-inbox`, `/admin/audit-log`, `/admin/safety-scores`, `/admin/monitoring`, `/admin/roles`.
  * Implemented CSV data export engine (`M5-07`).
  * Implemented RBAC simulation and audit logging (`M5-11`).
* **Contributor — Module 6 (Digital Safety Score Slice):**
  * Built the Admin Cohort Safety Score Overview (`M6-05`); overall coordinator role is held by Suraji (@SurajiSaundarya).
* **Synthetic Evaluation Dataset (`M5-15`):**
  * Developed the synthetic dataset with realistic historical timelines, subscription events, and threat logs for evaluation and testing.

### Slide 7: Technologies Used
* **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Lucide Icons, pnpm.
* **Data Visualization:** Recharts (responsive line charts, bar charts).
* **Backend & Database:** Supabase (PostgreSQL, Row-Level Security policies, UUIDs).

### Slide 8: Further Work & Final Milestones
* Connect live Supabase real-time websocket subscriptions for instantaneous fraud alerts.
* Complete the joint calibration of Module 6 safety score weights once M4 scam protective signal validation concludes.
* Implement automated anomaly detection triggers (e.g. sudden spike in suspicious check bursts).

---

## 2. Step-by-Step 20-Minute Live Demonstration Script

### Step 1: Open the Admin Overview (`/admin`)
* **What to Show:** The clean, light-mode dashboard.
* **What to Say:** *"Here is the ScamShield Control Room. At a glance, we monitor 120 signups, 40 active Guardian subscribers generating LKR 39,600 in mock MRR, and 900 scam checks processed. Notice our Product Health card flags 3 provider failures, open support requests, and 2 suspended accounts."*

### Step 2: Demonstrate Role-Based Access Control (RBAC Simulator)
* **What to Show:** In the left sidebar, switch the **Role Simulator** from `Super admin` to `Support admin`.
* **What to Say:** *"Security is enforced at the role level. When I switch to Support admin, revenue is hidden and destructive suspension actions are blocked per FR-M5-10."*

### Step 3: User Management & Account Suspension (`/admin/users`)
* **What to Show:**
  1. Show that when in `Support admin` role, the Suspend button is disabled with a notice: *"Role limit: Support role cannot suspend accounts."*
  2. Switch role back to `Super admin` in the sidebar.
  3. Click `Suspend` on an active user $\to$ enter reason: *"Excessive automated rate-limit abuse."*
  4. Click Confirm $\to$ show the status turns red (`Suspended`).
* **What to Say:** *"Notice the privacy banner: As administrators, we can inspect account health and billing status, but vault credentials and submitted scam messages are completely decoupled and inaccessible."*

### Step 4: Verify the Audit Trail (`/admin/audit-log`)
* **What to Show:** Navigate to `Audit log`.
* **What to Say:** *"Every sensitive administrative action is automatically logged. Here is our suspension action just executed, stamped with the administrator name, timestamp, reason, and status."*

### Step 5: Growth Analytics & CSV Export (`/admin/analytics`)
* **What to Show:**
  1. Highlight the Funnel Drop-off chart (1,000 visits $\to$ 120 signups $\to$ 40 active subscribers).
  2. Show the Signup Cohort retention table.
  3. Click **"Export CSV"** $\to$ the browser immediately downloads the report.

### Step 6: AI Threat Intelligence (`/admin/scams`)
* **What to Show:** Category distribution table and volume trend.
* **What to Say:** *"Here we observe threat vectors classified by Module 4 under the canonical X-13 contract: phishing, romance scam, fake invoice, prize lottery scam. Raw message texts never touch this screen—only standardized taxonomy codes."*

### Step 7: Digital Safety Score View (`/admin/safety-scores`)
* **What to Show:** The 3-pillar breakdown and user cohort scores.
* **What to Say:** *"Here is the administrative Safety Score monitoring view. The algorithm is awaiting final formula consensus under coordinator Suraji. Notice that paying for an Aegis plan does NOT inflate a user's safety score; security is calculated strictly from posture."*

---

## 3. High-Probability Evaluator Q&A Preparation

**Q1: How do you guarantee administrators cannot read users' stored passwords or private messages?**
* **Answer:** *"By design and architecture. Module 3 manages passwords under server-side AES-256-GCM custody; Module 5 receives only count metadata (e.g. `vault_items_count`). Similarly, Module 4 processes scam messages in an isolated server-side pipeline and stores only sanitized canonical taxonomy codes under X-13, never the raw submitted text."*

**Q2: How is Monthly Recurring Revenue (MRR) calculated if payments are mocked?**
* **Answer:** *"Following team specification, we have 3 mock plans: Sentinel (LKR 490), Guardian (LKR 990), and Aegis (LKR 1,990). Module 5 aggregates active subscribers multiplied by their tier price. We simulate realistic subscription lifecycles to demonstrate genuine SaaS billing analytics without touching real credit cards."*

**Q3: How does your audit log work in the database?**
* **Answer:** *"In our PostgreSQL schema (`docs/m5-schema.sql`), the `audit_logs` table has Row-Level Security policies that explicitly disallow `UPDATE` and `DELETE` queries. It is an append-only ledger where every administrative operation is permanently recorded with timestamp, actor, and IP address."*

**Q4: What is your exact role in Module 6 (Digital Safety Score)?**
* **Answer:** *"Module 6 is shared across team members, with Suraji acting as coordinator. My contribution as Module 5 owner is to design and build the administrative safety score aggregation dashboard (`/admin/safety-scores`) to monitor user risk cohorts and enforce the non-inflation rule."*
