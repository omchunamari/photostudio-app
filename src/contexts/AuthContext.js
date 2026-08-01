"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { subscribeToAuthState, logout as firebaseLogout } from "@/lib/firebase/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((profile) => {
      setUser(profile);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  async function logout() {
    await firebaseLogout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}