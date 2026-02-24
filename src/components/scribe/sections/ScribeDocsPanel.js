import React from 'react';

const ScribeDocsPanel = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="scribe-modal-backdrop" onClick={onClose}>
      <div className="scribe-modal" onClick={e => e.stopPropagation()}>
        <header className="scribe-modal-header">
          <div>
            <p className="scribe-eyebrow">Documentation</p>
            <h2>How to use Scribe</h2>
          </div>
          <button className="scribe-btn outline" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="scribe-docs-section">
          <h3>What is Scribe?</h3>
          <p>
            Scribe is your on-call compliance analyst for HaRBInger 2025. Give it any incident ID and it
            produces RBI Fraud Reports (FMR-style), CERT-In drafts, executive summaries, SOC post-mortems,
            GDPR notifications, and ISO 27001 evidence packs—ready to download or email.
          </p>
        </section>

        <section className="scribe-docs-section">
          <h3>Who receives what (concerned authorities)</h3>
          <p>
            <strong>IT / Compliance</strong> get RBI Fraud Report, CERT-In Report, SOC Post-Mortem, and ISO evidence (they submit to RBI/CERT-In as required). <strong>Leadership</strong> get the Executive Summary. <strong>DPO / Legal</strong> get the GDPR draft. Recipients are configured per report type so each doc goes to the right authority. See <strong>SCRIBE_AUTHORITIES.md</strong> in this folder for the full list and how to make Scribe autonomous.
          </p>
        </section>

        <section className="scribe-docs-section">
          <h3>How to generate a report</h3>
          <ol>
            <li><strong>Pick a template</strong> that matches your audience (RBI/CERT-In, C-suite, SOC, regulator, auditor).</li>
            <li><strong>Enter the incident ID</strong> you want summarized.</li>
            <li><strong>Click “Generate &amp; Preview”</strong> and let Gemini craft the narrative.</li>
          </ol>
          <p>
            The preview shows the full draft. Use “Download” to keep a copy or “Send Email” to share
            it with the default recipients (no copy-pasting addresses anymore).
          </p>
        </section>

        <section className="scribe-docs-section">
          <h3>Weekly intelligence in one switch</h3>
          <p>
            Turn on “Automated Periodic Reporting” to have Scribe prepare a weekly brief for the exec
            team. Add or remove recipients in plain English, hit save, and the schedule stays in sync
            for everyone.
          </p>
        </section>

        <section className="scribe-docs-section">
          <h3>Keep control with the report log</h3>
          <p>
            The “Recently Generated Reports” table is your audit trail—see who generated what, when,
            and jump back into any artifact with a single click if leadership asks for it mid-meeting.
          </p>
        </section>

        <section className="scribe-docs-section">
          <h3>Why teams love it</h3>
          <ul>
            <li>Transforms raw incident telemetry into clean narratives instantly.</li>
            <li>Auto-routes drafts to internal reviewers so nothing goes straight to regulators.</li>
            <li>Saves hours per incident, freeing analysts to focus on real containment.</li>
            <li>Perfect demo story: “One click from breach data to board-ready briefing.”</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default ScribeDocsPanel;

