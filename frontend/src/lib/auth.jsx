import React, { createContext, useContext, useEffect, useRef, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const supabaseRef = useRef(null);
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("wi_user");
    if (raw) {
      try {
        const u = JSON.parse(raw);
        // Ensure user_metadata exists
        if (!u.user_metadata) {
          u.user_metadata = { role: (u.role || "traveler").toLowerCase() };
        }
        return u;
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem("wi_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("wi_user");
    }
  }, [user]);

  // Sync Supabase Auth session if available
  useEffect(() => {
    let active = true;
    let subscription;

    const connectSupabase = async () => {
      const { default: supabase } = await import("./supabaseClient.js");
      if (!active || !supabase) return;
      supabaseRef.current = supabase;

      const syncSupabaseSession = async (session) => {
        if (!session?.user) return;
        localStorage.setItem("wi_token", session.access_token);
        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) {
          localStorage.removeItem("wi_token");
          setUser(null);
          return;
        }
        const { user: principal } = await response.json();
        if (!active) return;
        setUser({
          ...principal,
          user_metadata: {
            role: String(principal.role || "TRAVELER").toLowerCase(),
            supplier_id: principal.supplier_id || null,
          },
        });
      };

      const { data: { session } } = await supabase.auth.getSession();
      if (active && session?.user) {
        await syncSupabaseSession(session);
      }

      const authState = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (nextSession?.user) {
          syncSupabaseSession(nextSession).catch(() => setUser(null));
        } else if (event === "SIGNED_OUT") {
          localStorage.removeItem("wi_token");
          setUser(null);
        }
      });
      subscription = authState.data.subscription;
    };

    connectSupabase().catch(() => undefined);

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const login = (token, u) => {
    localStorage.setItem("wi_token", token);
    const enrichedUser = {
      ...u,
      user_metadata: u.user_metadata || { role: (u.role || "traveler").toLowerCase() }
    };
    setUser(enrichedUser);
  };

  const logout = () => {
    localStorage.removeItem("wi_token");
    if (supabaseRef.current) {
      supabaseRef.current.auth.signOut();
    } else {
      import("./supabaseClient.js").then(({ default: supabase }) => supabase?.auth.signOut());
    }
    setUser(null);
  };

  const isAdmin = Boolean(
    user?.user_metadata?.role === "admin" ||
    user?.role === "ADMIN" ||
    user?.role === "admin"
  );

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
