# Noverlyn — Production Deployment & Beta Launch Checklist

**Application Domain:** `https://app.noverlyn.com`  
**Supabase Project Reference:** `hbydcxruvsczaudxjqim`

---

## 1. Supabase Database & Migration Status
- [x] All 11 migrations compiled and verified:
  - `20260731000000_phase1_foundation.sql` (Auth & Multi-Tenant RLS)
  - `20260731000001_phase2_lead_core.sql` (Lead Operations & Follow-Ups)
  - `20260731000002_phase3_attention_engine.sql` (Attention Engine & Work Queue)
  - `20260731000003_phase4_pipeline_team_insights.sql` (Pipeline & Team Operations)
  - `20260731000004_fix_team_invitation_rpcs.sql` (Team Invitation Hotfix)
  - `20260731000005_fix_invite_acceptance_revoke.sql` (Invite Performance Hotfix)
  - `20260731000006_invite_status_ux_fix.sql` (Fast Token Validation RPC)
  - `20260731000007_remove_member_workflow.sql` (Soft Member Removal)
  - `20260731000008_phase5_mvp_readiness.sql` (Bulk Leads & CSV Import RPCs)
  - `20260731000009_fix_csv_import_validation.sql` (CSV Import Validation Hotfix)
  - `20260731000010_core_vertical_templates.sql` (Core Vertical Templates & Dynamic Pipeline Stages)
- [ ] Execute `20260731000010_core_vertical_templates.sql` in live Supabase SQL Editor.

---

## 2. Environment Variables Configuration
Set the following environment variables in Vercel Deployment Settings:
```env
VITE_SUPABASE_URL=https://hbydcxruvsczaudxjqim.supabase.co
VITE_SUPABASE_ANON_KEY=your_production_anon_key
VITE_APP_URL=https://app.noverlyn.com
```

---

## 3. Supabase Auth Production URL Configuration
Navigate to **Supabase Dashboard -> Authentication -> URL Configuration**:
* **Site URL:**
  `https://app.noverlyn.com`
* **Redirect URLs:**
  - `https://app.noverlyn.com/**`
  - `https://app.noverlyn.com/invite/**`
  - `http://localhost:5173/**` *(For local development)*

---

## 4. Vercel Hosting & SPA Rewrite Rules
- [x] `vercel.json` rewrite rule verified for single-page app routing:
  ```json
  {
    "rewrites": [
      {
        "source": "/(.*)",
        "destination": "/index.html"
      }
    ]
  }
  ```
- [x] Build command: `npm run build`
- [x] Output directory: `dist`

---

## 5. Pre-Launch Sanity Test Flows
1. **Signup & Onboarding:**
   - Sign up new user -> Choose Business Vertical (Real Estate, Agency, Home Services, General) -> Create Workspace.
2. **Lead Operations & CSV Import:**
   - Upload sample CSV -> Map columns -> Verify duplicate skipping -> Confirm import.
3. **Team Invitations & Roles:**
   - Invite Sales Agent -> Copy URL -> Accept invitation in private window -> Verify Workspace access.
4. **Work Queue & Attention Engine:**
   - Log contact -> Complete overdue follow-up -> Verify queue updates.
5. **Visual Pipeline:**
   - Drag lead between dynamic stages -> Verify stage change RPC -> Test Mark Lost modal.
