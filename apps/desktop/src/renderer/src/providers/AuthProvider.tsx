import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "../auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser = null,
}: {
  children: ReactNode;
  initialUser?: AuthUser | null;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [loading, setLoading] = useState(
    initialUser === null && typeof window.getUser === "function",
  );

  useEffect(() => {
    setUser(initialUser);
    if (initialUser) {
      setLoading(false);
    }
  }, [initialUser]);

  useEffect(() => {
    if (typeof window.getUser !== "function") {
      setLoading(false);
      return;
    }

    let cancelled = false;

    if (!initialUser) {
      void window
        .getUser()
        .then((sessionUser) => {
          if (!cancelled) {
            setUser(sessionUser);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setUser(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }

    const unsubscribe =
      typeof window.onUserUpdated === "function"
        ? window.onUserUpdated((sessionUser) => {
            setUser(sessionUser);
            setLoading(false);
          })
        : () => {};

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [initialUser]);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuthUser(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthUser must be used within AuthProvider");
  }
  return context;
}
