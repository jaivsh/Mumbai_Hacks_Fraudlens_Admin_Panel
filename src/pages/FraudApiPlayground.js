import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, RefreshCw, ExternalLink, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getFraudApiBaseUrl, predictFraud, fetchFraudModelInfo } from '../services/fraudApiService';

const defaultForm = {
  txn_id: 'demo-txn-001',
  AMOUNT: 5000,
  amount_sum_1h: 12000,
  TXN_TIMESTAMP: new Date().toISOString().slice(0, 19),
  PAYER_VPA: 'payer@okaxis',
  BENEFICIARY_VPA: 'merchant@ptyes',
  PAYER_IFSC: 'UTIB0001234',
  BENEFICIARY_IFSC: 'SBIN0005678',
  INITIATION_MODE: 'APP',
  TRANSACTION_TYPE: 'P2P',
  device_user_count: 2,
  txn_count_1h: 4,
  failed_txn_count_24h: 0,
  consecutive_failures: 0
};

export default function FraudApiPlayground() {
  const { profile, signOut } = useAuth();
  const baseUrl = getFraudApiBaseUrl();
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);

  const loadInfo = async () => {
    setInfoLoading(true);
    const r = await fetchFraudModelInfo();
    setModelInfo(r);
    setInfoLoading(false);
  };

  useEffect(() => {
    if (baseUrl) loadInfo();
  }, [baseUrl]);

  const onChange = (key) => (e) => {
    const v = e.target.value;
    if (['AMOUNT', 'amount_sum_1h', 'device_user_count', 'txn_count_1h', 'failed_txn_count_24h', 'consecutive_failures'].includes(key)) {
      const n = key === 'AMOUNT' || key === 'amount_sum_1h' ? parseFloat(v) : parseInt(v, 10);
      setForm((f) => ({ ...f, [key]: Number.isFinite(n) ? n : v }));
    } else {
      setForm((f) => ({ ...f, [key]: v }));
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    const payload = {
      txn_id: String(form.txn_id),
      AMOUNT: Number(form.AMOUNT),
      amount_sum_1h: Number(form.amount_sum_1h),
      TXN_TIMESTAMP: String(form.TXN_TIMESTAMP).replace('T', ' '),
      PAYER_VPA: String(form.PAYER_VPA),
      BENEFICIARY_VPA: String(form.BENEFICIARY_VPA),
      PAYER_IFSC: String(form.PAYER_IFSC),
      BENEFICIARY_IFSC: String(form.BENEFICIARY_IFSC),
      INITIATION_MODE: String(form.INITIATION_MODE || 'APP'),
      TRANSACTION_TYPE: String(form.TRANSACTION_TYPE || 'P2P'),
      device_user_count: Math.max(1, parseInt(form.device_user_count, 10) || 1),
      txn_count_1h: Math.max(1, parseInt(form.txn_count_1h, 10) || 1),
      failed_txn_count_24h: Math.max(0, parseInt(form.failed_txn_count_24h, 10) || 0),
      consecutive_failures: Math.max(0, parseInt(form.consecutive_failures, 10) || 0)
    };
    const r = await predictFraud(payload);
    setResult(r);
    setLoading(false);
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    boxSizing: 'border-box'
  };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`@keyframes fraudApiSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <header
        style={{
          backgroundColor: 'white',
          borderBottom: '1px solid #e5e7eb',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#2563eb', textDecoration: 'none', fontSize: 14 }}>
            <ArrowLeft size={18} />
            Dashboard
          </Link>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#1f2937' }}>
            <Shield size={22} color="#2563eb" />
            Fraud model API
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#6b7280' }}>
          <span style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.email}</span>
          <button type="button" onClick={signOut} style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
        {!baseUrl ? (
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: 16, color: '#92400e' }}>
            <strong>Configure the API URL.</strong> Add to your <code>.env</code> file:
            <pre style={{ marginTop: 10, fontSize: 12, overflow: 'auto' }}>
              REACT_APP_FRAUD_API_URL=https://fraudlens-fraud-api-875422601666.asia-south1.run.app
            </pre>
            Then restart <code>npm start</code>.
          </div>
        ) : (
          <>
            <div style={{ background: 'white', borderRadius: 8, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Endpoint</div>
                  <code style={{ fontSize: 13, wordBreak: 'break-all' }}>{baseUrl}/predict</code>
                  <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <a href={`${baseUrl}/docs`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      OpenAPI docs <ExternalLink size={14} />
                    </a>
                    <a href={`${baseUrl}/health`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      Health <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={loadInfo}
                  disabled={infoLoading}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    cursor: infoLoading ? 'wait' : 'pointer',
                    fontSize: 13
                  }}
                >
                  <RefreshCw size={16} style={infoLoading ? { animation: 'fraudApiSpin 1s linear infinite' } : {}} />
                  Refresh model info
                </button>
              </div>
              {modelInfo?.ok && modelInfo.data && (
                <pre
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: '#f9fafb',
                    borderRadius: 6,
                    fontSize: 12,
                    overflow: 'auto',
                    border: '1px solid #e5e7eb'
                  }}
                >
                  {JSON.stringify(modelInfo.data, null, 2)}
                </pre>
              )}
              {modelInfo && !modelInfo.ok && (
                <p style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}>{modelInfo.error}</p>
              )}
            </div>

            <form
              onSubmit={onSubmit}
              style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            >
              <h2 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#1f2937' }}>Transaction features</h2>
              <div style={gridStyle}>
                <div>
                  <label style={labelStyle}>txn_id</label>
                  <input style={inputStyle} value={form.txn_id} onChange={onChange('txn_id')} />
                </div>
                <div>
                  <label style={labelStyle}>AMOUNT</label>
                  <input style={inputStyle} type="number" step="0.01" value={form.AMOUNT} onChange={onChange('AMOUNT')} />
                </div>
                <div>
                  <label style={labelStyle}>amount_sum_1h</label>
                  <input style={inputStyle} type="number" step="0.01" value={form.amount_sum_1h} onChange={onChange('amount_sum_1h')} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>TXN_TIMESTAMP</label>
                  <input style={inputStyle} value={form.TXN_TIMESTAMP} onChange={onChange('TXN_TIMESTAMP')} placeholder="2026-04-10T12:00:00" />
                </div>
                <div>
                  <label style={labelStyle}>PAYER_VPA</label>
                  <input style={inputStyle} value={form.PAYER_VPA} onChange={onChange('PAYER_VPA')} />
                </div>
                <div>
                  <label style={labelStyle}>BENEFICIARY_VPA</label>
                  <input style={inputStyle} value={form.BENEFICIARY_VPA} onChange={onChange('BENEFICIARY_VPA')} />
                </div>
                <div>
                  <label style={labelStyle}>PAYER_IFSC</label>
                  <input style={inputStyle} value={form.PAYER_IFSC} onChange={onChange('PAYER_IFSC')} />
                </div>
                <div>
                  <label style={labelStyle}>BENEFICIARY_IFSC</label>
                  <input style={inputStyle} value={form.BENEFICIARY_IFSC} onChange={onChange('BENEFICIARY_IFSC')} />
                </div>
                <div>
                  <label style={labelStyle}>INITIATION_MODE</label>
                  <select style={inputStyle} value={form.INITIATION_MODE} onChange={onChange('INITIATION_MODE')}>
                    <option value="APP">APP</option>
                    <option value="WEB">WEB</option>
                    <option value="USSD">USSD</option>
                    <option value="IVR">IVR</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>TRANSACTION_TYPE</label>
                  <select style={inputStyle} value={form.TRANSACTION_TYPE} onChange={onChange('TRANSACTION_TYPE')}>
                    <option value="P2P">P2P</option>
                    <option value="P2M">P2M</option>
                    <option value="M2P">M2P</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>device_user_count</label>
                  <input style={inputStyle} type="number" min={1} value={form.device_user_count} onChange={onChange('device_user_count')} />
                </div>
                <div>
                  <label style={labelStyle}>txn_count_1h</label>
                  <input style={inputStyle} type="number" min={1} value={form.txn_count_1h} onChange={onChange('txn_count_1h')} />
                </div>
                <div>
                  <label style={labelStyle}>failed_txn_count_24h</label>
                  <input style={inputStyle} type="number" min={0} value={form.failed_txn_count_24h} onChange={onChange('failed_txn_count_24h')} />
                </div>
                <div>
                  <label style={labelStyle}>consecutive_failures</label>
                  <input style={inputStyle} type="number" min={0} value={form.consecutive_failures} onChange={onChange('consecutive_failures')} />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 20px',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: loading ? 'wait' : 'pointer',
                  fontSize: 14
                }}
              >
                <Play size={18} />
                {loading ? 'Scoring…' : 'POST /predict'}
              </button>
            </form>

            {result && (
              <div
                style={{
                  marginTop: 20,
                  background: 'white',
                  borderRadius: 8,
                  padding: 16,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  border: result.ok ? '1px solid #bbf7d0' : '1px solid #fecaca'
                }}
              >
                <h3 style={{ margin: '0 0 10px 0', fontSize: 15, color: '#374151' }}>Response</h3>
                {result.ok && result.data && (
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
                      <div>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>Fraud</span>
                        <div style={{ fontSize: 20, fontWeight: 700, color: result.data.is_fraud ? '#dc2626' : '#16a34a' }}>
                          {result.data.is_fraud ? 'YES' : 'NO'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>Probability</span>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{(result.data.fraud_probability * 100).toFixed(2)}%</div>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>Risk level</span>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{result.data.risk_level}</div>
                      </div>
                    </div>
                    <pre style={{ margin: 0, padding: 12, background: '#f9fafb', borderRadius: 6, fontSize: 12, overflow: 'auto' }}>
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                )}
                {!result.ok && <p style={{ color: '#b91c1c', margin: 0 }}>{result.error}</p>}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
