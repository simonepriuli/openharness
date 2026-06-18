import { useEffect, useState } from "react";
import type { AuthUser } from "../auth";

export function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (typeof window.getUser !== "function") {
      setLoading(false);
      return;
    }

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

    const unsubscribe =
      typeof window.onUserUpdated === "function"
        ? window.onUserUpdated((sessionUser) => {
            setUser(sessionUser);
          })
        : () => {};

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { user, loading };
}
