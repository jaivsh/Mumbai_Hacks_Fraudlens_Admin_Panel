import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc
} from 'firebase/firestore';
import { Shield, TrendingUp, User, MapPin, Database, LogOut } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const pageStyle = {
  minHeight: '100vh',
  backgroundColor: '#f5f5f5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};

const headerStyle = {
  backgroundColor: 'white',
  borderBottom: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
};

const headerContentStyle = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '16px 24px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const mainStyle = { maxWidth: 1200, margin: '0 auto', padding: '32px 24px' };

const cardStyle = {
  backgroundColor: 'white',
  borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  padding: 24,
  marginBottom: 24
};

const kpiGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 16
};

const kpiCardStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
};

const kpiLabelStyle = { fontSize: 13, color: '#6b7280', margin: '0 0 4px 0' };
const kpiValueStyle = { fontSize: 22, fontWeight: 700, color: '#1f2937', margin: 0 };

const chartsGridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 };
const chartCardStyle = { ...cardStyle, marginBottom: 24 };
const chartTitleStyle = { fontSize: 16, fontWeight: 600, margin: '0 0 16px 0', color: '#374151' };

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
const thStyle = { textAlign: 'left', padding: '12px 16px', backgroundColor: '#f9fafb', color: '#6b7280', fontWeight: 600 };
const tdStyle = { padding: '12px 16px', borderTop: '1px solid #e5e7eb' };
const badgeStyle = (bg, color) => ({ padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, backgroundColor: bg, color });
const linkButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 18px',
  backgroundColor: '#2563eb',
  color: 'white',
  borderRadius: 8,
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 14
};
const signOutBtnStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  backgroundColor: 'transparent',
  color: '#6b7280',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14
};

function getSeverity(transaction) {
  if (!transaction.modelDecision) return { level: 'Safe', color: '#10b981' };
  const score = transaction.fraudScore || 0;
  if (score > 0.7) return { level: 'High', color: '#ef4444' };
  if (score > 0.4) return { level: 'Medium', color: '#f59e0b' };
  return { level: 'Low', color: '#f97316' };
}

export default function ExecDashboard() {
  const { profile, signOut, isDemo } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isDemo) {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [txSnap, usersSnap] = await Promise.all([
          getDocs(query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(100))),
          getDocs(collection(db, 'users'))
        ]);
        const txData = await Promise.all(
          txSnap.docs.map(async (d) => {
            const data = d.data();
            let enriched = { id: d.id, ...data, timestamp: data.timestamp?.toDate?.() || new Date() };
            if (data.ipLogId) {
              try {
                const ipDoc = await getDoc(doc(db, 'ip_logs', data.ipLogId));
                if (ipDoc.exists()) enriched.ipData = ipDoc.data();
              } catch (_) {}
            }
            return enriched;
          })
        );
        setTransactions(txData);
        setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isDemo]);

  const analytics = {
    totalTransactions: transactions.length,
    fraudDetected: transactions.filter((t) => t.modelDecision).length,
    totalUsers: users.length,
    avgAmount: transactions.length
      ? Math.round(transactions.reduce((s, t) => s + (t.amount || 0), 0) / transactions.length)
      : 0,
    blockedIPs: 0
  };

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const chartData = last7Days.map((date) => {
    const dayTx = transactions.filter((t) => t.timestamp?.toDateString?.() === date.toDateString());
    return {
      date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      transactions: dayTx.length,
      fraud: dayTx.filter((t) => t.modelDecision).length
    };
  });

  const riskDistribution = [
    { name: 'High', value: transactions.filter((t) => getSeverity(t).level === 'High').length, color: '#ef4444' },
    { name: 'Medium', value: transactions.filter((t) => getSeverity(t).level === 'Medium').length, color: '#f59e0b' },
    { name: 'Low', value: transactions.filter((t) => getSeverity(t).level === 'Low').length, color: '#f97316' },
    { name: 'Safe', value: transactions.filter((t) => getSeverity(t).level === 'Safe').length, color: '#10b981' }
  ];

  const fraudIncidents = transactions.filter((t) => t.modelDecision).slice(0, 15);

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ ...mainStyle, paddingTop: 80, textAlign: 'center', color: '#6b7280' }}>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div style={headerContentStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Shield size={28} color="#2563eb" />
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2937', margin: 0 }}>FraudLens — Executive view</h1>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                {isDemo && <span style={{ padding: '2px 8px', borderRadius: 4, backgroundColor: '#fef3c7', color: '#92400e', marginRight: 8, fontSize: 11 }}>Demo</span>}
                {profile?.displayName || profile?.email} (Leadership)
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link to="/exec/reports" style={linkButtonStyle}>Reports</Link>
            <button type="button" onClick={signOut} style={signOutBtnStyle}>
              <LogOut size={18} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main style={mainStyle}>
        {error && (
          <div style={{ ...cardStyle, backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
            {error}
          </div>
        )}

        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: 18, color: '#1f2937' }}>Key metrics</h2>
          <div style={kpiGridStyle}>
            <div style={kpiCardStyle}>
              <div>
                <p style={kpiLabelStyle}>Total transactions</p>
                <p style={kpiValueStyle}>{analytics.totalTransactions}</p>
              </div>
              <TrendingUp size={24} color="#3b82f6" />
            </div>
            <div style={kpiCardStyle}>
              <div>
                <p style={kpiLabelStyle}>Fraud detected</p>
                <p style={{ ...kpiValueStyle, color: '#dc2626' }}>{analytics.fraudDetected}</p>
              </div>
              <Shield size={24} color="#ef4444" />
            </div>
            <div style={kpiCardStyle}>
              <div>
                <p style={kpiLabelStyle}>Total users</p>
                <p style={kpiValueStyle}>{analytics.totalUsers}</p>
              </div>
              <User size={24} color="#10b981" />
            </div>
            <div style={kpiCardStyle}>
              <div>
                <p style={kpiLabelStyle}>Avg amount</p>
                <p style={kpiValueStyle}>₹{analytics.avgAmount?.toLocaleString?.() || 0}</p>
              </div>
              <Database size={24} color="#3b82f6" />
            </div>
            <div style={kpiCardStyle}>
              <div>
                <p style={kpiLabelStyle}>Fraud rate</p>
                <p style={{ ...kpiValueStyle, color: '#f59e0b' }}>
                  {analytics.totalTransactions ? ((analytics.fraudDetected / analytics.totalTransactions) * 100).toFixed(1) : 0}%
                </p>
              </div>
              <MapPin size={24} color="#f59e0b" />
            </div>
          </div>
        </div>

        <div style={chartsGridStyle}>
          <div style={chartCardStyle}>
            <h3 style={chartTitleStyle}>Transaction volume (last 7 days)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="transactions" fill="#3b82f6" name="Total" />
                <Bar dataKey="fraud" fill="#ef4444" name="Fraud" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={chartCardStyle}>
            <h3 style={chartTitleStyle}>Risk distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={riskDistribution.filter((d) => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {riskDistribution.filter((d) => d.value > 0).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#374151' }}>Recent fraud incidents (summary)</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#6b7280' }}>
            Use incident IDs in Reports to generate executive summaries.
          </p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Incident ID</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Risk</th>
                <th style={thStyle}>Date</th>
              </tr>
            </thead>
            <tbody>
              {fraudIncidents.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ ...tdStyle, color: '#6b7280', textAlign: 'center' }}>No fraud incidents in this window.</td>
                </tr>
              ) : (
                fraudIncidents.map((t) => {
                  const sev = getSeverity(t);
                  return (
                    <tr key={t.id}>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{t.id}</td>
                      <td style={tdStyle}>₹{(t.amount || 0).toLocaleString()}</td>
                      <td style={tdStyle}>
                        <span style={badgeStyle(sev.color, 'white')}>{sev.level}</span>
                      </td>
                      <td style={tdStyle}>{t.timestamp?.toLocaleString?.() || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <div style={{ marginTop: 16 }}>
            <Link to="/exec/reports" style={linkButtonStyle}>Open Reports →</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
