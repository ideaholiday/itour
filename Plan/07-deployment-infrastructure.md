# 07. Deployment & Infrastructure

## Implementation checkpoint — 22 Aug 2026

The CI foundation is implemented in `.github/workflows/ci.yml`. Pushes and pull requests to `main`/`master` run backend tests with a 70% line/function coverage gate, a production dependency audit, and independent Vite and Next.js production builds on Node 22. The stale Laravel/`apps/web` jobs were removed. Staging, container publishing, deployment approvals, smoke tests, blue-green rollout, and automatic rollback remain open.

## Current State
- ❌ Manual deploy script (deploy.sh)
- ❌ No staging environment
- ✅ CI quality pipeline for tests, coverage, audit, and client builds
- ✅ Automated testing on push and pull request
- ❌ No blue-green deployment
- ❌ No rollback strategy

---

## 1. GitHub Actions CI/CD Pipeline

### Setup GitHub Actions Workflow

```yaml
# .github/workflows/test-and-deploy.yml
name: Test and Deploy

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

env:
  GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  GAR_REGISTRY: us-central1-docker.pkg.dev
  SERVICE_NAME: idea-holiday-api

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_DB: marketplace_test
          POSTGRES_PASSWORD: password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          npm install
          cd backend && npm install
          cd ../frontend && npm install
      
      - name: Run linting
        run: npm run lint
      
      - name: Run backend tests
        run: cd backend && npm test
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/marketplace_test
      
      - name: Run frontend tests
        run: cd frontend && npm run test
      
      - name: Build frontend
        run: cd frontend && npm run build
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/staging'
    
    permissions:
      contents: 'read'
      id-token: 'write'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v1
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}
      
      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v1
      
      - name: Configure Docker for Artifact Registry
        run: |
          gcloud auth configure-docker us-central1-docker.pkg.dev
      
      - name: Build Docker image
        run: |
          docker build \
            -t $GAR_REGISTRY/$GCP_PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA \
            -t $GAR_REGISTRY/$GCP_PROJECT_ID/$SERVICE_NAME:latest \
            .
      
      - name: Push to Artifact Registry
        run: |
          docker push $GAR_REGISTRY/$GCP_PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA
          docker push $GAR_REGISTRY/$GCP_PROJECT_ID/$SERVICE_NAME:latest

  deploy-staging:
    needs: build-and-push
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/staging'
    
    permissions:
      contents: 'read'
      id-token: 'write'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v1
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}
      
      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v1
      
      - name: Deploy to Cloud Run (Staging)
        run: |
          gcloud run deploy idea-holiday-staging \
            --image=$GAR_REGISTRY/$GCP_PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA \
            --region=us-central1 \
            --set-env-vars=NODE_ENV=staging \
            --no-allow-unauthenticated \
            --memory=2Gi \
            --cpu=2 \
            --timeout=900

  deploy-production:
    needs: build-and-push
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    permissions:
      contents: 'read'
      id-token: 'write'
    
    environment:
      name: production
      url: https://api.ideaholiday.in
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v1
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}
      
      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v1
      
      - name: Blue-Green Deploy to Cloud Run
        run: |
          # Deploy to "green" service
          gcloud run deploy idea-holiday-green \
            --image=$GAR_REGISTRY/$GCP_PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA \
            --region=us-central1 \
            --set-env-vars=NODE_ENV=production \
            --no-allow-unauthenticated \
            --memory=4Gi \
            --cpu=4 \
            --timeout=900
          
          # Run smoke tests on green
          ./scripts/smoke-tests.sh https://idea-holiday-green.run.app
          
          # Switch traffic from blue to green
          gcloud run services update-traffic idea-holiday \
            --to-revisions idea-holiday-green=100
      
      - name: Notify deployment
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -d '{"text":"✅ Production deployment complete - '"$GITHUB_SHA"'"}'
      
      - name: Monitor for errors
        run: |
          sleep 300 # Wait 5 minutes
          ./scripts/monitor-errors.sh
```

---

## 2. Staging Environment

### Create Staging Infrastructure

```bash
# Create staging Cloud SQL instance
gcloud sql instances create idea-holiday-staging \
  --database-version=POSTGRES_14 \
  --tier=db-f1-micro \
  --region=us-central1

# Create staging bucket
gsutil mb gs://idea-holiday-staging-backups

# Deploy staging frontend
gcloud storage buckets create gs://idea-holiday-staging-frontend
gsutil -m acl ch -u AllUsers:R gs://idea-holiday-staging-frontend/**
```

### Staging Environment Config

```javascript
// .env.staging
NODE_ENV=staging
API_URL=https://api-staging.ideaholiday.in
FRONTEND_URL=https://staging.ideaholiday.in
DATABASE_URL=postgresql://...staging...
RAZORPAY_MODE=test
LOG_LEVEL=debug
FEATURE_FLAGS={"newPaymentFlow": true, "betaUI": true}
```

---

## 3. Blue-Green Deployment

### Deployment Process

```
Time  │ Blue Service (OLD)    │ Green Service (NEW)   │ Load Balancer
──────┼──────────────────────┼──────────────────────┼──────────────
T1    │ 100% traffic          │ Deployed, testing     │ → Blue (100%)
      │ Revision v42          │ Revision v43          │
──────┼──────────────────────┼──────────────────────┼──────────────
T2    │ 100% traffic          │ Smoke tests passed ✅ │ → Blue (100%)
      │ Revision v42          │ Revision v43          │
──────┼──────────────────────┼──────────────────────┼──────────────
T3    │ 0% traffic            │ 100% traffic          │ → Green (100%)
      │ Revision v42          │ Revision v43          │
──────┼──────────────────────┼──────────────────────┼──────────────
T4    │ Standby (5 min)       │ 100% traffic          │ → Green (100%)
      │ Revision v42          │ Revision v43          │
──────┼──────────────────────┼──────────────────────┼──────────────
T5    │ Old version removed   │ New production ✅     │ → Green (100%)
```

### Rollback Procedure

```bash
# If errors detected within 5 minutes
gcloud run services update-traffic idea-holiday \
  --to-revisions idea-holiday-blue=100

# Immediately routes back to old version
# Total downtime: <30 seconds
```

---

## 4. Automated Smoke Tests

```javascript
// scripts/smoke-tests.js
const axios = require('axios');

const runSmokeTests = async (baseURL) => {
  const tests = [
    {
      name: 'Health check',
      method: 'GET',
      url: '/api/health',
      expectedStatus: 200,
    },
    {
      name: 'Search transfers',
      method: 'POST',
      url: '/api/transfers/search',
      data: {
        pickupLat: 28.6139,
        pickupLng: 77.2090,
        dropLat: 28.5355,
        dropLng: 77.0392,
      },
      expectedStatus: 200,
    },
    {
      name: 'Get activities',
      method: 'GET',
      url: '/api/activities?destination=goa',
      expectedStatus: 200,
    },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const response = await axios({
        method: test.method,
        url: `${baseURL}${test.url}`,
        data: test.data,
        timeout: 5000,
      });
      
      if (response.status === test.expectedStatus) {
        console.log(`✅ ${test.name}`);
        passed++;
      } else {
        console.log(`❌ ${test.name} - Expected ${test.expectedStatus}, got ${response.status}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} - ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
};

runSmokeTests(process.argv[2]);
```

---

## 5. Pre-Deployment Checklist

```bash
#!/bin/bash
# scripts/pre-deployment-checklist.sh

echo "🚀 Pre-Deployment Checklist"
echo "============================="

# 1. Check all tests pass
echo "✓ Running tests..."
npm test || exit 1

# 2. Check code coverage
echo "✓ Checking code coverage..."
npm run test:coverage || exit 1

# 3. Lint code
echo "✓ Linting..."
npm run lint || exit 1

# 4. Check dependencies
echo "✓ Checking for vulnerabilities..."
npm audit || exit 1

# 5. Verify database migrations
echo "✓ Verifying migrations..."
npm run migrate:verify || exit 1

# 6. Build artifacts
echo "✓ Building frontend..."
cd frontend && npm run build || exit 1
cd ..

# 7. Security scan
echo "✓ Running security scan..."
docker run --rm -v $(pwd):/root aquasec/trivy:latest fs /root

# 8. Check environment config
echo "✓ Verifying environment variables..."
./scripts/verify-env.sh || exit 1

echo ""
echo "✅ All checks passed! Ready for deployment."
```

---

## 6. Monitoring After Deployment

```javascript
// scripts/monitor-errors.sh
#!/bin/bash

SERVICE_URL=$1
ERROR_THRESHOLD=5 # Allow 5 errors per minute
MONITOR_DURATION=300 # Monitor for 5 minutes

echo "Monitoring $SERVICE_URL for errors..."

start_time=$(date +%s)
error_count=0

while true; do
  current_time=$(date +%s)
  elapsed=$((current_time - start_time))
  
  if [ $elapsed -gt $MONITOR_DURATION ]; then
    echo "✅ Monitoring complete - No critical errors detected"
    exit 0
  fi
  
  # Check error logs
  error_rate=$(curl -s "$SERVICE_URL/api/metrics" | \
    grep 'http_requests_total{status="5' | \
    awk '{print $2}')
  
  if [ "$error_rate" -gt "$ERROR_THRESHOLD" ]; then
    echo "❌ High error rate detected: $error_rate"
    echo "Initiating automatic rollback..."
    ./scripts/rollback.sh
    exit 1
  fi
  
  echo "Elapsed: ${elapsed}s - Error rate: $error_rate"
  sleep 30
done
```

---

## 7. Infrastructure as Code (Terraform)

```hcl
# terraform/main.tf

resource "google_cloud_run_service" "idea_holiday_api" {
  name     = "idea-holiday-api"
  location = "us-central1"
  
  template {
    spec {
      containers {
        image = "us-central1-docker.pkg.dev/${var.project_id}/idea-holiday-api:latest"
        
        env {
          name  = "NODE_ENV"
          value = var.environment
        }
        
        env {
          name = "DATABASE_URL"
          value_from {
            secret_key_ref {
              name = "idea-holiday-database-url"
              key  = "latest"
            }
          }
        }
        
        resources {
          limits = {
            cpu    = "2"
            memory = "4Gi"
          }
        }
      }
      
      service_account_name = google_service_account.idea_holiday.email
    }
  }
  
  traffic {
    percent        = 100
    latest_revision = true
  }
}

resource "google_cloud_sql_instance" "marketplace_db" {
  name             = "idea-holiday-${var.environment}"
  database_version = "POSTGRES_14"
  
  settings {
    tier              = var.environment == "production" ? "db-custom-4-16384" : "db-f1-micro"
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    
    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      location                       = "us"
      transaction_log_retention_days = 30
    }
  }
}
```

---

## 8. Implementation Checklist

### Week 1: CI/CD Setup
- [ ] Create GitHub Actions workflow
- [ ] Set up test automation on PR
- [ ] Configure Docker image builds
- [ ] Push to Artifact Registry
- [ ] Create deployment script

### Week 2: Staging Environment
- [ ] Provision staging infrastructure
- [ ] Deploy to staging automatically
- [ ] Create staging database
- [ ] Set up staging SSL certificates
- [ ] Document staging access

### Week 3: Blue-Green Deployment
- [ ] Implement blue-green deployment
- [ ] Create smoke test suite
- [ ] Set up automatic rollback
- [ ] Test failover procedures
- [ ] Document deployment process

### Week 4: Monitoring & IaC
- [ ] Set up post-deployment monitoring
- [ ] Create infrastructure as code
- [ ] Document runbooks
- [ ] Conduct deployment drill
- [ ] Train team on procedures

---

## Success Criteria

- ✅ All PRs automatically tested
- ✅ Deployment <15 minutes
- ✅ Zero-downtime deployments
- ✅ Automatic rollback on errors
- ✅ Smoke tests pass 100%
- ✅ Production monitored continuously
- ✅ RTO <30 seconds (if rollback needed)

Timeline: **3-4 weeks**
