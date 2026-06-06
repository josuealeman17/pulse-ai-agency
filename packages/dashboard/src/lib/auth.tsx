import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase.js";

export type Role = "admin" | "client";

interface AuthState {
  session: Session | null;
  loading: boolean;
  /** Resolved from admin_users. null = logged in but not provisioned. */
  role: Role | null;
  /** The client this user is scoped to (client role only); null for admins. */
  clientId: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Resolve the user's role + scope from admin_users (RLS lets a user read their own row).
  async function applySession(s: Session | null) {
    setSession(s);
    if (!s) {
      setRole(null);
      setClientId(null);
      return;
    }
    const { data } = await supabase
      .from("admin_users")
      .select("role, client_id")
      .eq("id", s.user.id)
      .maybeSingle<{ role: Role; client_id: string | null }>();
    setRole(data?.role ?? null);
    setClientId(data?.client_id ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      await applySession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      void applySession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, loading, role, clientId, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
