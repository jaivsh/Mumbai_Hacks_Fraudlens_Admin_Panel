import React from 'react';

const ScheduledReports = ({
  scheduleEnabled,
  recipients,
  onToggle,
  onRecipientsChange,
  onSave,
  isSaving,
  saveStatus,
  defaultRecipients
}) => {
  return (
    <div>
      <header className="scribe-section-header">
        <p className="scribe-eyebrow">Automated Periodic Reporting</p>
        <h2>Automated Periodic Reporting</h2>
        <p>Automate weekly intelligence drops to leadership and compliance teams.</p>
      </header>

      <div className="scribe-toggle">
        <span>Enable Weekly Intelligence Summary</span>
        <label className="scribe-switch">
          <input type="checkbox" checked={scheduleEnabled} onChange={onToggle} />
          <span className="scribe-slider" />
        </label>
      </div>

      <label className="scribe-form">
        <span>Recipient Email Addresses</span>
        <textarea
          rows={3}
          placeholder="security@example.com, ciso@example.com"
          value={recipients}
          onChange={(e) => onRecipientsChange(e.target.value)}
        />
        <small>
          Separate emails with commas. Default weekly recipients:{' '}
          {defaultRecipients.join(', ')}
        </small>
      </label>

      <button className="scribe-btn primary" onClick={onSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save Schedule Settings'}
      </button>

      {saveStatus && <p className="scribe-status">{saveStatus}</p>}
    </div>
  );
};

export default ScheduledReports;

