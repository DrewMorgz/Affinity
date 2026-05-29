# Affinity Core — Azure Deployment Handover Pack
**Version 1.0 | July 2025**
**Prepared for: Affinity Group Ltd**
**Prepared by: Affinity Core build process**

---

## 1. System Overview

Affinity Core is a 29-module corporate and trust services management platform built in React (JSX). It replaces Quantios Core and Riskpass across all Affinity offices (IOM, Malta, Cayman, UK, Miami, South Dakota).

**Modules built:**
1. Entity Registry | 2. Compliance/KYC-AML | 3. Document Management | 4. Onboarding | 5. Timesheets | 6. Invoicing | 7. Reporting | 8. System Admin | 9. Notifications | 10. Statutory Registers | 11. Bookkeeping | 12. Procedure Automation | 13. Unified Shell | 14. IOM Compliance | 15. Malta/MFSA | 16. Cayman/CIMA | 17. eGaming/OGRA | 18. Immigration | 19. Yachting | 20. Sports | 21. Client Portal | 22. South Dakota | 23. UK/US/Cyprus | 24. Jets & Crew

---

## 2. Recommended Azure Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AFFINITY CORE — AZURE                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Azure App   │    │  Azure SQL   │    │  Azure Blob  │  │
│  │  Service     │───▶│  Database    │    │  Storage     │  │
│  │  (React SPA) │    │  (all data)  │    │  (documents) │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                                       │           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Azure AD    │    │  Azure Key   │    │  Azure CDN   │  │
│  │  (SSO/M365)  │    │  Vault       │    │  (static)    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
│  Domain: core.affinityco.com (or internal subdomain)       │
└─────────────────────────────────────────────────────────────┘
```

### Azure services required:

| Service | Purpose | Estimated cost/month |
|---|---|---|
| Azure App Service (B2/B3) | Host React frontend + Node.js API | £60–120 |
| Azure SQL Database (S2) | All entity, compliance, invoice data | £80–150 |
| Azure Blob Storage | Document storage (DMS module) | £20–50 |
| Azure Active Directory | M365 SSO, user authentication | Included in M365 |
| Azure Key Vault | Secrets, connection strings | £5–10 |
| Azure CDN | Static asset delivery | £10–20 |
| **Total estimated** | | **£175–350/month** |

---

## 3. Tech Stack

### Frontend
- **Framework:** React 18 (JSX)
- **Styling:** Inline styles (CSS-in-JS) — no build dependency on Tailwind
- **Charts:** Recharts
- **Icons:** Tabler Icons (ti-*)
- **State:** React useState/useMemo (no Redux needed at current scale)

### Backend (to be built by developer)
- **Runtime:** Node.js 20 LTS
- **API framework:** Express.js
- **ORM:** Prisma (for Azure SQL)
- **Auth:** Azure AD / MSAL.js (Microsoft Authentication Library)
- **File uploads:** Azure Blob Storage SDK

### Database
- **Engine:** Azure SQL (PostgreSQL also viable)
- **Schema:** See Section 5 below

---

## 4. Deployment Steps

### Step 1 — Azure setup (Day 1, ~2 hours)
```bash
# Install Azure CLI
az login
az group create --name affinity-core-rg --location uksouth

# Create App Service
az appservice plan create --name affinity-core-plan --resource-group affinity-core-rg --sku B2
az webapp create --name affinity-core --resource-group affinity-core-rg --plan affinity-core-plan

# Create SQL Database
az sql server create --name affinity-core-sql --resource-group affinity-core-rg --admin-user affinityadmin --admin-password [SECURE_PASSWORD]
az sql db create --resource-group affinity-core-rg --server affinity-core-sql --name affinitycore --edition Standard --capacity 50

# Create Blob Storage
az storage account create --name affinitycoredocs --resource-group affinity-core-rg --sku Standard_LRS
az storage container create --name documents --account-name affinitycoredocs
```

### Step 2 — Backend API (Day 1-2, ~8 hours)
```bash
# Initialise Node.js project
mkdir affinity-core-api && cd affinity-core-api
npm init -y
npm install express prisma @prisma/client @azure/msal-node @azure/storage-blob bcryptjs jsonwebtoken cors dotenv

# Initialise Prisma
npx prisma init --datasource-provider sqlserver
```

### Step 3 — Database schema migration (Day 2, ~2 hours)
```bash
# Run migrations (schema in Section 5)
npx prisma migrate deploy

# Seed with initial data
node prisma/seed.js
```

### Step 4 — Azure AD / M365 SSO (Day 2-3, ~4 hours)
```bash
# Register app in Azure AD
# Go to: portal.azure.com > Azure Active Directory > App registrations > New registration
# App name: Affinity Core
# Redirect URI: https://core.affinityco.com/auth/callback
# Add M365 permissions: User.Read, Mail.Send (for notifications)
```

### Step 5 — Frontend build and deploy (Day 3, ~2 hours)
```bash
# Build React app
npm run build

# Deploy to Azure App Service
az webapp deployment source config-zip --resource-group affinity-core-rg --name affinity-core --src build.zip
```

### Step 6 — Domain and SSL (Day 3, ~1 hour)
```bash
# Add custom domain
az webapp config hostname add --webapp-name affinity-core --resource-group affinity-core-rg --hostname core.affinityco.com

# Enable SSL
az webapp config ssl bind --certificate-thumbprint [THUMBPRINT] --ssl-type SNI --name affinity-core --resource-group affinity-core-rg
```

---

## 5. Database Schema (Key Tables)

```sql
-- Entities
CREATE TABLE entities (
  id            INT PRIMARY KEY IDENTITY,
  name          NVARCHAR(255) NOT NULL,
  ref           NVARCHAR(50) UNIQUE,
  type          NVARCHAR(50),         -- Company, Trust, Foundation
  jurisdiction  NVARCHAR(100),
  status        NVARCHAR(50),         -- Active, Dormant, In liquidation
  risk_rating   NVARCHAR(50),
  administrator NVARCHAR(100),
  incorporated  DATE,
  reg_number    NVARCHAR(100),
  bo_name       NVARCHAR(255),        -- Beneficial owner
  office        NVARCHAR(100),
  created_at    DATETIME DEFAULT GETDATE(),
  updated_at    DATETIME DEFAULT GETDATE()
);

-- Compliance reviews
CREATE TABLE compliance_reviews (
  id            INT PRIMARY KEY IDENTITY,
  entity_id     INT FOREIGN KEY REFERENCES entities(id),
  risk_rating   NVARCHAR(50),
  last_review   DATE,
  next_due      DATE,
  status        NVARCHAR(50),
  reviewer      NVARCHAR(100),
  administrator NVARCHAR(100),
  notes         NVARCHAR(MAX),
  created_at    DATETIME DEFAULT GETDATE()
);

-- KYC records
CREATE TABLE kyc_records (
  id              INT PRIMARY KEY IDENTITY,
  entity_id       INT FOREIGN KEY REFERENCES entities(id),
  person_name     NVARCHAR(255),
  person_type     NVARCHAR(50),     -- Individual, Corporate
  role            NVARCHAR(100),    -- Director, UBO, Trustee etc
  id_doc_type     NVARCHAR(100),
  id_expiry       DATE,
  addr_doc_type   NVARCHAR(100),
  addr_expiry     DATE,
  status          NVARCHAR(50),
  verified_by     NVARCHAR(100),
  verified_date   DATE,
  created_at      DATETIME DEFAULT GETDATE()
);

-- Documents
CREATE TABLE documents (
  id              INT PRIMARY KEY IDENTITY,
  entity_id       INT FOREIGN KEY REFERENCES entities(id),
  name            NVARCHAR(500),
  doc_type        NVARCHAR(100),
  status          NVARCHAR(50),
  version         NVARCHAR(20),
  blob_url        NVARCHAR(1000),   -- Azure Blob Storage URL
  uploaded_by     NVARCHAR(100),
  approved_by     NVARCHAR(100),
  expiry_date     DATE,
  retention       NVARCHAR(100),
  retain_until    DATE,
  notes           NVARCHAR(MAX),
  created_at      DATETIME DEFAULT GETDATE()
);

-- Invoices
CREATE TABLE invoices (
  id              INT PRIMARY KEY IDENTITY,
  entity_id       INT FOREIGN KEY REFERENCES entities(id),
  ref             NVARCHAR(50) UNIQUE,
  invoice_type    NVARCHAR(50),     -- Retainer, Ad hoc
  amount          DECIMAL(12,2),
  balance         DECIMAL(12,2),
  currency        NVARCHAR(10),
  status          NVARCHAR(50),
  invoice_date    DATE,
  due_date        DATE,
  paid_date       DATE,
  office          NVARCHAR(100),
  notes           NVARCHAR(MAX),
  created_at      DATETIME DEFAULT GETDATE()
);

-- Time entries
CREATE TABLE time_entries (
  id              INT PRIMARY KEY IDENTITY,
  entity_id       INT FOREIGN KEY REFERENCES entities(id),
  employee        NVARCHAR(100),
  entry_date      DATE,
  matter          NVARCHAR(100),
  narrative       NVARCHAR(MAX),
  units           INT,
  hours           DECIMAL(5,2),
  rate            DECIMAL(8,2),
  value           DECIMAL(10,2),
  billing_status  NVARCHAR(50),
  week_ref        NVARCHAR(50),
  created_at      DATETIME DEFAULT GETDATE()
);

-- Users
CREATE TABLE users (
  id              INT PRIMARY KEY IDENTITY,
  name            NVARCHAR(255),
  email           NVARCHAR(255) UNIQUE,
  role            NVARCHAR(100),
  office          NVARCHAR(100),
  azure_oid       NVARCHAR(255),    -- Azure AD Object ID for SSO
  mfa_enabled     BIT DEFAULT 0,
  status          NVARCHAR(50) DEFAULT 'Active',
  last_login      DATETIME,
  created_at      DATETIME DEFAULT GETDATE()
);

-- Audit log
CREATE TABLE audit_log (
  id              INT PRIMARY KEY IDENTITY,
  user_id         INT FOREIGN KEY REFERENCES users(id),
  action          NVARCHAR(500),
  module          NVARCHAR(100),
  entity_id       INT,
  entity_name     NVARCHAR(255),
  ip_address      NVARCHAR(50),
  created_at      DATETIME DEFAULT GETDATE()
);

-- Notifications
CREATE TABLE notifications (
  id              INT PRIMARY KEY IDENTITY,
  title           NVARCHAR(500),
  category        NVARCHAR(100),
  severity        NVARCHAR(50),
  entity_id       INT,
  assignee        NVARCHAR(100),
  detail          NVARCHAR(MAX),
  read_at         DATETIME,
  escalated       BIT DEFAULT 0,
  created_at      DATETIME DEFAULT GETDATE()
);

-- Procedure runs
CREATE TABLE procedure_runs (
  id              INT PRIMARY KEY IDENTITY,
  procedure_ref   NVARCHAR(20),
  procedure_title NVARCHAR(255),
  entity_id       INT,
  assignee        NVARCHAR(100),
  target_date     DATE,
  status          NVARCHAR(50),
  steps_json      NVARCHAR(MAX),    -- JSON array of steps with completion status
  started_at      DATETIME,
  completed_at    DATETIME,
  created_at      DATETIME DEFAULT GETDATE()
);
```

---

## 6. Environment Variables

```env
# .env file for production
NODE_ENV=production
PORT=8080

# Database
DATABASE_URL="sqlserver://affinity-core-sql.database.windows.net:1433;database=affinitycore;user=affinityadmin;password={PASSWORD};encrypt=true"

# Azure AD / M365 SSO
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_REDIRECT_URI=https://core.affinityco.com/auth/callback

# Azure Blob Storage
AZURE_STORAGE_ACCOUNT=affinitycoredocs
AZURE_STORAGE_KEY=your-storage-key
AZURE_BLOB_CONTAINER=documents

# JWT
JWT_SECRET=your-very-long-random-secret-key
JWT_EXPIRES_IN=8h

# Email notifications (via M365)
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=notifications@affinityco.com
SMTP_PASS=your-app-password

# App
APP_URL=https://core.affinityco.com
APP_NAME=Affinity Core
```

---

## 7. Security Checklist

- [ ] Azure AD SSO configured — no local password auth for staff
- [ ] MFA enforced via Azure AD Conditional Access
- [ ] All connections over HTTPS/TLS 1.2+
- [ ] Database connections use Azure Private Link (not public internet)
- [ ] Azure Key Vault for all secrets (no hardcoded credentials)
- [ ] Blob Storage — private containers, SAS tokens for document access
- [ ] CORS configured to allow only core.affinityco.com
- [ ] Rate limiting on all API endpoints
- [ ] SQL injection protection via Prisma parameterised queries
- [ ] Audit log enabled — all user actions recorded
- [ ] Session timeout: 30 minutes inactivity
- [ ] IP allowlist for admin functions (optional — offices only)
- [ ] Azure Defender for SQL enabled
- [ ] Backup retention: 35 days (Azure SQL default)

---

## 8. Developer Briefing Summary

**What a developer receives:**
- 24 React JSX module files (complete, tested UI)
- This handover document
- Database schema (above)
- Environment config template

**What the developer needs to build:**
1. Node.js/Express REST API (~40 endpoints)
2. Prisma database schema and migrations
3. Azure AD authentication middleware
4. File upload/download handlers (Blob Storage)
5. Email notification service (Office 365)
6. Connect React frontend to API (replace mock data with API calls)

**Estimated developer time:** 5–8 working days (solo developer)

**Recommended developer profile:**
- Node.js / Express experience
- Familiarity with Azure App Service deployment
- React frontend integration (API calls, auth context)
- Prisma or similar ORM

**Freelancer cost estimate:** £2,000–4,000 for full deployment

---

## 9. Post-Deployment Phase 3 Items

| Feature | Effort | Notes |
|---|---|---|
| Microsoft Copilot integration | Medium | Azure OpenAI Service — AI assistant within app |
| Client portal payment gateway | Medium | Stripe or GoCardless integration |
| Document e-signing | Medium | DocuSign or Adobe Sign API |
| Worldcheck API integration | Medium | Direct API vs manual screening |
| Companies House API | Low | Auto-populate UK company data |
| Mobile app | High | React Native version |
| Multi-language support | Medium | Translations for Malta/Cayman staff |

---

## 10. Support & Maintenance

**Ongoing Azure costs:** £175–350/month (scales with usage)
**Recommended backups:** Daily automated (Azure SQL built-in)
**Monitoring:** Azure Application Insights (free tier sufficient initially)
**Updates:** Quarterly — new modules, regulatory changes, bug fixes

---

*Affinity Core — built entirely in Claude by Anthropic*
*Build completed: July 2025*
*Total modules: 24 built | 5 Phase 3 planned*
