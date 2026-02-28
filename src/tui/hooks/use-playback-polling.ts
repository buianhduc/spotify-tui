import { useEffect, useRef } from "react";

import type { SpotifyBackend } from "../../backend/spotify-backend.ts";

const REFRESH_PLAYBACK_MS = 1000;
const REFRESH_FULL_STATE_EVERY = 6;

interface UsePlaybackPollingOptions {
  backend: SpotifyBackend;
  backendReady: boolean;
  setStatusMessage: (message: string) => void;
}

// Refresh playback periodically after startup without overlapping in-flight polls.
export function usePlaybackPolling({
  backend,
  backendReady,
  setStatusMessage,
}: UsePlaybackPollingOptions): void {
  const pollInFlightRef = useRef(false);
  const pollTickRef = useRef(0);

  useEffect(() => {
    if (!backendReady) {
      return;
    }

    const interval = setInterval(() => {
      if (pollInFlightRef.current) {
        return;
      }

      pollInFlightRef.current = true;

      void (async () => {
        try {
          pollTickRef.current += 1;
          await backend.refreshPlayback();

          if (pollTickRef.current % REFRESH_FULL_STATE_EVERY === 0) {
            await backend.getDevices();
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatusMessage(`Poll error: ${message}`);
        } finally {
          pollInFlightRef.current = false;
        }
      })();
    }, REFRESH_PLAYBACK_MS);

    return () => {
      clearInterval(interval);
    };
  }, [backend, backendReady, setStatusMessage]);
}
