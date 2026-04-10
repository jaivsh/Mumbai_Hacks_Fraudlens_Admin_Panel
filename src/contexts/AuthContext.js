import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const ADMIN_USERS_COLLECTION = 'admin_users';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

const DEMO_USER = { uid: 'demo', isDemo: true };

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [demoProfile, setDemoProfile] = useState(null);
  const demoItEmail = (process.env.REACT_APP_DEMO_IT_EMAIL || '').trim().toLowerCase();
  const demoExecEmail = (process.env.REACT_APP_DEMO_EXEC_EMAIL || '').trim().toLowerCase();

  const inferDemoProfileFromEmail = (email) => {
    const e = String(email || '').trim().toLowerCase();
    if (!e) return null;
    if (demoExecEmail && e === demoExecEmail) return { role: 'exec', approved: true, email: e, demo: true };
    if (demoItEmail && e === demoItEmail) return { role: 'it_admin', approved: true, email: e, demo: true };
    return null;
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user || null);
      if (!user) {
        if (!demoProfile) setProfile(null);
        setAuthLoading(false);
        return;
      }
      setDemoProfile(null);
      try {
        const snap = await getDoc(doc(db, ADMIN_USERS_COLLECTION, user.uid));
        if (snap.exists()) {
          const base = { id: snap.id, ...snap.data() };
          // If signing in via configured demo accounts, prefer the intended role
          // even if Firestore is missing/misconfigured for the demo UID.
          const inferred = inferDemoProfileFromEmail(user.email);
          if (inferred) {
            setProfile({ ...base, role: inferred.role, approved: true });
          } else {
            setProfile(base);
          }
        } else {
          const inferred = inferDemoProfileFromEmail(user.email);
          setProfile(inferred || null);
        }
      } catch (err) {
        console.error('Auth profile fetch error', err);
        const inferred = inferDemoProfileFromEmail(user.email);
        setProfile(inferred || null);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, [demoProfile]);

  const setDemoSession = (role) => {
    setDemoProfile(role === 'exec' ? { role: 'exec', approved: true } : { role: 'it_admin', approved: true });
    setFirebaseUser(null);
    setProfile(null);
    setAuthLoading(false);
  };

  const signOut = async () => {
    setDemoProfile(null);
    setProfile(null);
    if (firebaseUser) await firebaseSignOut(auth);
    setFirebaseUser(null);
  };

  const activeProfile = demoProfile || profile;
  const isIT = activeProfile?.approved && (activeProfile?.role === 'it_admin' || activeProfile?.role === 'it_analyst');
  const isExec = activeProfile?.approved && activeProfile?.role === 'exec';
  const isApproved = Boolean(activeProfile?.approved);
  const isPending = Boolean(activeProfile && !activeProfile.approved);
  const isDemo = Boolean(demoProfile);

  const value = {
    user: firebaseUser || (demoProfile ? DEMO_USER : null),
    profile: activeProfile,
    authLoading,
    signOut,
    isIT,
    isExec,
    isApproved,
    isPending,
    isDemo,
    setDemoSession,
    adminUsersCollection: ADMIN_USERS_COLLECTION
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
