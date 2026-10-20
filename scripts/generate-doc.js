const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ShadingType,
} = require("docx");

function createCell(text, isHeader = false, widthPct = 25, align = AlignmentType.LEFT) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: isHeader
      ? { type: ShadingType.CLEAR, fill: "0F766E" } // Teal header
      : undefined,
    margins: { top: 120, bottom: 120, left: 150, right: 150 },
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: text,
            bold: isHeader,
            color: isHeader ? "FFFFFF" : "0F172A",
            size: 20, // 10pt
            font: "Calibri",
          }),
        ],
      }),
    ],
  });
}

function createRow(cells, isHeader = false) {
  return new TableRow({
    tableHeader: isHeader,
    children: cells,
  });
}

async function generateReport() {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 1 inch margins
          },
        },
        children: [
          // Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "ScamShield | Module 5: Admin Dashboard, Analytics and Operations",
                bold: true,
                size: 32, // 16pt
                color: "0F172A",
                font: "Calibri",
              }),
            ],
            spacing: { after: 120 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "Revised Project Design, Development and Assessment Report",
                bold: true,
                size: 26, // 13pt
                color: "0F766E",
                font: "Calibri",
              }),
            ],
            spacing: { after: 180 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "Status: Draft for team review | 20 October 2026 | Module scope: Admin Dashboard, Analytics & Operations\nAuthor: Vishmi Himaya (Index: 245027T) | Group: Byte Brigade | Faculty of Information Technology, University of Moratuwa",
                size: 20, // 10pt
                color: "64748B",
                font: "Calibri",
                italics: true,
              }),
            ],
            spacing: { after: 360 },
          }),

          // Section 1
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "1. Project Overview and Scope",
                bold: true,
                color: "0F766E",
                size: 28,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "The Admin Dashboard, Analytics and Operations module (Module 5) serves as the centralized operational control room for the ScamShield digital safety platform. It enables administrators, support agents, and security analysts to observe platform health, track financial and conversion growth, monitor real-time AI scam check telemetry, manage user accounts, resolve customer support inquiries, detect operational anomalies, and act on intelligent rule-based recommendations while maintaining an immutable audit log.",
                size: 22,
                font: "Calibri",
              }),
            ],
            spacing: { after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Initial scope: ",
                bold: true,
                size: 22,
                font: "Calibri",
              }),
              new TextRun({
                text: "Real-time executive overview dashboard (M5-14); automated alerts for failed logins, component heartbeats, and incomplete scores; 7-day rolling baseline anomaly detection (+40% scam check spikes); rule-based recommended admin actions; user directory search, filtering, and account inspection (M5-09); Role-Based Access Control (RBAC) enforcement across Admin, Support, and Analyst roles (M5-10); account moderation with mandatory justification (M5-09); append-only immutable audit trail (M5-11); support ticket management and AI verdict dispute resolution (M5-12); mock revenue tracking across Sentinel, Guardian, and Aegis tiers (M5-03); onboarding funnel drop-off analytics (M5-05); subscriber retention cohort matrix (M5-06); AI threat vector classification using shared taxonomy X-13 (M5-04); and one-click CSV export (M5-07).",
                size: 22,
                font: "Calibri",
              }),
            ],
            spacing: { after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Future scope: ",
                bold: true,
                size: 22,
                font: "Calibri",
              }),
              new TextRun({
                text: "Automated dispute resolution email routing, machine learning predictive churn modeling, and multi-region failover telemetry.",
                size: 22,
                font: "Calibri",
              }),
            ],
            spacing: { after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Safety & Privacy Non-Negotiables: ",
                bold: true,
                color: "B91C1C",
                size: 22,
                font: "Calibri",
              }),
              new TextRun({
                text: "The platform adheres to strict Zero-Knowledge boundaries. Stored vault credentials, secret notes, and encryption keys from Module 3 are cryptographically masked and never visible to administrators. Similarly, raw message text, email bodies, and phone numbers submitted to Module 4 are never saved in admin tables; only anonymous taxonomy tags and metadata are charted. All payments and cardholder details are synthetic simulations.",
                size: 22,
                font: "Calibri",
              }),
            ],
            spacing: { after: 240 },
          }),

          // Section 2
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "2. Software Requirements Specification (SRS)",
                bold: true,
                color: "0F766E",
                size: 28,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: "2.1 Stakeholders and System Context",
                bold: true,
                color: "0F172A",
                size: 24,
                font: "Calibri",
              }),
            ],
            spacing: { before: 180, after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Primary actors: System Administrator (full administrative privileges, moderation, alert resolution, and recommendation execution), Support Agent (read-only profile access, ticket resolution, internal support notes), and Security Analyst (read-only telemetry, 7-day anomaly trends, and audit querying).",
                size: 22,
                font: "Calibri",
              }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "System dependencies: Module 1 (Landing & Onboarding) for funnel progression and referral telemetry; Module 2 (Auth & Paywall) for user identities, subscription tiers, and mock revenue; Module 3 (Password Vault) for aggregate credential count summaries and component health; Module 4 (AI Scam Pipeline) for X-13 threat category streams; Module 6 (Safety Score) for score input completion metrics; and Supabase PostgreSQL for persistence and Row-Level Security (RLS) enforcement.",
                size: 22,
                font: "Calibri",
              }),
            ],
            spacing: { after: 160 },
          }),

          // Section 2.2 Functional Requirements Table
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: "2.2 Functional Requirements",
                bold: true,
                color: "0F172A",
                size: 24,
                font: "Calibri",
              }),
            ],
            spacing: { before: 180, after: 120 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow([createCell("ID", true, 12), createCell("Requirement", true, 30), createCell("Acceptance Criteria", true, 58)], true),
              createRow([createCell("FR01", false, 12), createCell("Protected Admin Route (M5-01)", false, 30), createCell("Route /admin is protected by RBAC; unauthenticated or standard users are redirected to login.", false, 58)]),
              createRow([createCell("FR02", false, 12), createCell("Executive Overview (M5-14)", false, 30), createCell("Renders KPI summary cards (Signups, Active Subs, MRR, Checks) and needs-attention alerts.", false, 58)]),
              createRow([createCell("FR03", false, 12), createCell("User Directory Search (M5-09)", false, 30), createCell("Allows real-time searching by name/email and filtering by plan (Sentinel/Guardian/Aegis) and status.", false, 58)]),
              createRow([createCell("FR04", false, 12), createCell("Account Moderation (M5-09/10)", false, 30), createCell("Admin role can suspend or reactivate users with a mandatory justification; Support role is restricted.", false, 58)]),
              createRow([createCell("FR05", false, 12), createCell("Immutable Audit Log (M5-11)", false, 30), createCell("Every administrative action writes an append-only entry with actor, action, target, justification, and IP.", false, 58)]),
              createRow([createCell("FR06", false, 12), createCell("Mock Revenue Analytics (M5-03)", false, 30), createCell("Calculates Monthly Recurring Revenue based on active subscriptions without storing real card data.", false, 58)]),
              createRow([createCell("FR07", false, 12), createCell("Funnel Drop-Off Analytics (M5-05)", false, 30), createCell("Visualizes visitor drop-off across M1 onboarding steps (Landing -> Started -> Finished -> Signed Up).", false, 58)]),
              createRow([createCell("FR08", false, 12), createCell("Cohort Retention Matrix (M5-06)", false, 30), createCell("Displays monthly subscriber retention across M0 to M4 to track churn velocity.", false, 58)]),
              createRow([createCell("FR09", false, 12), createCell("AI Threat Intelligence (M5-04)", false, 30), createCell("Charts checks by X-13 taxonomy (Phishing, Job Scam, Delivery) and AI confidence levels.", false, 58)]),
              createRow([createCell("FR10", false, 12), createCell("Support & Feedback Inbox (M5-12)", false, 30), createCell("Manages user inquiries and reviews user disputes on false-positive/negative AI verdicts.", false, 58)]),
              createRow([createCell("FR11", false, 12), createCell("CSV Metrics Export (M5-07)", false, 30), createCell("One-click download of sanitized user and subscription metrics in standard RFC 4180 CSV format.", false, 58)]),
              createRow([createCell("FR12", false, 12), createCell("Synthetic Seed Dataset (M5-15)", false, 30), createCell("Provides a regenerable 100+ user test dataset enabling demonstrations without using real data.", false, 58)]),
              createRow([createCell("FR13", false, 12), createCell("Automated Alerts (⭐ A)", false, 30), createCell("Detects predefined event conditions (unusual failed logins, vault component offline, incomplete score inputs) and raises visual alerts.", false, 58)]),
              createRow([createCell("FR14", false, 12), createCell("Anomaly & Trend Detection (⭐ B)", false, 30), createCell("Compares real-time activity with a 7-day rolling historical baseline and highlights unusual changes (e.g. +40% scam check spikes).", false, 58)]),
              createRow([createCell("FR15", false, 12), createCell("Recommended Admin Actions (⭐ C)", false, 30), createCell("Presents rule-based investigatory recommendations paired with alerts, enabling 1-click drill-down to diagnostic routes.", false, 58)]),
            ],
          }),

          // Section 2.3 Non-functional requirements
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: "2.3 Non-Functional Requirements",
                bold: true,
                color: "0F172A",
                size: 24,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• Security: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Role-Based Access Control verified on every route; Supabase Row Level Security (RLS) blocks UPDATE and DELETE queries on public.audit_logs.", size: 22, font: "Calibri" }),
            ],
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• Privacy: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Strict Zero-Knowledge boundary: stored passwords, plaintext vault notes, and pasted scam message content are never fetched or displayed.", size: 22, font: "Calibri" }),
            ],
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• Usability: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Professional navy–teal dark mode interface compliant with WCAG AA contrast standards, responsive on desktop and tablet screens.", size: 22, font: "Calibri" }),
            ],
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• Explainability: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Anomaly detection and recommended actions are governed by transparent, deterministic rule matrices rather than opaque black-box models.", size: 22, font: "Calibri" }),
            ],
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• Maintainability: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Next.js 14 modular App Router structure, shared TypeScript interfaces, and Git feature-branch workflows.", size: 22, font: "Calibri" }),
            ],
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• Reliability: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Client-side fallback state and graceful handling of missing or partial telemetry data.", size: 22, font: "Calibri" }),
            ],
            spacing: { after: 180 },
          }),

          // Section 2.4 User stories
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: "2.4 User Stories",
                bold: true,
                color: "0F172A",
                size: 24,
                font: "Calibri",
              }),
            ],
            spacing: { before: 180, after: 100 },
          }),
          new Paragraph({ children: [new TextRun({ text: "1. As an administrator, I want an executive overview so I can monitor key platform metrics (signups, active subscribers, mock MRR, and scam check traffic) at a glance.", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "2. As an administrator, I want automated alerts when system components fail or unusual event patterns occur so that potential outages are addressed promptly.", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "3. As an administrator, I want anomaly detection that compares real-time telemetry against a 7-day baseline so I am warned when scam checks surge by 40% or more.", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "4. As an administrator, I want actionable recommendations for each alert so I immediately know which logs, components, or trends to investigate.", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "5. As an administrator, I want to search and inspect user profiles so I can manage accounts without seeing their passwords or private messages.", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "6. As an administrator, I want to suspend abusive accounts with a mandatory audit justification so that operational actions are recorded and justified.", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "7. As a security analyst, I want to query the tamper-proof audit trail so I can inspect administrative actions with timestamps and IP addresses.", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "8. As an administrator, I want to export analytics to CSV so I can prepare business reports and presentations.", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "9. As a support agent, I want to manage user tickets and review scam verdict feedback so user disputes are resolved efficiently.", size: 22, font: "Calibri" })], spacing: { after: 180 } }),

          // Section 3
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "3. Design Diagrams — Required Set",
                bold: true,
                color: "0F766E",
                size: 28,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "All five diagrams have been designed specifically for Module 5 in standard draw.io visual notation (white canvas, standard blue/green/yellow shapes, and clear typography). Insert the generated SVGs or exported images in the designated sections below.",
                size: 22,
                font: "Calibri",
              }),
            ],
            spacing: { after: 140 },
          }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "3.1 Subsystem Architecture Diagram", bold: true, size: 24, font: "Calibri" })],
            spacing: { before: 140, after: 80 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "Illustrates the 3-tier internal architecture of Module 5: Tier 1 Presentation Layer (Next.js 14 App Router UI, Recharts visualizations, Automated Alert Banners, Recommended Action Cards), Tier 2 Business Logic & Controllers (Anomaly & Trend Detection Engine with 7-Day Baseline Comparator, Alert & Recommendation Rule Engine, RBAC Policy Guard, Moderation Handler, Metrics & MRR Engine, Audit Logger), and Tier 3 Data & Storage Layer (PostgreSQL on Supabase, public.audit_logs, public.automated_alerts, public.v_7day_metric_baselines, public.analytics_events).", size: 22, font: "Calibri" })],
            spacing: { after: 80 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "[INSERT FINAL SUBSYSTEM ARCHITECTURE DIAGRAM HERE — docs/diagrams/5-system-architecture.svg]", bold: true, color: "0F766E", italics: true, size: 20, font: "Calibri" })],
            spacing: { after: 180 },
          }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "3.2 Use Case Diagram", bold: true, size: 24, font: "Calibri" })],
            spacing: { before: 140, after: 80 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "Actors: System Administrator, Support Agent, and Security Analyst. System boundary: Module 5 Admin Dashboard, Analytics & Operations. Use cases cover executive overview, automated alert monitoring, 7-day baseline anomaly detection (+40% scam check surge), rule-based recommended admin actions, revenue monitoring, funnel analytics, user account search, account suspension (with mandatory <<include>> Write Immutable Audit Log), support ticket management, audit querying, and CSV export.", size: 22, font: "Calibri" })],
            spacing: { after: 80 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "[INSERT FINAL USE CASE DIAGRAM HERE — docs/diagrams/1-use-case-diagram.svg]", bold: true, color: "0F766E", italics: true, size: 20, font: "Calibri" })],
            spacing: { after: 180 },
          }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "3.3 Activity Diagram", bold: true, size: 24, font: "Calibri" })],
            spacing: { before: 140, after: 80 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "3-swimlane workflow (Administrator Client UI, Anomaly Detection & Alert Rule Controller, PostgreSQL Telemetry & Audit Store). Traces: live telemetry ingestion -> query 7-day rolling baseline -> compute trend delta -> threshold decision diamond (Spike > +40% or Component Down?) -> [Yes] trigger anomaly -> evaluate rule engine (Failed logins -> Review auth logs; Vault down -> Investigate component health; Missing scores -> Check data integration; +40% scam surge -> Review scam trends) -> INSERT into public.automated_alerts -> display alert banner & action card -> Admin clicks 'Execute Recommended Action' -> route to diagnostic view -> append immutable audit log -> render diagnostic view.", size: 22, font: "Calibri" })],
            spacing: { after: 80 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "[INSERT FINAL ACTIVITY DIAGRAM HERE — docs/diagrams/2-activity-diagram.svg]", bold: true, color: "0F766E", italics: true, size: 20, font: "Calibri" })],
            spacing: { after: 180 },
          }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "3.4 Sequence Diagram", bold: true, size: 24, font: "Calibri" })],
            spacing: { before: 140, after: 80 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "Depicts the analytics and anomaly detection lifecycle: Admin navigates to /admin -> Client dispatches GET request -> API invokes AnomalyEngine -> AnomalyEngine queries 7-day rolling baseline and current counts from PostgreSQL -> detects +40% scam check surge -> RecommendationEngine maps rule-based action ('Review scam activity trends') -> stores alert in public.automated_alerts -> returns enriched JSON payload -> UI renders interactive alert banner & recommended action card -> Admin clicks 'Review Scam Activity Trends' -> dispatches diagnostic navigation and records action in public.audit_logs.", size: 22, font: "Calibri" })],
            spacing: { after: 80 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "[INSERT FINAL SEQUENCE DIAGRAM HERE — docs/diagrams/3-sequence-diagram.svg]", bold: true, color: "0F766E", italics: true, size: 20, font: "Calibri" })],
            spacing: { after: 180 },
          }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "3.5 Class and Database Architecture Diagram", bold: true, size: 24, font: "Calibri" })],
            spacing: { before: 140, after: 80 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "Standard 3-compartment UML classes for AdminController, AnomalyDetectionEngine, AlertRecommendationEngine, and AnalyticsEngine paired with database models: public.automated_alerts (alert ledger), public.audit_logs (append-only ledger), public.v_7day_metric_baselines (aggregation view), public.support_tickets, public.verdict_feedback, public.analytics_events, and the public.admin_user_directory view.", size: 22, font: "Calibri" })],
            spacing: { after: 80 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "[INSERT FINAL CLASS & DATABASE DIAGRAM HERE — docs/diagrams/4-class-er-diagram.svg]", bold: true, color: "0F766E", italics: true, size: 20, font: "Calibri" })],
            spacing: { after: 240 },
          }),

          // Section 4
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "4. System UI Design",
                bold: true,
                color: "0F766E",
                size: 28,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow([createCell("Screen", true, 30), createCell("Required Elements & Controls", true, 70)], true),
              createRow([createCell("Overview Dashboard (/admin)", false, 30), createCell("Top KPI cards (Signups, Active Subs, MRR, Checks), Weekly Signups line chart, Plan mix progress bars, Checks by category progress bars, Automated Alert Banners, and Recommended Action Cards with 1-click drill-down buttons.", false, 70)]),
              createRow([createCell("User Management (/admin/users)", false, 30), createCell("Search input, Plan filter dropdown, Status filter dropdown, User table with colored status badges, User inspection drawer, Internal support notes form, and Suspend/Reactivate modal with mandatory justification input.", false, 70)]),
              createRow([createCell("Business Analytics (/admin/analytics)", false, 30), createCell("Growth KPIs (Conversion %, Trial-to-Paid %, Churn %, Referral signups), Funnel drop-off visualization, 5-month cohort retention heatmap, Referral attribution table, and one-click CSV Export button.", false, 70)]),
              createRow([createCell("AI Scam Intelligence (/admin/scams)", false, 30), createCell("Threat vector volume bar chart, AI confidence distribution donut chart, Zero-Knowledge boundary notice, X-13 shared taxonomy mapping table, and 7-Day Baseline Spike Visualizer (+40% surge indicator).", false, 70)]),
              createRow([createCell("Support & Audit Log (/admin/support-audit)", false, 30), createCell("View switcher tabs: Immutable Audit Log table (searchable, filterable by action type), Support Tickets inbox with status toggles, AI Verdict Feedback dispute review queue, and Active Alert Investigation Drawer.", false, 70)]),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "\n[INSERT FIGMA UI SCREENSHOTS / SVG EXPORTS HERE — m5-designs/]", bold: true, color: "0F766E", italics: true, size: 20, font: "Calibri" })],
            spacing: { before: 120, after: 240 },
          }),

          // Section 5
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "5. Software Process Model and Justification",
                bold: true,
                color: "0F766E",
                size: 28,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Proposed Model: Agile Iterative & Incremental Development. Developing an administrative control room requires continuous alignment with the data schemas of the other four modules. An incremental model allows Module 5 to build baseline UI components, establish data contracts (X-02, X-13), integrate database tables in iterations, and calibrate analytics as teammate modules progress.",
                size: 22,
                font: "Calibri",
              }),
            ],
            spacing: { after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Iteration 1: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Requirements elicitation (SRS), Figma wireframes (m5-designs/), and 5 core UML design diagrams.\n", size: 22, font: "Calibri" }),
              new TextRun({ text: "Iteration 2: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Next.js scaffold setup, Tailwind navy–teal design token configuration, and synthetic seed data generator (M5-15).\n", size: 22, font: "Calibri" }),
              new TextRun({ text: "Iteration 3: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Core screen implementation (Overview, User Management, Analytics, Scams, Support & Audit), RBAC role simulation, and CSV data export (M5-07).\n", size: 22, font: "Calibri" }),
              new TextRun({ text: "Iteration 4: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Automated alert engine, 7-day baseline anomaly detector, rule-based action matrix integration, PostgreSQL schema validation (m5-schema.sql), Row-Level Security policy verification, end-to-end build verification, and presentation preparation.", size: 22, font: "Calibri" }),
            ],
            spacing: { after: 240 },
          }),

          // Section 6
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "6. Collaborative Development and Implementation Evidence",
                bold: true,
                color: "0F766E",
                size: 28,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow([createCell("Work Item", true, 28), createCell("Status", true, 22), createCell("Evidence & Verification", true, 50)], true),
              createRow([createCell("Admin UI & Wireframes", false, 28), createCell("DONE", false, 22), createCell("Figma design SVGs in m5-designs/ (1-admin-overview, 2-users, 3-analytics, 4-support)", false, 50)]),
              createRow([createCell("Next.js Application Pages", false, 28), createCell("DONE / BUILT", false, 22), createCell("Compiled successfully across all 16 routes; verified with npm run build (0 errors)", false, 50)]),
              createRow([createCell("User Moderation & RBAC", false, 28), createCell("DONE / BUILT", false, 22), createCell("Interactive role switcher (Admin/Support) and moderation modal in src/app/admin/users", false, 50)]),
              createRow([createCell("Immutable Audit Trail", false, 28), createCell("DONE / BUILT", false, 22), createCell("Live audit table with append-only RLS policy in docs/m5-schema.sql", false, 50)]),
              createRow([createCell("Automated Alerts & Actions", false, 28), createCell("DONE / MODELLED", false, 22), createCell("Rule-based action matrix and 7-day anomaly detector in docs/diagrams/", false, 50)]),
              createRow([createCell("Synthetic Seed Dataset", false, 28), createCell("DONE / BUILT", false, 22), createCell("100+ user synthetic generator in src/lib/seed-data.ts (M5-15)", false, 50)]),
              createRow([createCell("CSV Data Export", false, 28), createCell("DONE / BUILT", false, 22), createCell("Functional client export in src/app/admin/analytics (M5-07)", false, 50)]),
              createRow([createCell("Version Control / Git", false, 28), createCell("COMMITTED & PUSHED", false, 22), createCell("Branch feat/m5-admin-dashboard on Bytebrigade-devs/scamshield", false, 50)]),
            ],
          }),

          // Section 7
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "7. Technology Selection and Justification",
                bold: true,
                color: "0F766E",
                size: 28,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow([createCell("Technology", true, 25), createCell("Selection Justification for Module 5", true, 75)], true),
              createRow([createCell("Next.js 14 (React)", false, 25), createCell("Full-stack framework enabling server-side route protection, API handlers, and interactive client components.", false, 75)]),
              createRow([createCell("Tailwind CSS", false, 25), createCell("Utility-first styling ensuring strict consistency with the team-approved ScamShield navy–teal palette.", false, 75)]),
              createRow([createCell("Recharts", false, 25), createCell("Declarative React chart library specified in project proposal for rendering responsive line, bar, and donut charts.", false, 75)]),
              createRow([createCell("Supabase (PostgreSQL)", false, 25), createCell("Provides relational integrity, aggregation views (v_7day_metric_baselines), and tamper-proof Row-Level Security for audit trails.", false, 75)]),
              createRow([createCell("TypeScript", false, 25), createCell("Provides strict static typing across telemetry events, user profiles, alert entities, and audit log interfaces.", false, 75)]),
              createRow([createCell("Rule-Based Engine", false, 25), createCell("Deterministic condition-action mapping providing transparent and explainable recommendations without requiring complex black-box machine learning.", false, 75)]),
              createRow([createCell("GitHub", false, 25), createCell("Version control, branch protection, pull requests, and traceable individual contribution commit history.", false, 75)]),
              createRow([createCell("draw.io", false, 25), createCell("Standard academic diagramming tool producing clean, compliant UML specifications.", false, 75)]),
            ],
          }),

          // Section 8
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "8. Project Management Plan",
                bold: true,
                color: "0F766E",
                size: 28,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "8.1 Work Breakdown Structure (WBS)", bold: true, size: 24, font: "Calibri" })],
            spacing: { before: 140, after: 80 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow([createCell("WBS", true, 12), createCell("Task Name", true, 38), createCell("Deliverable", true, 50)], true),
              createRow([createCell("1.0", false, 12), createCell("Requirements & Analysis", false, 38), createCell("M5 SRS, user stories, security boundary specification", false, 50)]),
              createRow([createCell("2.0", false, 12), createCell("System Modeling & Design", false, 38), createCell("5 draw.io UML diagrams, database schema (m5-schema.sql)", false, 50)]),
              createRow([createCell("3.0", false, 12), createCell("UI/UX Design & Prototyping", false, 38), createCell("Figma dark mode wireframes (m5-designs/)", false, 50)]),
              createRow([createCell("4.0", false, 12), createCell("Frontend & Dashboard Coding", false, 38), createCell("5 Next.js admin routes with Recharts visualizations", false, 50)]),
              createRow([createCell("5.0", false, 12), createCell("Operations, Alerting & Anomaly Engine", false, 38), createCell("RBAC simulation, 7-day baseline anomaly comparator, rule-based recommendation matrix, immutable audit logger", false, 50)]),
              createRow([createCell("6.0", false, 12), createCell("Verification & Testing", false, 38), createCell("Zero-Knowledge privacy tests, build validation, CSV export test", false, 50)]),
              createRow([createCell("7.0", false, 12), createCell("Documentation & Viva Prep", false, 38), createCell("Comprehensive Word report and 20-min demo presentation pack", false, 50)]),
            ],
          }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "8.2 Gantt Plan Schedule", bold: true, size: 24, font: "Calibri" })],
            spacing: { before: 180, after: 80 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow([createCell("Phase", true, 30), createCell("Target Period", true, 30), createCell("Dependencies", true, 40)], true),
              createRow([createCell("Requirements & SRS", false, 30), createCell("Week 1", false, 30), createCell("Team module scope alignment", false, 40)]),
              createRow([createCell("UML Diagrams & Wireframes", false, 30), createCell("Week 1–2", false, 30), createCell("Approved SRS & theme tokens", false, 40)]),
              createRow([createCell("Core Coding & Recharts", false, 30), createCell("Week 2–3", false, 30), createCell("Next.js scaffold & seed data", false, 40)]),
              createRow([createCell("Alerts, Moderation & Audit Trails", false, 30), createCell("Week 3", false, 30), createCell("PostgreSQL schema & RLS rules", false, 40)]),
              createRow([createCell("Verification & Demo Rehearsal", false, 30), createCell("Week 4", false, 30), createCell("Implemented functional dashboard", false, 40)]),
            ],
          }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "8.3 Resources, Risks and Mitigation", bold: true, size: 24, font: "Calibri" })],
            spacing: { before: 180, after: 80 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• Risk 1: Accidental exposure of private vault or message data in admin views. ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Mitigation: Zero-Knowledge filtering at the query level; admin views only ever request aggregate counts and taxonomy tags.\n", size: 22, font: "Calibri" }),
              new TextRun({ text: "• Risk 2: Empty or sparse charts during viva demonstration. ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Mitigation: Synthetic seed data engine (M5-15) preloaded with 100+ realistic users and 90-day time-series telemetry.\n", size: 22, font: "Calibri" }),
              new TextRun({ text: "• Risk 3: Alert fatigue or false alarms. ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Mitigation: Predefined thresholds and 7-day rolling baseline comparisons ensure alerts only trigger on significant deviations (e.g. +40% surges).", size: 22, font: "Calibri" }),
            ],
            spacing: { after: 240 },
          }),

          // Section 9
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "9. Scope Distribution and Individual Contributions",
                bold: true,
                color: "0F766E",
                size: 28,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow([createCell("Member", true, 25), createCell("Assigned Responsibility", true, 35), createCell("Individual Evidence & Deliverables", true, 40)], true),
              createRow([createCell("Vishmi Himaya (245027T)", false, 25), createCell("Module 5 Lead Owner (Admin & Operations)", false, 35), createCell("Figma designs (m5-designs/), Next.js routes (/admin/*), Recharts charts, CSV export (M5-07)", false, 40)]),
              createRow([createCell("Vishmi Himaya (245027T)", false, 25), createCell("Advanced Operational Control", false, 35), createCell("Automated Alerts, 7-Day Baseline Anomaly Detection, Rule-Based Recommendation Engine", false, 40)]),
              createRow([createCell("Vishmi Himaya (245027T)", false, 25), createCell("Security & Governance (RBAC & Audit)", false, 35), createCell("RBAC role simulator, moderation modal with audit reason, public.audit_logs schema & RLS (M5-10/11)", false, 40)]),
              createRow([createCell("Vishmi Himaya (245027T)", false, 25), createCell("Module 6 Coordinator (Safety Score)", false, 35), createCell("Safety Score aggregation logic & Admin Score View (/admin/safety-scores · M6-05)", false, 40)]),
              createRow([createCell("Vishmi Himaya (245027T)", false, 25), createCell("Second Hat: Seed Data & Testing", false, 35), createCell("100+ user synthetic dataset generator (M5-15) in src/lib/seed-data.ts", false, 40)]),
            ],
          }),

          // Section 10
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "10. Presentation Quality Plan",
                bold: true,
                color: "0F766E",
                size: 28,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• Structure: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Follow the Faculty of IT 20-minute presentation & demonstration guidelines: Background -> Problem -> Aim & Objectives -> Architecture -> UML Diagrams -> Live Demo -> Further Work -> Q&A.\n", size: 22, font: "Calibri" }),
              new TextRun({ text: "• Live Demonstration Sequence: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "1) Open /admin overview and explain top-line KPIs and Automated Alert Banners; 2) Showcase Anomaly & Trend Detection (+40% scam check surge compared to 7-day baseline); 3) Walk through Recommended Admin Action Cards and trigger 1-click navigation to diagnostic view; 4) Demonstrate the RBAC simulator (Admin vs Support); 5) Execute user suspension with mandatory justification; 6) Inspect the live append-only audit trail; 7) Demonstrate funnel analytics & one-click CSV export; 8) Show AI threat intelligence category charts.\n", size: 22, font: "Calibri" }),
              new TextRun({ text: "• Q&A Preparedness: ", bold: true, size: 22, font: "Calibri" }),
              new TextRun({ text: "Be prepared to explain how the 7-day rolling baseline compares activity without ML overhead, how Zero-Knowledge encryption protects vault entries from admins, and how MRR is calculated from mock subscriptions.", size: 22, font: "Calibri" }),
            ],
            spacing: { after: 240 },
          }),

          // Section 11 & 12
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "11. Report Quality Checklist",
                bold: true,
                color: "0F766E",
                size: 28,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({ children: [new TextRun({ text: "✔ Title page, module identification, and student registration number clearly stated.", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "✔ All five draw.io UML diagrams updated with Automated Alerts, Anomaly Detection, and Recommended Actions.", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "✔ UI screenshots captioned with dark mode design system adherence and alert cards.", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "✔ Implementation status supported by verified GitHub commits and working build.", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "✔ Security and Zero-Knowledge privacy claims verified with explicit boundaries.", size: 22, font: "Calibri" })], spacing: { after: 180 } }),

          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "12. Final Submission Checklist",
                bold: true,
                color: "0F766E",
                size: 28,
                font: "Calibri",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({ children: [new TextRun({ text: "✔ Subsystem Architecture, Use Case, Activity, Sequence, and Class/ER Diagrams", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "✔ Complete SRS and 9 User Stories (including Alerts, Anomaly Detection, and Action Guidance)", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "✔ System UI Design specifications and Figma frame references", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "✔ Software Process Model (Agile Iterative) justification", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "✔ Collaborative development evidence on branch feat/m5-admin-dashboard", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "✔ Technology selection and architectural justification table", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "✔ WBS, Gantt plan, and risk mitigation strategies", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "✔ Individual scope and contribution matrix for Vishmi Himaya", size: 22, font: "Calibri" })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun({ text: "✔ 20-minute presentation and live demonstration rehearsal plan", size: 22, font: "Calibri" })], spacing: { after: 180 } }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(__dirname, "..", "ScamShield_Module5_Report.docx");
  fs.writeFileSync(outPath, buffer);
  console.log("Successfully created: " + outPath);
}

generateReport().catch(console.error);
