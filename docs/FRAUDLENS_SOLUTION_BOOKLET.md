# FraudLens Product Documentation

### *Enhancing Trust: fraud prevention, data verification, and digital identity*

**Audience:** Reserve Bank of India — HaRBInger **Solution Development** evaluators; banks, fintechs, and partners assessing the product.

**Purpose:** This document stands alone. It describes **what FraudLens is**, **why it matters** for supervised entities and the digital payment ecosystem, **how each capability is implemented**, and **which technologies** underpin it. Benefits are stated in **qualitative** terms—faster compliance readiness, stronger auditability, reduced manual burden—without asserting fixed accuracy figures or performance benchmarks, which must always be validated per deployment.

---

## Table of contents

1. [Positioning for HaRBInger and RBI policy context](#1-positioning-for-harbinger-and-rbi-policy-context)
2. [Solution vision and problems addressed](#2-solution-vision-and-problems-addressed)
3. [Technology stack (end-to-end)](#3-technology-stack-end-to-end)
4. [Architecture: how components fit together](#4-architecture-how-components-fit-together)
5. [Feature: Real-time fraud scoring API](#5-feature-real-time-fraud-scoring-api)
6. [Feature: Feature engineering and trustworthy model inputs](#6-feature-feature-engineering-and-trustworthy-model-inputs)
7. [Feature: Model training, versioning, and cloud deployment](#7-feature-model-training-versioning-and-cloud-deployment)
8. [Feature: Cross-silo collaborative learning (federated-style)](#8-feature-cross-silo-collaborative-learning-federated-style)
9. [Feature: Role-based admin console](#9-feature-role-based-admin-console)
10. [Feature: Live alerts, case review, and operational workflow](#10-feature-live-alerts-case-review-and-operational-workflow)
11. [Feature: Map, IP management, and analytics](#11-feature-map-ip-management-and-analytics)
12. [Feature: NCRP-aligned citizen reporting assistance](#12-feature-ncrp-aligned-citizen-reporting-assistance)
13. [Feature: Chronos — audit trail, evidence integrity, DLT readiness](#13-feature-chronos--audit-trail-evidence-integrity-dlt-readiness)
14. [Feature: Scribe — AI-assisted regulatory and internal reporting](#14-feature-scribe--ai-assisted-regulatory-and-internal-reporting)
15. [Feature: FraudLens AI agent (Assistant) — RAG, voice, governance](#15-feature-fraudlens-ai-agent-assistant--rag-voice-governance)
16. [APIs, integration patterns, and extensibility](#16-apis-integration-patterns-and-extensibility)
17. [Platform extensions (deepfake, spam, fingerprints, mobile SDKs)](#17-platform-extensions-deepfake-spam-fingerprints-mobile-sdks)
18. [Security, privacy, and responsible use](#18-security-privacy-and-responsible-use)
19. [Glossary](#19-glossary)

---

## 1. Positioning for HaRBInger and RBI policy context

HaRBInger’s **Enhancing Trust** track expects solutions that strengthen **fraud resilience**, **transparency**, and **confidence** in digital financial services. FraudLens is built to align with that intent by combining:

- **Machine-assisted detection** that surfaces risky payments early, with **graded risk** so institutions can apply **proportionate** friction—not only binary allow or deny.
- **Structured compliance artefacts** that mirror **RBI fraud-reporting discipline** and **CERT-In** incident communication patterns, reducing the time from **detection** to **documented narrative**.
- **Auditability**: decisions and evidence are **linked**, **hash-verifiable**, and ready to evolve toward **distributed-ledger** deployments where multi-party immutability is required.
- **Human-in-the-loop operations**: AI **drafts** and **explains**; regulated institutions retain **approval authority** for money movement and regulatory submissions.

The product demonstrates how a **regulated-grade workflow** can be assembled on **modern cloud-native** building blocks while remaining **API-driven**, so banks and fintechs can embed scoring and governance without replacing core systems in one step.

---

## 2. Solution vision and problems addressed

| Theme | Challenge in the ecosystem | How FraudLens responds |
|--------|----------------------------|-------------------------|
| **Fraud in digital payments** | Velocity and variety of UPI and digital payment fraud strain manual review. | Deployable **scoring API** plus **analyst console** for triage, approve/block, and escalation. |
| **Regulatory reporting load** | Drafting RBI- and CERT-In-aligned narratives under time pressure is error-prone. | **Scribe** generates **structured drafts** from incident data; humans review before submission. |
| **Evidence and audit** | Proving *what was decided, when, and against which artefact* is hard when systems are siloed. | **Chronos** records **decisions** and binds **content hashes** to stored reports in **object storage**. |
| **Executive and operational alignment** | Leadership needs summaries; analysts need detail—same data, different lenses. | **Role-split dashboards** and an **AI agent** with **audience-aware** responses (analyst vs executive). |
| **Innovation without data recklessness** | Institutions hesitate to pool raw customer data. | **Federated-style aggregation** pattern: silos contribute **exports** to isolated storage; a **trusted job** merges and trains under **IAM** control—no bank-to-bank raw data sharing. |
| **Trust in digital identity** | Synthetic media and channel abuse erode confidence in remote onboarding and messaging. | **Platform extensions** (see [§17](#17-platform-extensions-deepfake-spam-fingerprints-mobile-sdks)) cover **deepfake / liveness APIs**, **spam detection**, and **multi-signal authentication** as a unified surface for partners and mobile channels. |

**Benefits (qualitative):** institutions can move from **reactive** spreadsheet-heavy reporting toward **repeatable**, **traceable** fraud operations; customers experience **fewer unnecessary blocks** when risk is **graded**; compliance teams gain **first drafts** that accelerate internal approval—not a substitute for legal sign-off, but a **material reduction** in blank-page time.

---

## 3. Technology stack (end-to-end)

| Layer | Technology | Role in FraudLens |
|--------|------------|---------------------|
| **Admin experience** | React (SPA) | Operator and executive UI: alerts, map, IP tools, Scribe, Assistant widget. |
| **Identity (console)** | Firebase Authentication | Sign-up, JWT issuance, protected routes; Assistant verifies tokens server-side. |
| **Operational data** | Firebase / Firestore | Users, transactions, incidents, roles—per deployment configuration. |
| **Fraud scoring service** | Python, FastAPI, scikit-learn (Random Forest), joblib, Pydantic | REST predict and batch-predict endpoints; strict request validation; model bundle load from disk or cloud object storage. |
| **ML operations** | Google Cloud Storage, Cloud Build, Artifact Registry, Cloud Run, Cloud Run Jobs | Immutable model artefacts, container builds, stateless API hosting, scheduled or triggered training jobs. |
| **Audit / evidence service** | Node.js, Express, Google Cloud Storage client, PDFKit, SHA-256 hashing | Chronos: PDF generation, upload, metadata, hash verification, decision ledger API. |
| **AI agent backend** | Node.js, Vertex AI (Gemini), BigQuery vector search (optional), WebSocket proxy to Vertex Live | Chat, RAG, citations, bidirectional voice session. |
| **Scribe (report generation)** | Template-driven prompts + Gemini | Structured JSON and Markdown outputs per report type. |

This stack is **cloud-native**, **API-first**, and **separable**: scoring, audit, and assistant can scale and patch independently—important for **operational resilience** and **clear blast-radius** boundaries.

---

## 4. Architecture: how components fit together

**Flow in words:** Payment channels (or a demonstration data source) feed **transactions** into the admin experience. High-risk items appear in **Live Alerts**. Analysts **approve** or **block**; on block, **Scribe** can **auto-draft** RBI-, CERT-In-, and executive-aligned outputs. **Chronos** captures the **decision** and optional **report fingerprints** so later review can ask: *was this exact document the one on record?* The **Assistant** answers questions using **retrieved context** where configured, and can run **live voice** for briefings. The **Fraud API** is the **embeddable scoring spine** for any channel that can supply the agreed feature payload.

**Benefit:** a **coherent story** from **signal** → **decision** → **documentation** → **audit**, rather than four disconnected tools.

---

## 5. Feature: Real-time fraud scoring API

**Product importance:** Supervised entities need a **deterministic, versioned** scoring contract they can place in front of payment initiation or post-authorisation review—without exposing model internals to untrusted clients.

**Implementation:** A **Fraud Detection** service exposes JSON POST endpoints. Each request is validated against a **transaction schema**: identifiers, amounts, timestamps, payer and beneficiary rail identifiers (e.g. VPA, IFSC), channel and payment-type enums, and **pre-computed velocity and device-stress fields** (rolling sums, failure counts, device crowding proxies). The service loads a **bundle** containing the trained **Random Forest** and a **label encoder** for beneficiary-bank prefixes. Inference returns a **fraud label**, a **probability of fraud**, and a **discrete risk band** (low, medium, high) derived from **configurable** probability thresholds—so policy teams can tune **friction** without retraining.

**Batch path:** Batch prediction supports **bulk replay** for investigations or backtesting.

**Operational behaviour:** Missing model artefacts yield a clear **service-unavailable** response for monitoring. Cross-origin access is configurable for controlled web playgrounds.

**Benefits:** **Consistent** risk language across channels; **graded** responses support **step-up** and **manual review** instead of a single brittle cutoff; **batch** scoring supports **after-the-fact** analysis and **model governance** workflows.

---

## 6. Feature: Feature engineering and trustworthy model inputs

**Product importance:** Regulators and model-risk teams care that models are trained on **features that do not trivially leak the label** and that **training and serving** use the **same definitions**.

**Implementation:** A dedicated **feature pipeline** defines the ordered column set used at train and inference time—velocity and amount transforms, **calendar patterns** (weekend, night, business hours), **channel encodings**, **beneficiary bank prefix** encoding with an explicit **unknown bucket** for unseen institutions, and **stress** indicators (recent failures, consecutive failures, device user count). Certain **post-hoc outcome fields** are deliberately **excluded** so historical exports cannot **artificially inflate** model performance.

**Benefits:** **Explainable data lineage** from raw event to vector; **reduced spurious accuracy** from leakage; **clear integration contract** for banks’ feature stores—misaligned rolling windows are a common cause of production drift; here the contract is **explicit** and stable across environments.

---

## 7. Feature: Model training, versioning, and cloud deployment

**Product importance:** Institutions must **retrain**, **rollback**, and **prove** which model version was live when a decision was taken.

**Implementation:** A **training pipeline** produces a **serialised bundle** (model plus encoder). A **model store** publishes **current** and **historical** artefacts plus **manifest** metadata to object storage. The Fraud API loads from that store in production or from a local artefact in development. Optional **secured** training-by-upload suits lab settings; production patterns favour **jobs** and **pipelines** instead of open training endpoints on the public internet.

**Benefits:** **Reproducible** deployments; **audit-friendly** artefact history; **operational simplicity**—stateless containers pull the **pinned** object path.

---

## 8. Feature: Cross-silo collaborative learning (federated-style)

**Product importance:** RBI-supervised institutions are rightly cautious about **raw data pooling**. FraudLens illustrates a **governance-conscious** path: **each silo** places an **anonymised export** in a **dedicated storage prefix**; only an **aggregator job** with appropriate **identity and access management** can read those exports and train a **joint** model—**no peer-to-peer exchange** between banks.

**Implementation:** A **Cloud Run Job** (or equivalent orchestrated task) downloads each node’s export URI, merges training rows, trains a **global Random Forest**, publishes to the same layout as the live Fraud API, and writes a **federated round manifest** (sources, merge statistics, metrics) for traceability.

**Design clarity:** This pattern is **cross-silo centralised training with isolated uploads**, **not** classical federated learning with **gradient-only** exchange. That distinction is intentional and documented for model-risk reviewers. It remains **valuable** because it shows **privacy-aware workflow design** and a **credible on-ramp** to stricter federated or differential-privacy methods later.

**Benefits:** **Collaborative lift** in detection quality **without** asking banks to expose full databases to each other; **manifests** support **supervisory storytelling** about **aggregate contribution** and **how models were built**.

---

## 9. Feature: Role-based admin console

**Product importance:** **Separation of duties** is a baseline control for fraud and compliance tooling.

**Implementation (onboarding and access):**

- New users **sign up** with a stated intent (IT, Leadership, or other).
- The **first user** approved in the system becomes **IT Admin** automatically.
- Later signups enter a **pending** state until an IT admin assigns a role (**IT Admin**, **IT Analyst**, or **Leadership / Executive**) and approves or rejects them.
- **Rejected** users see access denied and may only sign out.

**Implementation (routes and capabilities):**

| Role | Primary experience | Capabilities |
|------|-------------------|--------------|
| **IT Admin / IT Analyst** | Operational dashboard | Live Alerts, Case Review (approve/block), Map View, IP Management, Analytics, database visibility, **User Management** (pending users, role assignment), **Scribe** with **all** report types |
| **Leadership (Executive)** | Executive dashboard | KPIs, charts, recent fraud incidents, **Reports** limited to **Executive Summary** only—no Live Alerts queue, map, IP admin, or user management |
| **Pending** | Pending-approval screen | Wait until an administrator acts |
| **Rejected** | Pending screen | Access denied message; sign out only |

**Route protection:** Users who try to open a route outside their role are **redirected** to their designated home (e.g. executives cannot open the full analyst dashboard).

**Benefits:** **Least-privilege** UX; **cleaner audits** of who could do what; **faster executive consumption** without operational noise.

---

## 10. Feature: Live alerts, case review, and operational workflow

**Product importance:** Detection is useless without **triage** and **documented action**.

**Implementation:** The **Live Alerts** surface lists transactions with search and filters by severity and status. Selecting a row opens **Case Review** with full context. **Approve** and **block** update case state and, in a demonstration deployment, adjust **demo balances** (in production, the same intents would invoke **core banking or ledger APIs**). When a case is **blocked**, the operator may be prompted to **generate compliance reports** for that incident; accepting creates **RBI-aligned**, **CERT-In-aligned**, and **executive** drafts and stores them for preview, download, and email—linking **operational outcome** to **compliance output**.

**Fraud API Playground:** Authorised users can send representative payloads to the deployed scoring endpoint to **validate integration**—useful for technical due diligence and partner onboarding.

**Benefits:** **Shorter time to decision** for analysts; **immediate** start on **regulatory drafts** at the moment of block; **repeatable** end-to-end trust operations.

---

## 11. Feature: Map, IP management, and analytics

**Product importance:** Fraud often has a **spatial** and **network** footprint; supervisors expect institutions to **see patterns** beyond single transactions.

**Implementation:** **Map View** plots location-bearing transactions with filters by risk and type. **IP Management** reads from an **IP log** store to list addresses, **block or unblock**, and filter—supporting **network hygiene** and investigation. **Analytics** summarises volumes and risk distribution. **Database information** views expose collection-scale health for operations and demonstrations.

**IP fluctuation narrative:** Rapid **changes of IP** or **geography** across related sessions is a strong indicator of **session takeover** and **mule** activity. The console delivers the **operational layer**; extending the **scoring API** with **IP-derived features** or a **parallel risk score** is a natural evolution—same **policy engine**, richer **signal**.

**Benefits:** **Investigator situational awareness**; **faster** linking of related abuse; **foundation** for richer **network analytics** without replacing the core scorer.

---

## 12. Feature: NCRP-aligned citizen reporting assistance

**Product importance:** Victims and institutions are encouraged to use the **National Cyber Crime Reporting Portal**. Friction in **accurate narrative submission** delays help.

**Implementation:** For **blocked** or **model-flagged** cases, **Report to NCRP** opens the official portal in a separate context and presents **pre-structured narrative text** (identifiers, rails data, risk context, location and IP where available) for **copy-paste** into the government form. **Submission is not automated**—the human filer remains responsible for filing, which is appropriate for **legal and evidentiary** accuracy.

**Benefits:** **Higher-quality first reports**; **consistency** with internal case data; **alignment** with national cyber-reporting norms while preserving **legal responsibility** with the filer.

---

## 13. Feature: Chronos — audit trail, evidence integrity, DLT readiness

**Product importance:** Supervisors and internal audit ask for **integrity** and **traceability** of decisions and evidence.

**Implementation:** **Chronos** (audit service) provides:

- **PDF generation and upload** to private object-storage paths organised by incident and report type.
- **Metadata and SHA-256** retrieval for stored artefacts.
- **Streaming read** for inline viewing while keeping buckets private.
- **Decision events** appended to a **ledger** (demonstration deployments may use an in-memory append log; production targets hardened storage or distributed ledger).
- Each decision may reference **linked reports** with **object path**, **content hash**, and **report type**.
- **Verification API:** confirm whether a given **hash** appears on a **recorded decision** for an incident—supporting *“was this the document on record?”* reviews.

**Hyperledger Fabric roadmap:** The product architecture anticipates **Hyperledger Fabric** (or equivalent DLT) for **distributed consensus** and **multi-organisation endorsement** when two regulated parties must agree on **immutable** event ordering. The current design is **aligned** with that future: **hash-linked decisions** and **object storage** map cleanly to anchoring summaries or events on-chain. DLT production claims should match what is actually deployed in each environment.

**Benefits:** **Tamper-evident linkage** between **decisions** and **artefacts**; **path to DLT** where policy demands it; **demonstrable** integrity without overstating production ledger deployment.

---

## 14. Feature: Scribe — AI-assisted regulatory and internal reporting

**Product importance:** Timely, **well-structured** fraud and incident communication supports **RBI expectations**, **CERT-In** processes, **board oversight**, and **international** privacy and security frameworks where applicable.

**Implementation:** **Template-driven prompts** (per report type) drive **Gemini** outputs. **Email subjects** and **default recipient lists** are configurable per deployment so the right authority receives each artefact.

**Who receives which report (concerned authorities):**

| Report type | Typical owner / recipient | Role |
|-------------|---------------------------|------|
| **RBI Fraud Report (FMR-style)** | IT / Compliance | Prepares submission to RBI; reporting office depends on **amount tier** per RBI Master Circular rules (human-verified before filing). |
| **CERT-In Incident Report (India)** | IT / CISO / Compliance | Timely submission to CERT-In per applicable directions. |
| **Executive Summary** | Leadership (C-suite, risk head) | Non-technical decision briefing. |
| **Internal SOC Post-Mortem** | IT Security / SOC | Internal learning and operational evidence. |
| **GDPR Data Breach Notification (draft)** | DPO / Legal | Internal draft before supervisory notification where GDPR applies. |
| **ISO 27001 Incident Evidence** | IT / Audit | Control mapping and evidence for audits. |
| **NCRP** | — | Handled via dashboard **Report to NCRP** flow (copy-paste to portal), not typically an email from Scribe. |

**Auto-generated when an incident is blocked (operator consent):** **RBI Fraud Report**, **CERT-In Incident Report**, and **Executive Summary**—the default **autonomous set**. Stored drafts can be **previewed**, **downloaded**, and **sent** from the Scribe workspace. **Fully unattended email** can be added via a backend hook on incident state change; the UI remains the place to **preview, edit, or resend**.

**Report content shapes:**

- **RBI FMR-style** — Structured JSON: organisation, amount, **reporting-office routing** per RBI tiering logic in the template, fraud classification, occurrence and detection times, affected systems, summary, impact, actions, contacts.
- **CERT-In** — JSON aligned to **Annexure A**-style fields and a **controlled incident-type vocabulary** (e.g. scanning, unauthorised access, phishing, payment-system attacks, data breach, cloud-related incidents, other categories as per template).
- **Executive Summary** — JSON: headline, plain summary, amount context, outcome state, business bullet points.
- **SOC Post-Mortem** — Markdown with fixed sections: executive summary, timeline, root cause, impact, lessons, follow-ups, indicators of compromise.
- **GDPR draft** — Markdown sections for nature of breach, data impacted, DPO contacts, consequences, measures, timeline.
- **ISO evidence** — Markdown: control mapping, evidence items, timeline, next actions.
- **Weekly Intelligence Summary** — Periodic briefing to leadership and compliance; scheduling and recipients are configurable; body content can be tied to weekly aggregates as the deployment matures.

**Benefits:** **Faster** internal review cycles; **consistent** structure across incidents; **lower** transcription error between systems; **machine-readable** JSON for **downstream automation** where institutions connect forms and workflows.

---

## 15. Feature: FraudLens AI agent (Assistant) — RAG, voice, governance

**Product importance:** Operators need **answers grounded in institutional data**, not generic chat; executives need **concise**, **voice-friendly** briefings.

**Implementation:** The **Assistant API** verifies **Firebase JWTs**, invokes **Vertex AI (Gemini)** for generation, and optionally uses **BigQuery** for **retrieval-augmented generation**: **embedded document chunks** in a **chunks table** with a **vector index**, plus a **structured facts table** (e.g. per-incident key fields) for **deterministic shortcuts** when the user question maps to known data. Responses can include **citation hooks** to evidence (incident identifiers, report types, storage paths, hashes, viewer URLs) when Chronos and ingestion pipelines are connected.

**Live voice:** A **WebSocket** endpoint proxies **Vertex Gemini Live** for **bidirectional** audio and text; the admin **chat widget** implements the client. **Audience** parameters adjust **depth and tone** (analyst versus executive).

**Production note for Cloud Run:** Long-lived WebSockets typically need **session affinity**, **sufficient request and idle timeouts**, and **CPU allocation** that avoids throttling the instance to zero during quiet moments of a voice session—otherwise connections may drop unexpectedly.

**Benefits:** **Faster** ramp for new analysts; **repeatable** explanations of **why** a case looks risky; **accessibility** for leaders via **voice**; **grounding** (when RAG is enabled) reduces **unfounded** policy statements—always **subordinate** to human judgment for **regulated actions**.

---

## 16. APIs, integration patterns, and extensibility

**Surfaces:**

- **Fraud REST API** — single and batch predict, health, model metadata; optional secured training upload in controlled environments.
- **Chronos REST** — decision commit, per-incident history, document upload, metadata, streaming file access, hash verification against ledger decisions.
- **Assistant REST** — chat, optional ingestion endpoints for reports and facts; **WebSocket** for live voice.
- **Scribe** — primarily through the admin application; a **dedicated report microservice** may be deployed separately where partners require isolation.

**Integration pattern:** Channels invoke the **Fraud API** from a **trusted backend**; end-user browsers and mobile apps do **not** hold model-training secrets. Chronos receives **decisions** from the same administrative trust domain as the core fraud workflow.

**Benefits:** **Partner-friendly** integration; **OpenAPI** descriptions can accompany commercial packages for **marketplace** and **architecture** reviews; **modular** scaling per component.

---

## 17. Platform extensions (deepfake, spam, fingerprints, mobile SDKs)

These capabilities complete the **trust story** for **digital identity** and **omnichannel** abuse. They are described as the **intended product envelope**; heavy media processing and attestation often live in **dedicated services** or **native SDKs**, while **Chronos** and the **Fraud API** remain the **policy and audit spine**.

| Extension | Product importance | Technical direction |
|-----------|-------------------|---------------------|
| **Deepfake / liveness APIs** | Protect **onboarding** and **high-risk** actions against **synthetic presentation**. | Server- or device-attested sessions; scores and **audit identifiers** logged to Chronos. |
| **Messaging spam / phishing** | OTP theft and **brand impersonation** erode UPI and SMS trust. | Stream classifiers over **SMS / RCS / push**; quarantine or user nudges **before** money moves. |
| **IP volatility & session integrity** | Complements transaction scores with **session-level** anomaly. | Feature store or rules engine **composed** with fraud probability from the core API. |
| **Multi-fingerprint authentication** | **Step-up** when risk rises—device, behaviour, app attestation, hardware keys. | Policy orchestration; Chronos records **which factors** applied at decision time. |
| **Mobile SDKs** | Banks want **one integration surface** for **risk and integrity** on iOS and Android. | Thin native clients calling **institution-hosted** backends; optional **offline queue** for poor networks. |
| **Web SDK** | Parity for **internet banking** and **checkout**. | JavaScript beacons and **server-mediated** scoring; browser security boundaries respected. |

**Benefits:** **Unified** trust story; **consistent** audit across **channels**; resilience against **synthetic media** and **messaging** attacks that **transaction-only** models underweight.

---

## 18. Security, privacy, and responsible use

- **Least privilege** on cloud service accounts; **separate object prefixes** per silo for federated training exports.  
- **PII minimisation** in training exports; treat the **aggregator** environment as **highly sensitive**.  
- **Retain manifests** for **model provenance** and federated rounds.  
- **AI outputs** are **drafts and aids**; **blocking funds** and **regulatory filing** remain under **institutional control** and **legal review**.  
- **Evidence integrity:** combine Chronos content hashes with **storage-native** integrity mechanisms for the strongest assurance story.

Commercial deployments should pair the product with **customised legal artefacts**: terms of use, privacy notice, data processing agreement, service levels, confidentiality, and acceptable-use policy appropriate to the jurisdiction and entity type.

---

## 19. Glossary

| Term | Meaning |
|------|---------|
| **HaRBInger** | RBI programme — *Innovation for Transformation*; FraudLens aligns with **Enhancing Trust**. |
| **Chronos** | Audit service: decisions, linked hashes, object-storage artefacts, verification APIs. |
| **Scribe** | AI-assisted drafting for RBI-, CERT-In-, executive-, SOC-, GDPR-, and ISO-style outputs. |
| **Federated-style round** | Isolated silo exports merged by a **trusted job**—not gradient-only classical federated learning. |
| **NCRP** | National Cyber Crime Reporting Portal. |
| **RAG** | Retrieval-augmented generation over institutional document chunks and structured facts. |
| **Vertex Live** | Google’s low-latency bidirectional model API for voice and text. |
| **FMR-style** | Fraud monitoring report narrative aligned to RBI circular conventions. |

---

*FraudLens offers a **practical, technically explicit** path from **detection** to **documentation** to **audit**, aligned with **RBI’s trust agenda** and suitable for **supervised entities** to adapt within their own **risk and compliance** frameworks.*
