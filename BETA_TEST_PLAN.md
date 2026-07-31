# Noverlyn — Beta Test Plan & QA Scenarios

---

## 1. Overview
This test plan covers end-to-end verification of Noverlyn across four business vertical templates (`real_estate`, `agency`, `home_services`, `general`) and three workspace roles (`owner`, `manager`, `agent`).

---

## 2. Test Scenarios Matrix

### A. Real Estate Vertical Template
* **Target Stages:** New Lead -> Contacted -> Qualified -> Property Shared -> Viewing Scheduled -> Negotiation -> Won -> Lost
* **Terminology:** *Property Requirement*
* **Test Flow:**
  1. Create Real Estate workspace.
  2. Add lead with budget $500,000 and requirement "3BHK Villa in Downtown".
  3. Drag lead to "Viewing Scheduled".
  4. Move to "Negotiation" with no upcoming follow-up -> Verify Attention Engine flags `negotiation_no_action`.
  5. Complete follow-up task -> Verify Attention Engine resolves.

### B. Agency & B2B Services Template
* **Target Stages:** New Lead -> Contacted -> Qualified -> Discovery -> Proposal Sent -> Negotiation -> Won -> Lost
* **Terminology:** *Service Need*
* **Test Flow:**
  1. Create Agency workspace.
  2. Verify pipeline columns reflect Discovery & Proposal Sent.
  3. Move lead to "Proposal Sent" without follow-up -> Verify Attention Engine flags `negotiation_no_action` (Requires Next Action).
  4. Move lead to "Deal Won" -> Verify `won_at` timestamp.

### C. Home & Field Services Template
* **Target Stages:** New Lead -> Contacted -> Qualified -> Estimate Sent -> Job Scheduled -> Work In Progress -> Won -> Lost
* **Terminology:** *Job Requirement*
* **Test Flow:**
  1. Create Home Services workspace.
  2. Verify pipeline columns show Estimate Sent, Job Scheduled, and Work In Progress.
  3. Import CSV containing field leads -> Confirm dynamic column mapping.

### D. General Business Template
* **Target Stages:** New Lead -> Contacted -> Qualified -> Proposal -> Negotiation -> Won -> Lost
* **Terminology:** *Customer Requirement*
* **Test Flow:**
  1. Verify universal pipeline and clean workspace settings.

---

## 3. Role Security & Isolation QA
1. **Agent Scope Check:**
   - Sign in as Agent -> Verify Attention Engine & Work Queue are scoped exclusively to `auth.uid()`.
   - Verify Agent cannot change member roles or invite new managers.
2. **Multi-Tenant Isolation Check:**
   - Attempt to access Workspace A lead ID from Workspace B -> Verify RLS blocks access with `404` or `Access Denied`.

---

## 4. Mobile Responsiveness Checklist
- [x] Viewport `320px` (iPhone SE): Mobile header toggle, full-width cards.
- [x] Viewport `375px` & `390px` (iPhone 12/13/14): Work Queue action buttons, modal scrolling.
- [x] Viewport `430px` (iPhone Pro Max): Responsive table card degradation.
- [x] Viewport `768px` (iPad / Tablet): Dynamic pipeline horizontal scroll.
