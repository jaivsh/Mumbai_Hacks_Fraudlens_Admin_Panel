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

const demoHintStyle = {
  fontSize: 12,
  color: '#9ca3af',
  margin: '0 0 12px 0',
  lineHeight: 1.45
};

const demoLegacyStyle = {
  fontSize: 12,
  color: '#9ca3af',
  margin: '12px 0 0 0',
  textAlign: 'center'
};

const demoLegacyBtnStyle = {
  background: 'none',
  border: 'none',
  color: '#6b7280',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: 12,
  padding: 0
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

/** One-click demo: real Firebase sign-in so ID tokens work (e.g. Assistant Live). Env is baked at build/start time. */
function getDemoCredentials(role) {
  const itEmail = (process.env.REACT_APP_DEMO_IT_EMAIL || '').trim();
  const itPassword = (process.env.REACT_APP_DEMO_IT_PASSWORD || '').trim();
  const execEmail = (process.env.REACT_APP_DEMO_EXEC_EMAIL || '').trim();
  const execPassword = (process.env.REACT_APP_DEMO_EXEC_PASSWORD || '').trim();
  if (role === 'it') {
    if (!itEmail || !itPassword) return { ok: false, reason: 'missing_it' };
    return { ok: true, email: itEmail, password: itPassword };
  }
  if (!execEmail || !execPassword) return { ok: false, reason: 'missing_exec' };
  return { ok: true, email: execEmail, password: execPassword };
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoRoleLoading, setDemoRoleLoading] = useState(null);
  const navigate = useNavigate();
  const { user, authLoading, isApproved, isPending, isIT, isExec, setDemoSession } = useAuth();

  const itDemoReady = getDemoCredentials('it').ok;
  const execDemoReady = getDemoCredentials('exec').ok;

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

  const handleDemoFirebaseSignIn = async (role) => {
    const creds = getDemoCredentials(role);
    setError('');
    if (!creds.ok) {
      if (creds.reason === 'missing_it') {
        setError(
          'Demo IT: set REACT_APP_DEMO_IT_EMAIL and REACT_APP_DEMO_IT_PASSWORD in .env, restart npm start, then create that user in Firebase Authentication and admin_users (approved, role it_admin or it_analyst).'
        );
      } else {
        setError(
          'Demo Exec: set REACT_APP_DEMO_EXEC_EMAIL and REACT_APP_DEMO_EXEC_PASSWORD in .env, restart npm start, then create that user in Firebase + admin_users (approved, role exec).'
        );
      }
      return;
    }
    setDemoRoleLoading(role);
    try {
      await signInWithEmailAndPassword(auth, creds.email, creds.password);
      navigate(role === 'exec' ? '/exec' : '/', { replace: true });
    } catch (err) {
      setError(
        err.code === 'auth/user-not-found'
          ? 'Demo user not found in Firebase Authentication.'
          : err.code === 'auth/wrong-password'
            ? 'Demo password does not match the Firebase user.'
            : err.message || 'Demo sign-in failed.'
      );
    } finally {
      setDemoRoleLoading(null);
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
          <button type="submit" style={buttonStyle} disabled={loading || demoRoleLoading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={linkStyle}>
          Don't have an account? <Link to="/signup" style={linkAnchorStyle}>Request access</Link>
        </p>

        <div style={demoDivStyle}>
          <p style={demoLabelStyle}>Demo: sign in with configured test accounts (real Firebase session — Assistant Live works).</p>
          <p style={demoHintStyle}>
            Set <code style={{ fontSize: 11 }}>REACT_APP_DEMO_IT_EMAIL</code> /{' '}
            <code style={{ fontSize: 11 }}>REACT_APP_DEMO_IT_PASSWORD</code> and exec variants in{' '}
            <code style={{ fontSize: 11 }}>.env</code>, then restart <code style={{ fontSize: 11 }}>npm start</code>. See{' '}
            <code style={{ fontSize: 11 }}>assistant_api/DEMO_TEST_ACCOUNTS.md</code>.
          </p>
          <div style={demoButtonsStyle}>
            <button
              type="button"
              onClick={() => handleDemoFirebaseSignIn('it')}
              disabled={loading || demoRoleLoading || !itDemoReady}
              style={{
                ...demoButtonStyle,
                opacity: itDemoReady ? 1 : 0.45,
                cursor: itDemoReady && !demoRoleLoading ? 'pointer' : 'not-allowed'
              }}
              title={!itDemoReady ? 'Configure REACT_APP_DEMO_IT_* in .env' : undefined}
            >
              {demoRoleLoading === 'it' ? 'Signing in…' : 'Demo — IT Admin'}
            </button>
            <button
              type="button"
              onClick={() => handleDemoFirebaseSignIn('exec')}
              disabled={loading || demoRoleLoading || !execDemoReady}
              style={{
                ...demoButtonStyle,
                backgroundColor: '#7c3aed',
                opacity: execDemoReady ? 1 : 0.45,
                cursor: execDemoReady && !demoRoleLoading ? 'pointer' : 'not-allowed'
              }}
              title={!execDemoReady ? 'Configure REACT_APP_DEMO_EXEC_* in .env' : undefined}
            >
              {demoRoleLoading === 'exec' ? 'Signing in…' : 'Demo — Exec'}
            </button>
          </div>
          <p style={demoLegacyStyle}>
            <button
              type="button"
              style={demoLegacyBtnStyle}
              onClick={() => {
                setError('');
                setDemoSession('it');
                navigate('/', { replace: true });
              }}
            >
              Offline preview (no Firebase)
            </button>
            {' · '}
            <button
              type="button"
              style={demoLegacyBtnStyle}
              onClick={() => {
                setError('');
                setDemoSession('exec');
                navigate('/exec', { replace: true });
              }}
            >
              Exec offline preview
            </button>
            <span style={{ display: 'block', marginTop: 6 }}>No ID token — Assistant Live stays disabled.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
