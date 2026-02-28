import { useEffect } from "react";

import type { BackendState } from "../../backend/models.ts";
import type { SpotifyBackend } from "../../backend/spotify-backend.ts";

interface UseBackendLifecycleOptions {
  backend: SpotifyBackend;
  setBackendState: (nextState: BackendState) => void;
  setBackendReady: (ready: boolean) => void;
  setStatusMessage: (message: string) => void;
}

// Start the backend in the background, then keep local state synchronized with backend events.
export function useBackendLifecycle({
  backend,
  setBackendState,
  setBackendReady,
  setStatusMessage,
}: UseBackendLifecycleOptions): void {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await backend.initialize();
        if (cancelled) {
          return;
        }

        setBackendState(backend.getState());
        setBackendReady(true);
        setStatusMessage("Ready");
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);

        // Keep the UI usable even if the optional player adapter fails during startup.
        try {
          await backend.refresh();
          if (cancelled) {
            return;
          }

          setBackendState(backend.getState());
          setBackendReady(true);
          setStatusMessage(`Initialization warning: ${message}`);
        } catch {
          setStatusMessage(`Initialization failed: ${message}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [backend, setBackendReady, setBackendState, setStatusMessage]);

  useEffect(() => {
    const disposeState = backend.on("stateChanged", (nextState) => {
      setBackendState(nextState);
    });
    const disposeError = backend.on("error", (error) => {
      setStatusMessage(`Error: ${error.message}`);
    });

    setBackendState(backend.getState());

    return () => {
      disposeState();
      disposeError();
    };
  }, [backend, setBackendState, setStatusMessage]);
}
