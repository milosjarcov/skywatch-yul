import { useEffect, useState } from "react";

// The current time, re-rendering the component every `ms` milliseconds.
// For "updated 12 seconds ago" labels that need to keep counting.
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}
