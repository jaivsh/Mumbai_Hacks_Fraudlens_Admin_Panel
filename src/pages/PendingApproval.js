import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, LogOut, XCircle } from 'lucide-react';
import { signOut } from 'firebase/auth';
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
  maxWidth: 420,
  textAlign: 'center'
};

const iconStyle = { marginBottom: 16 };
const titleStyle = { fontSize: 22, fontWeight: 700, color: '#1f2937', margin: '0 0 12px 0' };
const textStyle = { fontSize: 15, color: '#6b7280', margin: 0, lineHeight: 1.5 };
const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 24,
  padding: '12px 20px',
  backgroundColor: '#374151',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer'
};

export default function PendingApproval() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/login');
  };

  if (profile?.rejected) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={iconStyle}>
            <XCircle size={48} color="#ef4444" />
          </div>
          <h1 style={titleStyle}>Access denied</h1>
          <p style={textStyle}>
            Your access request was not approved. If you believe this is an error, contact your IT administrator.
          </p>
          <button type="button" onClick={handleSignOut} style={buttonStyle}>
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={iconStyle}>
          <Shield size={48} color="#f59e0b" />
        </div>
        <h1 style={titleStyle}>Account pending approval</h1>
        <p style={textStyle}>
          Your account has been created. An IT administrator will review your request and approve your access. You’ll be able to sign in once approved.
        </p>
        <button type="button" onClick={handleSignOut} style={buttonStyle}>
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </div>
  );
}
