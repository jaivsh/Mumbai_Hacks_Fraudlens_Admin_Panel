# FraudLens — Architecture (single diagram)

One consolidated Mermaid flowchart: clients, services, data, AI, and build. Paste into [mermaid.live](https://mermaid.live) or any Mermaid-capable Markdown viewer.

```mermaid
flowchart TB
    subgraph Clients["Clients & integrators"]
        Browser["Browser — Admin SPA"]
        APK["Android app"]
        BFF["Partner backend / BFF"]
    end

    subgraph Firebase["Firebase"]
        FAuth["Authentication"]
        FS["Firestore — users, txs, incidents"]
    end

    subgraph RunAsia["Cloud Run — asia-south1"]
        Admin["fraudlens-admin-panel"]
        Fraud["fraudlens-fraud-api — FastAPI"]
        Assist["fraudlens-assistant-api — Node"]
        Scribe["fraudlens-scribe-api — Node"]
        Chronos["Chronos — audit / evidence API"]
    end

    subgraph RunUS["Cloud Run — us-central1"]
        Blackbox["fraudlens-blackbox — SMS + vishing WS"]
    end

    subgraph Job["Cloud Run Job"]
        Fed["federated-aggregator — train + publish model"]
    end

    subgraph GCS["Cloud Storage"]
        Models["Models — fraud-rf/*.pkl, manifests"]
        FedData["Federated exports — federated/nodes/*"]
        PDFs["Evidence PDFs — reports/*"]
    end

    subgraph DataAI["Data & AI"]
        BQ["BigQuery — RAG chunks + incident facts"]
        Gemini["Vertex AI — Gemini batch"]
        Live["Vertex AI — Gemini Live Bidi"]
    end

    subgraph Build["Build"]
        CB["Cloud Build"]
        AR["Artifact Registry — images"]
    end

    Browser --> FAuth
    Browser --> FS
    Browser --> Admin
    Admin --> Fraud
    Admin --> Assist
    Admin --> Scribe
    Admin --> Chronos
    APK --> BFF
    BFF --> Fraud

    Fraud --> Models
    Fed --> FedData
    Fed --> Models
    Fraud -.->|loads| Models

    Assist --> FAuth
    Assist --> Gemini
    Assist --> BQ
    Assist --> Live
    Browser -.->|WebSocket| Assist

    Scribe --> FAuth
    Scribe --> Gemini
    Scribe -.-> Chronos
    Scribe -.-> Assist

    Chronos --> PDFs
    Assist -.->|file URLs| Chronos

    Blackbox --> Gemini

    CB --> AR
    AR --> Admin
    AR --> Fraud
    AR --> Assist
    AR --> Scribe
    AR --> Fed
    AR --> Blackbox
```

---

*Dashed lines: optional, WebSocket, or config-dependent paths.*
