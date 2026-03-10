import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  SpotifyDeviceSummary,
  SpotifyPlaybackSummary,
  SpotifyPlaylistSummary,
  fetchAvailableDevices,
  fetchPlaybackState,
  fetchUserPlaylists,
  pausePlayback,
  playAlbum,
  playPlaylist,
  playTrack,
  resumePlayback,
  skipToNextTrack,
  skipToPreviousTrack,
  transferPlayback,
} from "@/lib/spotify-api";
import { authenticateWithSpotify } from "@/lib/spotify-auth";
import { loadRefreshToken, saveRefreshToken } from "@/lib/token-storage";

const PLAYBACK_POLL_MS = 4_000;

interface SpotifyControllerContextValue {
  refreshToken: string | null;
  initializing: boolean;
  authenticating: boolean;
  loadingData: boolean;
  error: string | null;
  playlists: SpotifyPlaylistSummary[];
  devices: SpotifyDeviceSummary[];
  selectedDeviceId: string | null;
  playback: SpotifyPlaybackSummary | null;
  login: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshPlayback: () => Promise<void>;
  clearError: () => void;
  setSelectedDeviceId: (deviceId: string | null) => void;
  playPlaylistById: (playlistId: string) => Promise<void>;
  playTrackByUri: (trackUri: string) => Promise<void>;
  playAlbumById: (albumId: string) => Promise<void>;
  resume: () => Promise<void>;
  pause: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
}

const SpotifyControllerContext = createContext<SpotifyControllerContextValue | undefined>(undefined);

export function SpotifyControllerProvider({ children }: PropsWithChildren) {
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylistSummary[]>([]);
  const [devices, setDevices] = useState<SpotifyDeviceSummary[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [playback, setPlayback] = useState<SpotifyPlaybackSummary | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshPlaybackState = useCallback(
    async (token?: string) => {
      const activeToken = token ?? refreshToken;
      if (!activeToken) {
        return;
      }

      try {
        const nextPlayback = await fetchPlaybackState(activeToken);
        setPlayback(nextPlayback);
      } catch (err) {
        setError(toErrorMessage(err));
      }
    },
    [refreshToken],
  );

  const refreshAllInternal = useCallback(
    async (token?: string) => {
      const activeToken = token ?? refreshToken;
      if (!activeToken) {
        return;
      }

      setLoadingData(true);
      try {
        const [nextPlaylists, nextDevices, nextPlayback] = await Promise.all([
          fetchUserPlaylists(activeToken),
          fetchAvailableDevices(activeToken),
          fetchPlaybackState(activeToken),
        ]);

        setPlaylists(nextPlaylists);
        setDevices(nextDevices);
        setPlayback(nextPlayback);
        setSelectedDeviceId((current) => {
          if (nextDevices.length === 0) {
            return null;
          }

          if (current && nextDevices.some((device) => device.id === current)) {
            return current;
          }

          const fallback = nextDevices.find((device) => device.isActive) ?? nextDevices[0];
          return fallback.id;
        });
      } catch (err) {
        setError(toErrorMessage(err));
      } finally {
        setLoadingData(false);
      }
    },
    [refreshToken],
  );

  const ensureTargetDevice = useCallback(
    async (token: string): Promise<string | undefined> => {
      const deviceId = selectedDeviceId ?? devices.find((device) => device.isActive)?.id;
      if (!deviceId) {
        return undefined;
      }

      await transferPlayback(token, deviceId, false);
      return deviceId;
    },
    [devices, selectedDeviceId],
  );

  const runPlayerCommand = useCallback(
    async (command: (token: string, deviceId?: string) => Promise<void>) => {
      if (!refreshToken) {
        setError("Please log in with Spotify first.");
        return;
      }

      try {
        const deviceId = await ensureTargetDevice(refreshToken);
        await command(refreshToken, deviceId);
        await refreshPlaybackState(refreshToken);
      } catch (err) {
        setError(toErrorMessage(err));
      }
    },
    [ensureTargetDevice, refreshPlaybackState, refreshToken],
  );

  const login = useCallback(async () => {
    setAuthenticating(true);
    setError(null);
    try {
      const authResult = await authenticateWithSpotify();
      await saveRefreshToken(authResult.refreshToken);
      setRefreshToken(authResult.refreshToken);
      await refreshAllInternal(authResult.refreshToken);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setAuthenticating(false);
    }
  }, [refreshAllInternal]);

  const refreshAll = useCallback(async () => {
    await refreshAllInternal();
  }, [refreshAllInternal]);

  const refreshPlayback = useCallback(async () => {
    await refreshPlaybackState();
  }, [refreshPlaybackState]);

  const playPlaylistById = useCallback(
    async (playlistId: string) => {
      await runPlayerCommand(async (token, deviceId) => {
        await playPlaylist(token, playlistId, deviceId);
      });
    },
    [runPlayerCommand],
  );

  const playTrackByUri = useCallback(
    async (trackUri: string) => {
      await runPlayerCommand(async (token, deviceId) => {
        await playTrack(token, trackUri, deviceId);
      });
    },
    [runPlayerCommand],
  );

  const playAlbumById = useCallback(
    async (albumId: string) => {
      await runPlayerCommand(async (token, deviceId) => {
        await playAlbum(token, albumId, deviceId);
      });
    },
    [runPlayerCommand],
  );

  const resume = useCallback(async () => {
    await runPlayerCommand(async (token, deviceId) => {
      await resumePlayback(token, deviceId);
    });
  }, [runPlayerCommand]);

  const pause = useCallback(async () => {
    await runPlayerCommand(async (token, deviceId) => {
      await pausePlayback(token, deviceId);
    });
  }, [runPlayerCommand]);

  const next = useCallback(async () => {
    await runPlayerCommand(async (token, deviceId) => {
      await skipToNextTrack(token, deviceId);
    });
  }, [runPlayerCommand]);

  const previous = useCallback(async () => {
    await runPlayerCommand(async (token, deviceId) => {
      await skipToPreviousTrack(token, deviceId);
    });
  }, [runPlayerCommand]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setInitializing(true);
      try {
        const savedToken = await loadRefreshToken();
        if (!cancelled) {
          setRefreshToken(savedToken);
          if (savedToken) {
            await refreshAllInternal(savedToken);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(toErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [refreshAllInternal]);

  useEffect(() => {
    if (!refreshToken) {
      setPlaylists([]);
      setDevices([]);
      setPlayback(null);
      setSelectedDeviceId(null);
      return;
    }

    const timer = setInterval(() => {
      void refreshPlaybackState(refreshToken);
    }, PLAYBACK_POLL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [refreshPlaybackState, refreshToken]);

  const value = useMemo<SpotifyControllerContextValue>(
    () => ({
      refreshToken,
      initializing,
      authenticating,
      loadingData,
      error,
      playlists,
      devices,
      selectedDeviceId,
      playback,
      login,
      refreshAll,
      refreshPlayback,
      clearError,
      setSelectedDeviceId,
      playPlaylistById,
      playTrackByUri,
      playAlbumById,
      resume,
      pause,
      next,
      previous,
    }),
    [
      refreshToken,
      initializing,
      authenticating,
      loadingData,
      error,
      playlists,
      devices,
      selectedDeviceId,
      playback,
      login,
      refreshAll,
      refreshPlayback,
      clearError,
      playPlaylistById,
      playTrackByUri,
      playAlbumById,
      resume,
      pause,
      next,
      previous,
    ],
  );

  return <SpotifyControllerContext.Provider value={value}>{children}</SpotifyControllerContext.Provider>;
}

export function useSpotifyController(): SpotifyControllerContextValue {
  const context = useContext(SpotifyControllerContext);
  if (!context) {
    throw new Error("useSpotifyController must be used inside SpotifyControllerProvider.");
  }

  return context;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Unexpected error";
}
