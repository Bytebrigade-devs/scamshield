# IS2901 Interim Presentation & Live Demonstration Guide
## Module 5: Admin Dashboard, Analytics and Operations & Module 6 Coordination

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
* **The Privacy Paradox:** How do you give administrators operational control without compromising the **Zero-Knowledge** architecture of the password vault and the private content of scanned messages?
* **Accountability Need:** Administrative actions (account suspensions, role assignments) carry high legal and operational risk; every action requires an immutable audit trail.

### Slide 3: Module 5 Aim and Objectives
* **Aim:** To develop a secure, privacy-preserving administrative back-office and real-time business analytics engine for ScamShield.
* **Key Objectives:**
  1. Build a protected, role-gated admin portal (`/admin`) implementing strict RBAC.
  2. Implement financial & growth telemetry (Mock MRR, conversion funnels, retention cohorts, CSV export).
  3. Visualize AI scam threat trends using standardized taxonomy metadata (`X-13`).
  4. Provide operational tools: user search, account moderation with mandatory audit justifications, and support ticket management.
  5. Coordinate Module 6 (Digital Safety Score) aggregation and build the administrative score view.

### Slide 4: System Architecture & Privacy Boundaries
* **Architecture Diagram:** Next.js App Router, Supabase PostgreSQL, Recharts, and Tailwind CSS.
* **The Non-Negotiable Privacy Boundaries:**
  * *Boundary 1:* Admins never view stored passwords, secure notes, or encryption keys.
  * *Boundary 2:* Raw message texts, phone numbers, or email bodies are blocked from admin views; only categorical metadata tags travel to analytics.
  * *Boundary 3:* All payments and cards are simulated synthetic entities.

### Slide 5: Analysis & Design (SRS & UML)
* **Use Case Diagram:** Highlight 3 actor roles (*Admin*, *Support*, *Security Analyst*).
* **Activity Diagram:** Walk through the Account Suspension workflow: Search User $\to$ Verify RBAC $\to$ Input Audit Reason $\to$ Status Updated $\to$ Immutable Audit Log Created.
* **Sequence Diagram:** Demonstrate how the analytics pipeline queries sanitized metadata while preserving zero-knowledge vault boundaries.

### Slide 6: Individual Contribution (Vishmi Himaya — 245027T)
* **Lead Owner — Module 5 (Admin Dashboard, Analytics & Operations):**
  * Designed the entire dark-mode administrative UI in Figma (`m5-designs/`).
  * Built all core routes: `/admin`, `/admin/users`, `/admin/analytics`, `/admin/scams`, `/admin/support-audit`.
  * Implemented CSV data export engine (`M5-07`).
  * Implemented RBAC simulation and tamper-proof audit trail (`M5-11`).
* **Coordinator — Module 6 (Digital Safety Score):**
  * Authored the aggregation design and assembled the integration contract (`M6-09`).
  * Built the Admin Cohort Safety Score Overview (`M6-05`).
* **Proposed Second Hat — Seed Data & Testing Environments (`M5-15`):**
  * Developed the 100+ user synthetic dataset with realistic historical timelines, subscription events, and threat logs for evaluation and testing.

### Slide 7: Technologies Used
* **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, Lucide Icons.
* **Data Visualization:** Recharts (responsive line charts, bar charts, donut charts).
* **Backend & Database:** Supabase (PostgreSQL, Row-Level Security policies, UUIDs).
* **Version Control & Quality:** Git feature branch workflow, strict commit conventions.

### Slide 8: Further Work & Final Milestones
* Connect live Supabase real-time websocket subscriptions for instantaneous fraud alerts.
* Complete the joint calibration of Module 6 safety score weights once M4 scam protective signal validation concludes.
* Implement automated anomaly detection triggers (e.g. sudden spike in suspicious check bursts).

---

## 2. Step-by-Step 20-Minute Live Demonstration Script

Follow this exact sequence during your live presentation:

### Step 1: Open the Admin Overview (`/admin`)
* **What to Show:** The clean, dark-mode navy-teal dashboard.
* **What to Say:** *"Here is the ScamShield Control Room. At a glance, we monitor 120 signups, 40 active Guardian subscribers generating LKR 39,600 in mock MRR, and 900 scam checks processed this month. Notice our 'Needs Attention' card instantly flags 7 open support requests and 3 suspended accounts."*

### Step 2: Demonstrate Role-Based Access Control (RBAC Simulator)
* **What to Show:** In the left sidebar, switch the **Role Simulator** from `Admin` to `Support`.
* **What to Say:** *"Security is enforced at the role level. When I switch to Support role, notice how administrative capabilities adapt. Let's navigate to User Management."*

### Step 3: User Management & Account Suspension (`/admin/users`)
* **What to Show:**
  1. Search for `nimal` or filter by plan `Guardian`.
  2. Select `Test User 87` or click `Suspend` while in Support role $\to$ point out the error modal: *"Only Admin can suspend accounts."*
  3. Switch role back to `Admin` in the sidebar.
  4. Click `Suspend` on a user $\to$ enter reason: *"Excessive automated rate-limit abuse."*
  5. Click Confirm $\to$ show the status immediately turns red (`Suspended`).
* **What to Say:** *"Notice the privacy banner below: As administrators, we can inspect account health and billing status, but vault passwords and submitted scam messages are zero-knowledge and completely invisible."*

### Step 4: Verify the Immutable Audit Trail (`/admin/support-audit`)
* **What to Show:** Navigate to `Support & Audit` tab `Immutable Audit Log`.
* **What to Say:** *"Every sensitive moderation action is automatically logged. Here is our suspension action just executed, stamped with the administrator's email, timestamp, reason, and IP address. Database policies prevent modification or deletion of these logs."*

### Step 5: Growth Analytics & CSV Export (`/admin/analytics`)
* **What to Show:**
  1. Highlight the Funnel Drop-off chart (1,430 landing views $\to$ 120 signed up).
  2. Show the Cohort Retention heatmap.
  3. Click **"Export CSV (M5-07)"** $\to$ the browser immediately downloads `scamshield_m5_analytics_*.csv`. Open the CSV to demonstrate real exported data!
* **What to Say:** *"We track the full conversion journey from Module 1's marketing funnel into active paid subscribers, and admins can export full reports to CSV for audit compliance."*

### Step 6: AI Threat Intelligence (`/admin/scams`)
* **What to Show:** Category distribution chart and AI confidence donut chart.
* **What to Say:** *"Here we observe threat vectors across Sri Lanka: 45.5% phishing attempts, followed by job recruitment scams. Again, raw message texts never touch this screen—only standardized taxonomy codes under contract X-13."*

### Step 7: Module 6 Safety Score Coordinator View (`/admin/safety-scores`)
* **What to Show:** The 3-input breakdown and user cohort scores.
* **What to Say:** *"As Module 6 coordinator, I built this aggregate view combining Password Health from M3, Account Security from M2, and Scam Activity from M4. Notice that paying for an Aegis plan does NOT inflate a user's safety score; security is calculated strictly from actual posture."*

---

## 3. High-Probability Evaluator Q&A Preparation

**Q1: How do you guarantee administrators cannot read users' stored passwords or private messages?**
* **Answer:** *"By design and architecture. Module 3 uses client-side encryption before writing ciphertext to the database. Module 5 queries only summary tables and counts (e.g. `total_vault_items = 22`). Similarly, Module 4 processes scam messages in an isolated server-side pipeline and stores only sanitized category tags (`CAT-PHISH`), never the raw submitted text."*

**Q2: How is Monthly Recurring Revenue (MRR) calculated if payments are mocked?**
* **Answer:** *"Following team specification M2-03, we have 3 mock plans: Sentinel (LKR 490), Guardian (LKR 990), and Aegis (LKR 1,890). Module 5 aggregates active subscribers multiplied by their tier price. We simulate realistic subscription state lifecycles (Trialing, Active, Cancelled) to demonstrate genuine SaaS billing analytics without touching real credit cards."*

**Q3: What makes your audit log 'tamper-proof'?**
* **Answer:** *"In our PostgreSQL schema (`docs/m5-schema.sql`), the `audit_logs` table has Row-Level Security policies that explicitly forbid `UPDATE` and `DELETE` queries. It is an append-only ledger where every administrative operation is permanently recorded with timestamp, actor, and IP address."*

**Q4: What is your exact role in Module 6 (Digital Safety Score)?**
* **Answer:** *"Module 6 is shared across the five team members. My role as coordinator is to assemble the integration specification (`M6-09`), define the aggregation logic combining the three safe summary inputs, and build the administrative safety score dashboard (`M6-05`) to monitor user risk cohorts."*
