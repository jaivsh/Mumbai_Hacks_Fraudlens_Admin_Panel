import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDocs, collection, Timestamp } from 'firebase/firestore';
import { Shield } from 'lucide-react';
import { auth, db } from '../firebase';
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

const titleStyle = { fontSize: 24, fontWeight: 700, color: '#1f2937', margin: 0 };
const subtitleStyle = { fontSize: 14, color: '#6b7280', margin: '0 0 24px 0' };
const formStyle = { display: 'flex', flexDirection: 'column', gap: 16 };
const inputStyle = {
  width: '100%', padding: '12px 14px', border: '1px solid #d1d5db',
  borderRadius: 8, fontSize: 15, boxSizing: 'border-box'
};
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const buttonStyle = {
  padding: '12px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none',
  borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 8
};
const linkStyle = { textAlign: 'center', marginTop: 20, fontSize: 14, color: '#6b7280' };
const linkAnchorStyle = { color: '#2563eb', fontWeight: 600, textDecoration: 'none' };
const errorStyle = {
  padding: 10, backgroundColor: '#fef2f2', border: '1px solid #fecaca',
  borderRadius: 8, color: '#991b1b', fontSize: 14
};

const ROLE_OPTIONS = [
  { value: 'it_analyst', label: 'IT / Security Ops' },
  { value: 'exec', label: 'Leadership (CFO / CEO)' },
  { value: 'other', label: 'Other' }
];

export default function Signup() {
  const { adminUsersCollection } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [requestedRole, setRequestedRole] = useState('it_analyst');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName.trim()) {
        await updateProfile(userCred.user, { displayName: displayName.trim() });
      }

      const existingAdmins = await getDocs(
        collection(db, adminUsersCollection)
      );
      const approvedCount = existingAdmins.docs.filter(
        d => d.data().approved === true
      ).length;
      const isFirstUser = approvedCount === 0;

      await setDoc(doc(db, adminUsersCollection, userCred.user.uid), {
        email: userCred.user.email,
        displayName: displayName.trim() || userCred.user.email?.split('@')[0] || 'User',
        requestedRole,
        role: isFirstUser ? 'it_admin' : null,
        approved: isFirstUser,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      if (isFirstUser) {
        navigate('/');
      } else {
        navigate('/pending');
      }
    } catch (err) {
      setError(
        err.code === 'auth/email-already-in-use' ? 'This email is already registered.' :
        err.code === 'auth/weak-password' ? 'Password should be at least 6 characters.' :
        err.code === 'auth/invalid-email' ? 'Invalid email address.' :
        err.message || 'Sign up failed.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={logoStyle}>
          <Shield size={32} color="#2563eb" />
          <h1 style={titleStyle}>Request access</h1>
        </div>
        <p style={subtitleStyle}>Create an account. An IT admin will approve your access.</p>

        <form style={formStyle} onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Full name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={inputStyle}
            autoComplete="name"
          />
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
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
            I am a
          </label>
          <select
            value={requestedRole}
            onChange={(e) => setRequestedRole(e.target.value)}
            style={selectStyle}
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {error && <div style={errorStyle}>{error}</div>}
          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p style={linkStyle}>
          Already have an account? <Link to="/login" style={linkAnchorStyle}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
