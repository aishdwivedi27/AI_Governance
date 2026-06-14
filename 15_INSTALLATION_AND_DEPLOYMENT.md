# EU AI Act Governance Platform - Installation & Deployment Guide

## Overview
Complete, production-ready codebase for EU AI Act compliance assessment tool.
- **Architecture**: Option D (Append-Only Log, No Database)
- **Framework**: Next.js 14 + TypeScript
- **Testing**: Jest with 93+ unit tests
- **Status**: All code reviewed, corrected, and tested

---

## Pre-Requisites

### System Requirements
- **Node.js**: 18.0.0 or higher
- **npm**: 9.0.0 or higher
- **OS**: Windows, macOS, or Linux
- **Disk Space**: ~500MB for installation
- **RAM**: 2GB minimum

### Verify Installation
```bash
node --version    # Should be v18.0.0 or higher
npm --version     # Should be 9.0.0 or higher
```

---

## Step 1: Project Setup (5 minutes)

### 1.1 Create Project Directory
```bash
mkdir -p ~/projects/eu-ai-governance
cd ~/projects/eu-ai-governance
```

### 1.2 Initialize Next.js Project
```bash
# Option A: Using create-next-app
npx create-next-app@latest . --typescript --tailwind --eslint

# Option B: Manual setup
git clone https://github.com/vercel/next.js.git
cd next.js/examples/with-typescript
npm install
```

### 1.3 Copy Corrected Files
Copy all provided files from `/mnt/user-data/outputs/` to your project:

**Library Files:**
```bash
# Correct the library files
cp 01_classification-engine.ts lib/classification-engine.ts
cp 02_assessment-log.ts lib/assessment-log.ts
```

**Page Files:**
```bash
cp 05_index.tsx pages/index.tsx
cp 08_dashboard.tsx pages/dashboard.tsx
cp 14_app.tsx pages/_app.tsx
```

**API Routes:**
```bash
mkdir -p pages/api/assessments
cp 06_api_classify.ts pages/api/classify.ts
cp 07_api_assessments_route.ts pages/api/assessments/route.ts
```

**Configuration Files:**
```bash
cp 09_package.json package.json
cp 10_jest.config.js jest.config.js
cp 11_jest.setup.js jest.setup.js
cp 12_tsconfig.json tsconfig.json
cp 13_next.config.js next.config.js
```

**Test Files:**
```bash
mkdir -p __tests__
cp 03_classification-engine.test.ts __tests__/classification-engine.test.ts
cp 04_assessment-log.test.ts __tests__/assessment-log.test.ts
```

**Data Files:**
```bash
mkdir -p data
# Copy your rules.yaml from your existing project
cp /path/to/rules.yaml data/rules.yaml
```

---

## Step 2: Dependencies Installation (3 minutes)

### 2.1 Install All Dependencies
```bash
npm install
```

### 2.2 Verify Installation
```bash
npm list
```

Expected packages:
- next@^14.0.0
- react@^18.2.0
- typescript@^5.3.3
- jest@^29.7.0
- ts-jest@^29.1.1
- yaml@^2.3.4
- uuid@^9.0.1
- tailwindcss@^3.3.6

---

## Step 3: Configuration Setup (2 minutes)

### 3.1 Create Data Directory
```bash
# Windows (PowerShell)
New-Item -ItemType Directory -Path data -Force

# macOS/Linux
mkdir -p data
```

### 3.2 Create .env.local (Optional)
```bash
# .env.local
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 3.3 Update .gitignore
```bash
cat >> .gitignore << 'EOF'
# Assessment logs
data/assessments.jsonl

# IDE
.vscode/
.idea/

# Dependencies
node_modules/
.next/
out/

# Environment
.env.local
.env.*.local

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
*.lcov
EOF
```

---

## Step 4: Verify TypeScript Configuration

### 4.1 Check tsconfig.json
```bash
npx tsc --noEmit
```

Expected output: No errors

### 4.2 Check Next.js Build
```bash
npm run build
```

Expected: ✓ Successfully compiled

---

## Step 5: Run Unit Tests (5 minutes)

### 5.1 Run All Tests
```bash
npm test
```

Expected: **93+ tests passing**

```
PASS  __tests__/classification-engine.test.ts
PASS  __tests__/assessment-log.test.ts

Test Suites: 2 passed, 2 total
Tests:       93+ passed, 93+ total
Snapshots:   0 total
Time:        X.XXXs
```

### 5.2 Watch Mode (Development)
```bash
npm run test:watch
```

### 5.3 Coverage Report
```bash
npm run test:coverage
```

Expected: Coverage > 70% across all metrics

---

## Step 6: Development Environment

### 6.1 Start Development Server
```bash
npm run dev
```

Expected output:
```
> ai-governance-platform-v2@1.0.0 dev
> next dev

  ▲ Next.js 14.0.0
  - Local:        http://localhost:3000
  ✓ Ready in 2.1s
```

### 6.2 Access Application
Open browser: **http://localhost:3000**

Expected:
- Landing page with "Start Assessment" button
- Navigation to dashboard works
- Form submits correctly

### 6.3 Test API Endpoints

**Classify Endpoint:**
```bash
curl -X POST http://localhost:3000/api/classify \
  -H "Content-Type: application/json" \
  -d '{
    "systemName": "Test System",
    "description": "Test classification",
    "industry": "Healthcare",
    "geographies": ["EU"],
    "vulnerableGroups": [],
    "fundamentalRightsImpact": false,
    "crossBorderImpact": false
  }'
```

Expected response:
```json
{
  "success": true,
  "assessment": {
    "classification": "MINIMAL_RISK",
    "confidenceScore": 50,
    "evidenceStrength": 25,
    "reasoning": "..."
  }
}
```

**Statistics Endpoint:**
```bash
curl http://localhost:3000/api/assessments?action=stats
```

Expected response:
```json
{
  "totalAssessments": 1,
  "byClassification": {
    "UNACCEPTABLE_RISK": 0,
    "HIGH_RISK": 0,
    "LIMITED_RISK": 0,
    "MINIMAL_RISK": 1,
    "GPAI": 0
  },
  "averageConfidence": 50,
  "averageEvidence": 25
}
```

---

## Step 7: Production Build

### 7.1 Build for Production
```bash
npm run build
```

Expected output:
```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Creating an optimized production build
✓ Collecting page data
✓ Generating static pages (2/2)
```

### 7.2 Start Production Server
```bash
npm start
```

### 7.3 Test Production Build
Access: **http://localhost:3000**

Expected: All functionality works identically to development

---

## Step 8: Deployment Options

### Option A: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts for configuration
```

### Option B: Docker Deployment

**Create Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY . .

# Build
RUN npm run build

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]
```

**Build and Run:**
```bash
docker build -t eu-ai-governance:1.0.0 .
docker run -p 3000:3000 eu-ai-governance:1.0.0
```

### Option C: Self-Hosted (Linux)

**1. Install Node.js**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**2. Clone Repository**
```bash
cd /opt
git clone <your-repo> eu-ai-governance
cd eu-ai-governance
```

**3. Install Dependencies**
```bash
npm ci --omit=dev
```

**4. Build Application**
```bash
npm run build
```

**5. Setup PM2 (Process Manager)**
```bash
npm install -g pm2
pm2 start npm --name "ai-governance" -- start
pm2 startup
pm2 save
```

**6. Setup Nginx (Reverse Proxy)**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**7. SSL Certificate (Let's Encrypt)**
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Step 9: Data Management

### 9.1 Assessment Log Location
```bash
# Default location
data/assessments.jsonl
```

### 9.2 Backup Strategy
```bash
# Daily backup
0 2 * * * cp data/assessments.jsonl data/assessments.jsonl.backup-$(date +\%Y\%m\%d)
```

### 9.3 Export Data
```bash
# JSON export
curl http://localhost:3000/api/assessments?action=export&format=json \
  -o assessments.json

# CSV export
curl http://localhost:3000/api/assessments?action=export&format=csv \
  -o assessments.csv
```

---

## Step 10: Monitoring & Logs

### 10.1 Development Logs
```bash
npm run dev 2>&1 | tee app.log
```

### 10.2 Production Logs (PM2)
```bash
pm2 logs ai-governance
pm2 monit
```

### 10.3 Application Health Check
```bash
curl http://localhost:3000/api/assessments?action=log-stats
```

---

## Troubleshooting

### Issue: "Module not found" errors

**Solution:**
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### Issue: Tests failing

**Solution:**
```bash
# Ensure jest is properly configured
npx jest --showConfig

# Run with verbose output
npm test -- --verbose

# Run specific test
npm test classification-engine.test.ts
```

### Issue: Port 3000 already in use

**Solution:**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :3000
kill -9 <PID>

# Or use different port
npm run dev -- -p 3001
```

### Issue: TypeScript errors

**Solution:**
```bash
# Check for type errors
npx tsc --noEmit

# Fix and rebuild
npm run build
```

---

## Performance Optimization

### Enable Caching
```javascript
// next.config.js
const nextConfig = {
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 5,
  },
}
```

### Database Connection Pooling
Already optimized with append-only log (no database)

### API Response Compression
Already enabled in Next.js

---

## Security Checklist

- [ ] Update Node.js to latest LTS
- [ ] Set secure environment variables
- [ ] Enable HTTPS in production
- [ ] Configure CORS properly
- [ ] Add rate limiting to APIs
- [ ] Implement authentication if needed
- [ ] Regular security audits
- [ ] Backup assessment data daily
- [ ] Monitor error logs for suspicious activity
- [ ] Keep dependencies updated: `npm audit fix`

---

## Maintenance

### Weekly
```bash
# Update dependencies
npm update

# Run security audit
npm audit
```

### Monthly
```bash
# Full dependency audit
npm audit --production

# Check for outdated packages
npm outdated
```

### Quarterly
```bash
# Major version updates
npm install -g npm
npm update
```

---

## Support & Documentation

### Useful Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm test` | Run all tests |
| `npm run test:watch` | Watch mode for tests |
| `npm run test:coverage` | Generate coverage report |
| `npm run lint` | Run linter |
| `npx tsc --noEmit` | Check TypeScript types |

### Files Overview

| File | Purpose |
|------|---------|
| `01_classification-engine.ts` | Core classification logic |
| `02_assessment-log.ts` | Append-only log handler |
| `08_dashboard.tsx` | Main UI component |
| `06_api_classify.ts` | Classify endpoint |
| `07_api_assessments_route.ts` | Data retrieval endpoints |
| `09_package.json` | Dependencies & scripts |
| `12_tsconfig.json` | TypeScript configuration |
| `13_next.config.js` | Next.js configuration |

---

## Getting Help

1. **Check logs**: `npm run dev` or `pm2 logs`
2. **Run tests**: `npm test -- --verbose`
3. **Type errors**: `npx tsc --noEmit`
4. **API debugging**: Check browser DevTools Network tab
5. **File permissions**: Ensure `data/` directory is writable

---

## Deployment Checklist

Before going live:

- [ ] All 93+ tests passing
- [ ] TypeScript compilation without errors
- [ ] Production build succeeds
- [ ] Environment variables configured
- [ ] HTTPS enabled
- [ ] Backup strategy in place
- [ ] Monitoring configured
- [ ] Security headers set
- [ ] Rate limiting enabled
- [ ] Error tracking setup
- [ ] Tested with sample assessments
- [ ] Documentation updated

---

## Success Criteria

After deployment, verify:

1. ✅ Dashboard loads at `/dashboard`
2. ✅ Form submission works
3. ✅ Classifications are correct
4. ✅ Data persists in `data/assessments.jsonl`
5. ✅ Export functionality works (JSON/CSV)
6. ✅ Statistics display correctly
7. ✅ API endpoints respond correctly
8. ✅ Logs are clean and informative

---

**Version**: 1.0.0 | **Last Updated**: 2024 | **Status**: Production Ready
