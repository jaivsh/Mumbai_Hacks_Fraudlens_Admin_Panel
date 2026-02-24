import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
import { useAuth } from '../../contexts/AuthContext';
import {
  PROMPT_TEMPLATES,
  REPORT_RECIPIENTS,
  REPORT_SUBJECTS
} from './reportFormats';
import { parseReportContent, ReportDocument, getReportPrintHtml } from './ReportDocument';
import './ScribeDashboard.css';
import { db } from '../../firebase';

const EXEC_REPORT_OPTIONS = ['Executive Summary'];

const WEEKLY_CONFIG_ID = 'default_weekly';

const ScribeDashboard = () => {
  const { isExec } = useAuth();
  const location = useLocation();
  const isExecRoute = location.pathname === '/exec/reports';
  const reportOptionsForRole = isExec || isExecRoute ? EXEC_REPORT_OPTIONS : null;

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
        throw new Error(`No incident found for ID ${incidentId}. Use an ID from your transactions list or create a demo incident.`);
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

      const apiKey = process.env.REACT_APP_GEMINI_API_KEY?.trim();
      if (!apiKey) {
        throw new Error('Missing Gemini API key. Add REACT_APP_GEMINI_API_KEY to .env (get a key at https://aistudio.google.com/apikey) and restart npm start.');
      }

      const modelId =
        process.env.REACT_APP_GEMINI_MODEL?.trim() || 'models/gemini-2.5-flash';
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
        const msg = errorBody.error?.message || 'Gemini API error';
        const hint = /api key|invalid.*key/i.test(msg)
          ? ' Get a valid key at https://aistudio.google.com/apikey, set REACT_APP_GEMINI_API_KEY in .env, and restart (npm start).'
          : '';
        throw new Error(msg + hint);
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
        { id: docRef.id, type: reportType, generatedOn: new Date().toLocaleString(), incidentId },
        ...prev
      ].slice(0, 10));
    } catch (error) {
      console.error('Failed to generate report', error);
      let message = error.message || 'Failed to generate report';
      if (message.includes('API key not valid') || message.includes('invalid API key')) {
        message = 'Gemini API key is invalid or expired. Get a new key at https://aistudio.google.com/apikey, set REACT_APP_GEMINI_API_KEY in your .env file, then restart the app (npm start).';
      }
      setReportError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedReport || !currentReportMeta) return;
    const reportTitle = `${currentReportMeta.reportType} - ${currentReportMeta.incidentId}`;
    const parsed = parseReportContent(currentReportMeta.reportType, generatedReport);
    const printableHtml = getReportPrintHtml(
      currentReportMeta.reportType,
      parsed,
      currentReportMeta.incidentId,
      reportTitle
    );

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
            {isExecRoute ? (
              <Link to="/exec">← Back to Executive Dashboard</Link>
            ) : (
              <Link to="/">← Back to FraudLens Dashboard</Link>
            )}
          </p>
          <h1>Scribe Autonomous Reporting</h1>
          <p className="scribe-subtitle">
            Gemini-powered drafts for SOC, executives, and regulators—ready in seconds with the
            right recipients pre-filled.
          </p>
          <div className="scribe-hero__actions">
            {!isExecRoute && (
              <>
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
              </>
            )}
            {isExecRoute && (
              <button className="scribe-btn secondary" onClick={() => setDocsOpen(true)}>
                View Playbook
              </button>
            )}
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
            <li>One-click draft for RBI (FMR-style), CERT-In, Executive Summary, SOC, GDPR, ISO 27001</li>
            <li>Auto-routes emails to internal reviewers—no accidental regulator sends</li>
            <li>Weekly brief toggle keeps leaders in sync</li>
          </ul>
          <p className="scribe-hero__note">
            Use an incident ID from your transactions list, or <code>demo_incident_01</code> after creating a demo incident.
          </p>
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
            reportOptions={reportOptionsForRole}
          />
        </section>

        {!isExecRoute && (
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
        )}

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

