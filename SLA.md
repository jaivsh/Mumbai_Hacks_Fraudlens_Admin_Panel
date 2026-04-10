# FraudLens — Service Level Agreement (SLA) (Template)

> **Important**: Template only; not legal advice. Customize thresholds, response times, exclusions, and remedies before publishing on APIX or signing with a bank.

**Last updated:** 2026-04-03  
**Provider:** FraudLens (Project Team)  
**Service:** FraudLens Admin Panel + Assistant API + Chronos APIs (“Service”)

---

## 1. Availability (uptime)
### 1.1 Target
- **Monthly uptime target:** **99.5%** for production endpoints.

### 1.2 Measurement
- Uptime is measured over a calendar month.
- Uptime = \((total minutes - downtime minutes) / total minutes\).

### 1.3 Exclusions
Downtime excludes:
- scheduled maintenance (with notice where possible);
- force majeure events;
- outages caused by Customer systems or misconfiguration;
- outages caused by third-party services outside Provider control (e.g., cloud provider regional outage), unless otherwise agreed.

---

## 2. Support hours
- **Standard support:** Mon–Fri, 10:00–18:00 IST (excluding public holidays)
- **Emergency support:** [Yes/No] (define scope)

---

## 3. Incident severity and response targets

| Severity | Example | Initial response | Update cadence | Target time to mitigate |
|----------|---------|------------------|----------------|--------------------------|
| Sev 1 | Service down / critical security issue | 1 hour | every 4 hours | 24 hours |
| Sev 2 | Major degradation / partial outage | 4 hours | daily | 3 business days |
| Sev 3 | Minor bug / non-critical issue | 2 business days | weekly | next planned release |
| Sev 4 | Questions / feature requests | 5 business days | as agreed | as agreed |

---

## 4. Maintenance windows
- Maintenance may occur with advance notice where feasible.
- Emergency maintenance may occur without notice for security or stability.

---

## 5. Backup and retention (if applicable)
- **Artifacts (reports/evidence):** stored in Customer-designated or Provider-designated cloud storage, subject to configured retention.
- **Audit trail:** stored per configured Chronos ledger retention.

---

## 6. Service credits (optional)
If you offer credits:
- <99.5% and ≥99.0%: [x]% credit  
- <99.0% and ≥98.0%: [y]% credit  
- <98.0%: [z]% credit  

Credits are the exclusive remedy for uptime failure, subject to claim process and exclusions.

---

## 7. Contact and escalation
- Support email: fancybeardarmies@gmail.com  
- Escalation: [on-call / phone / secondary email]  

