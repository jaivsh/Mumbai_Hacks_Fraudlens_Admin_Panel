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
          setProfile({ id: snap.id, ...snap.data() });
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error('Auth profile fetch error', err);
        setProfile(null);
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
