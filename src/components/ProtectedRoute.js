import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { RefreshCw } from 'lucide-react';

const loadingStyle = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  backgroundColor: '#f5f5f5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};

/**
 * role: 'it' | 'exec'
 * - For 'it': only it_admin / it_analyst can access; exec users redirect to /exec
 * - For 'exec': only exec can access; IT users redirect to /
 */
export default function ProtectedRoute({ children, role }) {
  const { user, profile, authLoading, isPending, isIT, isExec } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return (
      <div style={loadingStyle}>
        <RefreshCw size={32} color="#2563eb" />
        <p style={{ color: '#6b7280', margin: 0 }}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isPending) {
    return <Navigate to="/pending" replace />;
  }

  if (!profile?.approved) {
    return <Navigate to="/login" replace />;
  }

  if (role === 'it' && !isIT) {
    if (isExec) return <Navigate to="/exec" replace />;
    return <Navigate to="/login" replace />;
  }

  if (role === 'exec' && !isExec) {
    if (isIT) return <Navigate to="/" replace />;
    return <Navigate to="/login" replace />;
  }

  return children;
}
