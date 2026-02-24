import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Shield } from 'lucide-react';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const pageStyle = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};

const cardStyle = {
  backgroundColor: 'white',
  borderRadius: 16,
  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
  padding: 40,
  width: '100%',
  maxWidth: 420
};

const logoStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 8
};

const titleStyle = {
  fontSize: 24,
  fontWeight: 700,
  color: '#1f2937',
  margin: 0
};

const subtitleStyle = {
  fontSize: 14,
  color: '#6b7280',
  margin: '0 0 24px 0'
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16
};

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 15,
  boxSizing: 'border-box'
};

const buttonStyle = {
  padding: '12px 20px',
  backgroundColor: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: 8
};

const linkStyle = {
  textAlign: 'center',
  marginTop: 20,
  fontSize: 14,
  color: '#6b7280'
};

const linkAnchorStyle = {
  color: '#2563eb',
  fontWeight: 600,
  textDecoration: 'none'
};

const errorStyle = {
  padding: 10,
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: 8,
  color: '#991b1b',
  fontSize: 14
};

const demoDivStyle = {
  marginTop: 24,
  paddingTop: 24,
  borderTop: '1px solid #e5e7eb'
};

const demoLabelStyle = {
  fontSize: 13,
  color: '#6b7280',
  margin: '0 0 12px 0'
};

const demoButtonsStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8
};

const demoButtonStyle = {
  padding: '10px 16px',
  backgroundColor: '#1e40af',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer'
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, authLoading, isApproved, isPending, isIT, isExec, setDemoSession } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (user && isApproved) {
      navigate(isExec ? '/exec' : '/', { replace: true });
      return;
    }
    if (user && isPending) {
      navigate('/pending', { replace: true });
    }
  }, [user, authLoading, isApproved, isPending, isIT, isExec, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.code === 'auth/user-not-found' ? 'No account with this email.' :
        err.code === 'auth/wrong-password' ? 'Incorrect password.' :
        err.code === 'auth/invalid-email' ? 'Invalid email address.' :
        err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={logoStyle}>
          <Shield size={32} color="#2563eb" />
          <h1 style={titleStyle}>FraudLens Admin</h1>
        </div>
        <p style={subtitleStyle}>Sign in to access the admin panel.</p>

        <form style={formStyle} onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
            autoComplete="current-password"
          />
          {error && <div style={errorStyle}>{error}</div>}
          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={linkStyle}>
          Don't have an account? <Link to="/signup" style={linkAnchorStyle}>Request access</Link>
        </p>

        <div style={demoDivStyle}>
          <p style={demoLabelStyle}>Just viewing? Skip login and see the app:</p>
          <div style={demoButtonsStyle}>
            <button
              type="button"
              onClick={() => {
                setDemoSession('it');
                navigate('/', { replace: true });
              }}
              style={demoButtonStyle}
            >
              View as IT Admin
            </button>
            <button
              type="button"
              onClick={() => {
                setDemoSession('exec');
                navigate('/exec', { replace: true });
              }}
              style={{ ...demoButtonStyle, backgroundColor: '#7c3aed' }}
            >
              View as Exec
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
