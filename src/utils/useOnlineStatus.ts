import { useEffect, useState } from "react";

/**
 * Tracks browser connectivity.
 *
 * Offline study is a goal, but the app is split into halves that behave very
 * differently without a network: cached text and audio keep working, while
 * anything that calls the LLM or synthesizes a new line cannot. Nothing in the
 * UI marked that boundary, so an offline click produced a raw fetch failure.
 *
 * `navigator.onLine` is a lower bound, not a guarantee - it reports link state,
 * not reachability. It is reliable for the case that matters here (it is never
 * true when there is definitely no connection), so it is used to disable
 * network-only controls, never to skip error handling.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
