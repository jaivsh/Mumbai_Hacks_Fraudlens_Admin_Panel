import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import ReportGenerator from './sections/ReportGenerator';
import ScheduledReports from './sections/ScheduledReports';
import RecentReportsTable from './sections/RecentReportsTable';
import ScribeDocsPanel from './sections/ScribeDocsPanel';
import './ScribeDashboard.css';
import { db } from '../../firebase';

const PROMPT_TEMPLATES = {
  'Internal SOC Post-Mortem': `
    You are an AI security analyst. Based on the following JSON data for a security incident, generate a detailed, technical post-mortem report in Markdown format.
    Include: a summary, a millisecond-level timeline, all Indicators of Compromise (IoCs), the automated response taken, and the final outcome (potential vs. actual loss).
    Data: {incident_data}
  `,
  'Executive Summary': `
    You are an AI business analyst. Based on the following JSON data, write a concise, one-paragraph executive summary for a non-technical C-suite audience.
    Focus on the business impact: what was the potential financial loss, and how did our system prevent it? Do not use technical jargon.
    Data: {incident_data}
  `,
  'CERT-In Incident Report (India)': `
    You are an AI compliance officer. Based on the following JSON data, generate a structured incident report in JSON format, compliant with CERT-In (India) guidelines.
    The JSON must include keys like 'reportingOrganization', 'incidentType', 'occurrenceTime', 'detectionTime', 'severity', 'affectedSystems', 'incidentSummary', 'technicalDetails', and 'actionsTaken'.
    Data: {incident_data}
  `,
  'GDPR Data Breach Notification (Draft)': `
    You are an AI compliance specialist. Using the incident data below, draft a GDPR Article 33 breach notification for internal review. Structure it with: Incident Overview, Personal Data Impacted, Detection Time, Actions Taken, Mitigation, and Requested Follow-ups. Keep language formal and cite incident IDs.
    Data: {incident_data}
  `,
  'ISO 27001 Incident Evidence': `
    You are an ISO 27001 auditor assistant. Produce a structured evidence packet summarizing controls triggered, logs collected, identified nonconformities, and remediation steps. Output must be Markdown with sections for Control Mapping, Evidence Items, Timeline, and Next Actions.
    Data: {incident_data}
  `
};

const REPORT_RECIPIENTS = {
  'Internal SOC Post-Mortem': ['shuklajaivardhan3@gmail.com'],
  'Executive Summary': ['fancybeardarmies@gmail.com'],
  'CERT-In Incident Report (India)': ['shuklajaivardhan3@gmail.com'],
  'GDPR Data Breach Notification (Draft)': [
    'shuklajaivardhan3@gmail.com',
    'fancybeardarmies@gmail.com'
  ],
  'ISO 27001 Incident Evidence': ['shuklajaivardhan3@gmail.com'],
  'Weekly Intelligence Summary': [
    'fancybeardarmies@gmail.com',
    'shuklajaivardhan3@gmail.com'
  ]
};

const REPORT_SUBJECTS = {
  'Internal SOC Post-Mortem': '[CRITICAL] Fraudlens Alert: Post-Mortem for Incident [INCIDENT_ID]',
  'Executive Summary': '[SUMMARY] Fraudlens Success: Incident [INCIDENT_ID]',
  'CERT-In Incident Report (India)': '[ACTION REQUIRED] Draft CERT-In Report for Incident [INCIDENT_ID]',
  'GDPR Data Breach Notification (Draft)':
    '[URGENT ACTION] Draft GDPR Breach Notification for [INCIDENT_ID]',
  'ISO 27001 Incident Evidence': '[AUDIT] ISO 27001 Incident Evidence for [INCIDENT_ID]',
  'Weekly Intelligence Summary': '[INFO] Fraudlens Weekly Intelligence Brief'
};

const WEEKLY_CONFIG_ID = 'default_weekly';

const ScribeDashboard = () => {
  const heroStats = [
    { label: 'Playbooks', value: '5+' },
    { label: 'Avg. Draft Time', value: '15s' },
    { label: 'Audit Ready', value: 'Yes' }
  ];

  const [generatedReport, setGeneratedReport] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentReportMeta, setCurrentReportMeta] = useState(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [recipients, setRecipients] = useState('');
  const [recentReports, setRecentReports] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState('');
  const [reportError, setReportError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [docsOpen, setDocsOpen] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);

  useEffect(() => {
    const loadSchedule = async () => {
      try {
        const scheduleSnap = await getDoc(doc(db, 'scribe_config', WEEKLY_CONFIG_ID));
        if (scheduleSnap.exists()) {
          const data = scheduleSnap.data();
          setScheduleEnabled(Boolean(data.isEnabled));
          setRecipients((data.recipients || []).join(', '));
        } else {
          // Initialize defaults
          setRecipients(REPORT_RECIPIENTS['Weekly Intelligence Summary'].join(', '));
        }
      } catch (error) {
        console.error('Failed to load schedule config', error);
      } finally {
        setScheduleLoading(false);
      }
    };

    const loadRecentReports = async () => {
      try {
        const reportsQuery = query(
          collection(db, 'scribe_reports'),
          orderBy('generatedAt', 'desc'),
          limit(10)
        );
        const snapshot = await getDocs(reportsQuery);
        const reports = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            type: data.reportType,
            generatedOn: data.generatedAt?.toDate?.().toLocaleString() || '—',
            incidentId: data.incidentId || '—'
          };
        });
        setRecentReports(reports);
      } catch (error) {
        console.error('Failed to load reports', error);
      }
    };

    loadSchedule();
    loadRecentReports();
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(''), 2500);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  const buildSubject = (reportType, incidentId) => {
    const template = REPORT_SUBJECTS[reportType];
    return template?.replace('[INCIDENT_ID]', incidentId) || `Report for ${incidentId}`;
  };

  const handleGenerate = async ({ reportType, incidentId }) => {
    setIsGenerating(true);
    setReportError('');
    try {
      const incidentRef = doc(db, 'transactions', incidentId);
      const incidentSnap = await getDoc(incidentRef);
      if (!incidentSnap.exists()) {
        throw new Error(`No incident found for ID ${incidentId}`);
      }

      const incidentData = {
        id: incidentSnap.id,
        ...incidentSnap.data()
      };

      const promptTemplate = PROMPT_TEMPLATES[reportType];
      if (!promptTemplate) {
        throw new Error('No prompt template available for this report type.');
      }

      const prompt = promptTemplate.replace(
        '{incident_data}',
        JSON.stringify(incidentData, null, 2)
      );

      const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Missing Gemini API key. Set REACT_APP_GEMINI_API_KEY in your env file.');
      }

      const modelId =
        process.env.REACT_APP_GEMINI_MODEL?.trim() || 'models/gemini-1.0-pro';
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${modelId}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }]
              }
            ]
          })
        }
      );

      if (!geminiResponse.ok) {
        const errorBody = await geminiResponse.json();
        throw new Error(errorBody.error?.message || 'Gemini API error');
      }

      const result = await geminiResponse.json();
      const reportText =
        result.candidates?.[0]?.content?.parts?.[0]?.text ||
        'Gemini response did not contain text output.';

      const recipientsList = REPORT_RECIPIENTS[reportType] || [];
      const subject = buildSubject(reportType, incidentId);

      const docRef = await addDoc(collection(db, 'scribe_reports'), {
        reportType,
        incidentId,
        content: reportText,
        recipients: recipientsList,
        subject,
        generatedAt: serverTimestamp()
      });

      setGeneratedReport(reportText);
      setCurrentReportMeta({
        reportType,
        incidentId,
        reportId: docRef.id,
        recipients: recipientsList,
        subject
      });
      setRecentReports(prev => [
        {
          id: docRef.id,
          type: reportType,
          generatedOn: new Date().toLocaleString(),
          incidentId
        },
        ...prev
      ].slice(0, 10));
    } catch (error) {
      console.error('Failed to generate report', error);
      setReportError(error.message || 'Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedReport) return;
    const reportTitle = `${currentReportMeta?.reportType || 'Report'} - ${
      currentReportMeta?.incidentId || 'Preview'
    }`;

    const escapeHtml = (text = '') =>
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const htmlBody = escapeHtml(generatedReport).replace(/\n/g, '<br/>');
    const printableHtml = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${reportTitle}</title>
          <style>
            body { font-family: "Inter", "Segoe UI", system-ui, sans-serif; padding: 40px; line-height: 1.5; color: #111827; }
            h1, h2, h3, h4 { margin-top: 24px; }
            pre { white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <h1>${reportTitle}</h1>
          <div>${htmlBody}</div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please enable popups to download the PDF.');
      return;
    }
    printWindow.document.write(printableHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);
  };

  const handleSendEmail = () => {
    if (!currentReportMeta) return;
    // Without a backend SMTP relay we fall back to opening the default mail client.
    const recipientsList = currentReportMeta.recipients || [];
    const subject = currentReportMeta.subject || 'FraudLens Report';
    const body = encodeURIComponent(generatedReport);
    window.location.href = `mailto:${recipientsList.join(',')}?subject=${encodeURIComponent(
      subject
    )}&body=${body}`;
    setToastMessage('Opened mail client with default recipients.');
  };

  const handleSaveSchedule = async () => {
    setScheduleSaving(true);
    setScheduleStatus('');
    try {
      const recipientsArray = recipients
        .split(',')
        .map(email => email.trim())
        .filter(Boolean);

      await setDoc(
        doc(db, 'scribe_config', WEEKLY_CONFIG_ID),
        {
          isEnabled: scheduleEnabled,
          recipients: recipientsArray,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      setScheduleStatus('Settings saved!');
    } catch (error) {
      console.error('Failed to save schedule', error);
      setScheduleStatus('Failed to save settings. Check console for details.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleSeedDemoData = async () => {
    if (seedLoading) return;
    setSeedLoading(true);
    try {
      const demoIncidentId = 'demo_incident_01';
      await setDoc(
        doc(db, 'transactions', demoIncidentId),
        {
          amount: 145000,
          currency: 'INR',
          payerVpa: 'rahul@upi',
          receiverVpa: 'acme-corp@bank',
          payerUserId: 'user_001',
          receiverUserId: 'user_099',
          modelDecision: true,
          fraudScore: 0.82,
          status: 'pending',
          timestamp: serverTimestamp(),
          locationData: {
            latitude: 19.076,
            longitude: 72.8777,
            isSuspicious: true,
            deviationFromLast: 842.3
          },
          ipData: {
            ipAddress: '203.122.19.45',
            riskScore: 88,
            isBlocked: false,
            country: 'India',
            isp: 'Jio Fiber'
          },
          narrative: 'Large anomalous transfer detected from Mumbai to corporate merchant.'
        },
        { merge: true }
      );

      await setDoc(
        doc(db, 'scribe_config', WEEKLY_CONFIG_ID),
        {
          isEnabled: false,
          recipients: REPORT_RECIPIENTS['Weekly Intelligence Summary'],
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      setToastMessage('Demo incident & schedule stub created. Use ID demo_incident_01.');
    } catch (error) {
      console.error('Failed to seed demo data', error);
      setToastMessage('Unable to seed demo data. See console.');
    } finally {
      setSeedLoading(false);
    }
  };

  const handleViewReport = (reportId) => {
    // TODO: Surface modal preview by fetching Firestore doc
    console.log('View report', reportId);
  };

  const handleDownloadReport = (reportId) => {
    console.log('Download report', reportId);
  };

  const weeklyDefaultRecipients = useMemo(
    () => REPORT_RECIPIENTS['Weekly Intelligence Summary'],
    []
  );

  return (
    <div className="scribe-page">
      <div className="scribe-hero">
        <div className="scribe-hero__left">
          <p className="scribe-breadcrumb">
            <Link to="/">← Back to FraudLens Dashboard</Link>
          </p>
          <h1>Scribe Autonomous Reporting</h1>
          <p className="scribe-subtitle">
            Gemini-powered drafts for SOC, executives, and regulators—ready in seconds with the
            right recipients pre-filled.
          </p>
          <div className="scribe-hero__actions">
            <button
              className="scribe-btn outline ghost"
              onClick={handleSeedDemoData}
              disabled={seedLoading}
            >
              {seedLoading ? 'Seeding...' : 'Create Demo Incident'}
            </button>
            <button className="scribe-btn secondary" onClick={() => setDocsOpen(true)}>
              View Playbook
            </button>
            <button className="scribe-btn primary">Run Full Automation</button>
          </div>
          <div className="scribe-hero__chips">
            {heroStats.map(stat => (
              <div key={stat.label} className="scribe-chip">
                <span>{stat.value}</span>
                <small>{stat.label}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="scribe-hero__card">
          <h3>Why teams trust Scribe</h3>
          <ul>
            <li>One-click draft for SOC, CERT-In, GDPR, ISO 27001</li>
            <li>Auto-routes emails to internal reviewers—no accidental regulator sends</li>
            <li>Weekly brief toggle keeps leaders in sync</li>
          </ul>
          <p className="scribe-hero__note">Demo tip: use incident <code>demo_incident_01</code>.</p>
        </div>
      </div>

      {toastMessage && <div className="scribe-toast">{toastMessage}</div>}
      <ScribeDocsPanel open={docsOpen} onClose={() => setDocsOpen(false)} />

      <div className="scribe-grid">
        <section className="scribe-card full-span">
          <ReportGenerator
            onGenerate={handleGenerate}
            generatedReport={generatedReport}
            isGenerating={isGenerating}
            onDownload={handleDownload}
            onSendEmail={handleSendEmail}
            reportMeta={currentReportMeta}
            defaultRecipients={REPORT_RECIPIENTS}
            defaultSubjects={REPORT_SUBJECTS}
            errorMessage={reportError}
          />
        </section>

        <section className="scribe-card">
          <ScheduledReports
            scheduleEnabled={scheduleEnabled}
            recipients={recipients}
            onToggle={() => setScheduleEnabled(!scheduleEnabled)}
            onRecipientsChange={setRecipients}
            onSave={handleSaveSchedule}
            isSaving={scheduleSaving}
            saveStatus={scheduleStatus}
            defaultRecipients={weeklyDefaultRecipients}
          />
          {scheduleLoading && <p className="scribe-placeholder">Loading schedule...</p>}
        </section>

        <section className="scribe-card">
          <RecentReportsTable
            reports={recentReports}
            onView={handleViewReport}
            onDownload={handleDownloadReport}
          />
        </section>
      </div>
    </div>
  );
};

export default ScribeDashboard;

