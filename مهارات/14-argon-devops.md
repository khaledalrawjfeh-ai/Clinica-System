---
name: argon-devops
description: >
  DevOps, deployment, CI/CD, monitoring, and infrastructure for Argon Medical OS.
  Use when setting up Firebase deployment, CI/CD pipelines, backup strategies, monitoring,
  Flutter build automation, or infrastructure planning. Trigger on: deploy, CI/CD, pipeline,
  Docker, backup, monitoring, GitHub Actions, Firebase hosting, build, release, environment,
  production, staging, rollback, logging, alerting.
---

# Argon DevOps

Think like a Senior DevOps Engineer who has deployed medical systems that require 99.9%
uptime, strict environment separation, and auditable deployment processes. For a medical
system, a bad deployment can corrupt clinical data — treat every release as high-stakes.

---

## 1. Environment Strategy

### Three Environments (Mandatory)
```
Environment   Firebase Project         Purpose
─────────────────────────────────────────────────────────────────
development   argon-dev                Individual developer testing
              argon-staging            Pre-release integration testing
staging       argon-prod               Live production — NEVER test here
production    (distinct billing acct)
```

Rules:
- Production uses a **separate Firebase project** — not just a separate database.
- Staging uses production-like data volumes (anonymized/synthetic patient data).
- Never use production credentials in development or staging.
- Environment is injected via `.env` files (never hard-coded).

### Environment Config Pattern
```typescript
// firebase.config.ts
const configs = {
  development: {
    apiKey: process.env.FIREBASE_DEV_API_KEY,
    databaseURL: 'https://argon-dev-default-rtdb.firebaseio.com',
    projectId: 'argon-dev',
  },
  staging: {
    databaseURL: 'https://argon-staging-default-rtdb.firebaseio.com',
    projectId: 'argon-staging',
  },
  production: {
    databaseURL: 'https://argon-prod-default-rtdb.firebaseio.com',
    projectId: 'argon-prod',
  },
};

export const firebaseConfig = configs[process.env.ENVIRONMENT || 'development'];
```

---

## 2. CI/CD Pipeline (GitHub Actions)

### Cloud Functions CI/CD
```yaml
# .github/workflows/deploy-functions.yml
name: Deploy Cloud Functions

on:
  push:
    branches: [main]
    paths: ['functions/**']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with: { node-version: '18' }
      - run: cd functions && npm ci
      - run: cd functions && npm run lint
      - run: cd functions && npm test
      - run: cd functions && npm run typecheck

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install -g firebase-tools
      - run: cd functions && npm ci && npm run build
      - run: firebase deploy --only functions --project argon-staging
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN_STAGING }}
      - name: Run smoke tests
        run: npm run test:smoke:staging

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production        # Requires manual approval
    steps:
      - run: firebase deploy --only functions --project argon-prod
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN_PROD }}
```

### Flutter CI/CD
```yaml
# .github/workflows/build-flutter.yml
name: Flutter Build & Test

on:
  push:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: subosito/flutter-action@v2
        with: { flutter-version: '3.x' }
      - run: flutter pub get
      - run: flutter analyze
      - run: flutter test

  build-android:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: flutter build apk --release --flavor production \
               --dart-define=ENVIRONMENT=production \
               --dart-define=FIREBASE_PROJECT=argon-prod
      - uses: actions/upload-artifact@v3
        with:
          name: argon-release.apk
          path: build/app/outputs/flutter-apk/app-production-release.apk
```

---

## 3. Firebase Security Rules Deployment

```yaml
# Deploy security rules as part of CI/CD — never manually
- name: Deploy RTDB Security Rules
  run: firebase deploy --only database --project $PROJECT
  # Rules file: database.rules.json
  # NEVER deploy rules with --only functions without also validating rules
```

### Rules Testing (Required Before Every Deploy)
```bash
# Use Firebase emulator for rules testing
firebase emulators:start --only database
npm run test:rules           # Runs rules unit tests
# All rules tests must pass before production deploy
```

---

## 4. Backup Strategy

### Firebase RTDB Backup
```bash
# Automated via Google Cloud Scheduler + Cloud Functions
# Daily backup export to GCS
gsutil -m cp gs://argon-prod.appspot.com/backups/$(date +%Y%m%d)/ ./backups/

# Retention policy
# - Daily backups: 30 days
# - Weekly backups: 1 year
# - Monthly backups: 7 years (medical record legal requirement in Jordan)
```

### Backup Verification (Monthly)
```bash
# Test restore procedure on staging — document results
# 1. Download latest backup
# 2. Import to argon-staging (test project)
# 3. Verify critical paths: patient records, billing, audit logs
# 4. Document restore time (target: < 2 hours for full restore)
```

### What to Back Up
```
Priority 1 (Backup Daily, Retain 7 Years):
  - RTDB: /tenants/*/patients/
  - RTDB: /tenants/*/visits/
  - RTDB: /tenants/*/billing/
  - RTDB: /tenants/*/auditLog/
  - Firebase Storage: clinical attachments, invoices

Priority 2 (Backup Daily, Retain 1 Year):
  - RTDB: /tenants/*/lab/
  - RTDB: /tenants/*/radiology/
  - Firebase Storage: radiology non-DICOM images

Priority 3 (Backup Weekly, Retain 90 Days):
  - RTDB: /tenants/*/settings/
  - Firebase Storage: report exports
```

---

## 5. Monitoring and Alerting

### Critical Alerts (PagerDuty / SMS — Immediate Response)
```
Alert                              Threshold    Action
──────────────────────────────────────────────────────────────────
Cloud Function error rate          > 1%         On-call engineer
RTDB write latency                 > 2s avg     On-call engineer
Auth failure spike                 > 50 in 5m   Security team
Unacknowledged critical lab value  > 30 min     Escalation to clinic admin
Backup failure                     Any          On-call engineer
ISTD invoice submission failure    Any          Billing team
```

### Monitoring Stack
```
Firebase Console → Cloud Function logs, performance, crashes
Google Cloud Monitoring → RTDB metrics, function errors, latency
Firebase Crashlytics → Flutter app crashes
Custom logging → Argon audit log (in RTDB)
```

### Key Metrics to Track
```typescript
const ARGON_METRICS = {
  // Performance
  'function.latency.p95':   { warn: 2000, critical: 5000 },  // ms
  'rtdb.write.latency.p95': { warn: 500,  critical: 2000 },

  // Availability
  'function.error.rate':    { warn: 0.01, critical: 0.05 },   // %

  // Clinical safety
  'critical.unacked.count': { warn: 1,    critical: 3 },       // count
  'billing.failed.count':   { warn: 1,    critical: 5 },

  // Cost
  'rtdb.bandwidth.daily':   { warn: 1_000_000_000, critical: 5_000_000_000 }, // bytes
  'functions.invocations':  { warn: 50000, critical: 100000 }, // per day
};
```

---

## 6. Release Management

### Release Checklist
Before any production deployment:
- [ ] All tests pass (unit + integration + rules)
- [ ] Staging deployment succeeded and smoke tests passed
- [ ] Security rules reviewed for unintended changes
- [ ] Breaking changes in Cloud Functions are backward-compatible
- [ ] Database migrations (if any) are tested on staging data
- [ ] Rollback plan documented (previous function version tagged)
- [ ] Changelog updated
- [ ] Clinic admin notified (for major releases)

### Rollback Procedure
```bash
# Roll back Cloud Functions to previous version
firebase functions:list --project argon-prod
firebase deploy --only functions:functionName \
  --version <previous-version-hash> --project argon-prod
```

---

## 7. Anti-Patterns

- ❌ Deploying directly to production without staging validation.
- ❌ Using the same Firebase project for dev and production.
- ❌ Manual deployments (no CI/CD) — no audit trail.
- ❌ Storing production secrets in GitHub repo (use GitHub Secrets / Secret Manager).
- ❌ Not testing the backup restore procedure (an untested backup is no backup).
- ❌ No rollback plan before a major deployment.
- ❌ Monitoring only Firebase console (misses application-level issues).
- ❌ Deploying security rules changes without running rules tests.
