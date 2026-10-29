# Module 5: Admin Dashboard, Analytics and Operations
## UML Analysis and Design Diagrams

- **Project:** IS2901 Software Development Project · ScamShield
- **Group:** Byte Brigade · University of Moratuwa, Faculty of Information Technology
- **Author:** Vishmi Himaya (@Vish-Himaya) · Index No: 245027T
- **Module:** Module 5 (Admin & Operations) & Module 6 Coordinator

---

## 1. Use Case Diagram

```mermaid
flowchart LR
    subgraph Actors
        Admin["Administrator<br/>(Full Access)"]
        Support["Support Agent<br/>(Restricted Access)"]
        Analyst["Security Analyst<br/>(Read-Only)"]
    end

    subgraph ScamShield_Module5["Module 5: Admin & Operations System Boundary"]
        UC1["UC-01: View Executive Overview (M5-14)"]
        UC2["UC-02: Monitor Business & Revenue Analytics (M5-03, M5-05)"]
        UC3["UC-03: Analyze AI Scam Threat Patterns (M5-04)"]
        UC4["UC-04: Search & Inspect User Accounts (M5-09)"]
        UC5["UC-05: Suspend / Reactivate User Account (M5-10)"]
        UC6["UC-06: Add Internal Support Note (M5-09)"]
        UC7["UC-07: Review Append-Only Audit Log (M5-11)"]
        UC8["UC-08: Export Analytics to CSV (M5-07)"]
        UC9["UC-09: Manage Support Tickets & Feedback (M5-12)"]
        UC10["UC-10: Review Module 6 Safety Score Cohorts (M6-05)"]
    end

    %% Admin Connections
    Admin --> UC1
    Admin --> UC2
    Admin --> UC3
    Admin --> UC4
    Admin --> UC5
    Admin --> UC6
    Admin --> UC7
    Admin --> UC8
    Admin --> UC9
    Admin --> UC10

    %% Support Connections
    Support --> UC1
    Support --> UC4
    Support --> UC6
    Support --> UC9

    %% Analyst Connections
    Analyst --> UC1
    Analyst --> UC2
    Analyst --> UC3
    Analyst --> UC7
    Analyst --> UC10
```

---

## 2. Activity Diagram: Account Moderation & Audit Logging

This diagram illustrates how an administrator suspends an abusive account while enforcing Role-Based Access Control and generating an append-only audit log.

```mermaid
flowchart TD
    Start([Admin navigates to User Management]) --> SearchUser[Enter search term / filter by plan or status]
    SearchUser --> SelectUser[Select target user record]
    SelectUser --> InspectProfile[Inspect metadata: plan, joined date, check count]
    InspectProfile --> CheckZeroKnowledge{"Check Privacy Boundary"}
    CheckZeroKnowledge -->|Strict Enforcement| ShieldVault["Zero Raw-Content Access:<br/>Passwords and messages remain hidden"]
    
    ShieldVault --> ClickSuspend[Click 'Suspend Account']
    ClickSuspend --> CheckRole{"Check User Role (RBAC)"}
    
    CheckRole -->|Role != Admin| AccessDenied[Display RBAC Error Modal: 'Only Admin can suspend']
    AccessDenied --> EndFailure([Operation Terminated])
    
    CheckRole -->|Role == Admin| OpenModal[Open Moderation Confirmation Modal]
    OpenModal --> InputReason[Admin enters mandatory audit justification]
    InputReason --> SubmitAction[Submit Suspension]
    
    SubmitAction --> UpdateDB[Update user status to 'Suspended']
    UpdateDB --> CreateAudit[Create append-only audit record in public.audit_logs]
    CreateAudit --> StampMetadata[Record: AdminEmail, Timestamp, TargetEmail, Justification, IP]
    StampMetadata --> RefreshUI[Update User Management table and Needs Attention badge]
    RefreshUI --> EndSuccess([Suspension Complete & Logged])
```

---

## 3. Sequence Diagram: Analytics Generation & Privacy Sanitization

Illustrates how Module 5 requests system telemetry while enforcing privacy boundaries.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Administrator
    participant UI as Admin Dashboard (Next.js)
    participant API as Admin Analytics API
    participant M2 as M2 Auth & Subscriptions
    participant M4 as M4 Scam Pipeline
    participant DB as Supabase PostgreSQL

    Admin->>UI: Opens /admin/analytics
    UI->>API: GET /api/admin/analytics (Token, Role: Admin)
    API->>DB: Verify Admin JWT & Role claim
    
    par Query Business Data
        API->>M2: Request subscriber counts by plan (Sentinel, Guardian, Aegis)
        M2-->>API: Active counts & mock billing totals (NO card info)
    and Query Funnel Telemetry
        API->>DB: Query funnel events (M1 step progression)
        DB-->>API: Aggregated step counts (1430 -> 610 -> 290 -> 120)
    and Query Scam Threat Intelligence
        API->>M4: Request scan category metadata (X-13 codes)
        Note over M4,API: Sanitization Barrier: Raw message text is NEVER returned
        M4-->>API: Threat counts: phishing (410), romance_scam (230), fake_invoice (170)
    end

    API->>API: Aggregate MRR, conversion rates, and retention cohorts
    API-->>UI: Return sanitized JSON analytics payload
    UI->>Admin: Render interactive Recharts and KPI cards
```

---

## 4. Entity-Relationship (ER) & Schema Diagram

```mermaid
erDiagram
    ADMIN_USERS {
        uuid id PK
        string email
        string role "admin | support"
    }

    USERS_VIEW {
        uuid id PK
        string name
        string email
        string plan "Sentinel | Guardian | Aegis"
        string status "Active | Trialing | Cancelled | Suspended"
        date joined
        int checks_count
        int vault_count
        numeric billing_amount
    }

    AUDIT_LOGS {
        uuid id PK
        uuid admin_id FK
        string admin_email
        string admin_role
        string action
        string target_identifier
        text details
        string ip_address
        timestamp created_at
    }

    SUPPORT_TICKETS {
        uuid id PK
        string ticket_number
        uuid user_id FK
        string user_email
        string subject
        string category
        string status "Open | In Progress | Resolved"
        string priority
        text internal_notes
        timestamp created_at
    }

    VERDICT_FEEDBACK {
        uuid id PK
        string check_id
        uuid user_id FK
        string user_email
        string taxonomy_category
        string system_verdict
        string user_reaction "False Positive | False Negative | Helpful"
        text user_comment
        string status
        timestamp created_at
    }

    ANALYTICS_EVENTS {
        uuid id PK
        string event_name
        string source_module
        string visitor_id
        jsonb metadata
        timestamp created_at
    }

    ADMIN_USERS ||--o{ AUDIT_LOGS : performs
    USERS_VIEW ||--o{ SUPPORT_TICKETS : submits
    USERS_VIEW ||--o{ VERDICT_FEEDBACK : reports
    USERS_VIEW ||--o{ ANALYTICS_EVENTS : triggers
```
