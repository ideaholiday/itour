import { useEffect, useState } from "react";
import { useAuth } from "./auth.jsx";
import { api } from "./api.js";

// The signed-in traveler's own creator code, when they are an active creator
// (ADR 030). Fetched once per signed-in user and shared by every share button.
const cache = new Map();

export function useCreatorCode() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [code, setCode] = useState(() => (userId && typeof cache.get(userId) === "string" ? cache.get(userId) : null));

  useEffect(() => {
    if (!userId) {
      setCode(null);
      return undefined;
    }
    let cancelled = false;
    if (!cache.has(userId)) {
      cache.set(userId, api.getAffiliateMe()
        .then((res) => (res?.registered && res.affiliate?.status === "ACTIVE" ? res.affiliate.affiliate_code || null : null))
        .catch(() => null));
    }
    Promise.resolve(cache.get(userId)).then((value) => {
      cache.set(userId, value);
      if (!cancelled) setCode(value);
    });
    return () => { cancelled = true; };
  }, [userId]);

  return code;
}
