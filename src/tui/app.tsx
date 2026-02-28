import { createCliRenderer } from "@opentui/core";
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer";
import { createRoot, useRenderer } from "@opentui/react";
import { useCallback, useMemo, useRef, useState } from "react";

import type { BackendState, Track } from "../backend/models.ts";
import type { SpotifyBackend } from "../backend/spotify-backend.ts";
import {
  type BrowseAction,
  type BrowseItemValue,
  type ViewTab,
  buildBrowseOptions,
} from "./components/browse.ts";
import { BrowsePanel } from "./components/browse-panel.tsx";
import { ControlsPanel } from "./components/controls-panel.tsx";
import { DetailsPanel } from "./components/details-panel.tsx";
import { buildDetailsText, buildHeaderText } from "./components/formatters.ts";
import { HeaderPanel } from "./components/header-panel.tsx";
import { useAlbumCover } from "./hooks/use-album-cover.ts";
import { useBackendLifecycle } from "./hooks/use-backend-lifecycle.ts";
import { useBrowseUiSync } from "./hooks/use-browse-ui-sync.ts";
import { useGlobalKeyboard } from "./hooks/use-global-keyboard.ts";
import { usePlaybackPolling } from "./hooks/use-playback-polling.ts";
import type { BrowseSelectHandle, SearchInputHandle, TabSelectHandle, TuiKeyEvent } from "./types.ts";

interface SpotifyTuiRootProps {
  backend: SpotifyBackend;
  onExit: () => void;
}

function SpotifyTuiRoot({ backend, onExit }: SpotifyTuiRootProps): React.ReactNode {
  const renderer = useRenderer();

  const [backendState, setBackendState] = useState<BackendState>(() => backend.getState());
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [currentTab, setCurrentTab] = useState<ViewTab>("now");
  const [statusMessage, setStatusMessage] = useState("Initializing backend...");
  const [backendReady, setBackendReady] = useState(false);
  const [focusTarget, setFocusTarget] = useState<"browse" | "search">("browse");
  const [browseSelectedIndex, setBrowseSelectedIndex] = useState(0);

  const tabSelectRef = useRef<TabSelectHandle | null>(null);
  const browseSelectRef = useRef<BrowseSelectHandle | null>(null);
  const searchInputRef = useRef<SearchInputHandle | null>(null);
  const coverTerminalRef = useRef<GhosttyTerminalRenderable | null>(null);
  const selectedBrowseNameRef = useRef<string | null>(null);
  const exitRequestedRef = useRef(false);

  const browseOptions = useMemo(
    () => buildBrowseOptions(backendState, currentTab, searchResults),
    [backendState, currentTab, searchResults],
  );
  const headerText = useMemo(() => buildHeaderText(backendState), [backendState]);
  const detailsText = useMemo(
    () => buildDetailsText(backendState, currentTab, searchResults.length),
    [backendState, currentTab, searchResults.length],
  );

  // Prevent duplicate teardown by only resolving the exit signal once.
  const requestExit = useCallback(() => {
    if (exitRequestedRef.current) {
      return;
    }

    exitRequestedRef.current = true;
    onExit();
  }, [onExit]);

  // Wrap async UI commands with consistent status reporting.
  const runTask = useCallback(async (description: string, task: () => Promise<void>) => {
    setStatusMessage(`${description}...`);
    try {
      await task();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`${description} failed: ${message}`);
    }
  }, []);

  // Translate high-level browse actions into backend calls.
  const runAction = useCallback(
    async (action: BrowseAction) => {
      switch (action) {
        case "toggle-play": {
          await runTask("Toggle play/pause", async () => {
            const state = backend.getState();
            if (state.playback?.isPlaying) {
              await backend.pause();
            } else {
              await backend.play();
            }
          });
          break;
        }
        case "next": {
          await runTask("Next track", async () => {
            await backend.nextTrack();
          });
          break;
        }
        case "previous": {
          await runTask("Previous track", async () => {
            await backend.previousTrack();
          });
          break;
        }
        case "refresh": {
          await runTask("Refreshing state", async () => {
            await backend.refresh();
          });
          break;
        }
        case "start-player": {
          await runTask("Starting local player", async () => {
            const started = await backend.startPlayer();
            setStatusMessage(started ? "Player started" : "No player adapter configured");
          });
          break;
        }
        case "stop-player": {
          await runTask("Stopping local player", async () => {
            const stopped = await backend.stopPlayer();
            setStatusMessage(stopped ? "Player stopped" : "No player adapter configured");
          });
          break;
        }
      }
    },
    [backend, runTask],
  );

  // Read the search box directly, then return focus to the browse list.
  const runSearchFromInput = useCallback(async () => {
    const query = (searchInputRef.current?.value ?? "").trim();
    if (!query) {
      setStatusMessage("Search query is empty");
      return;
    }

    await runTask(`Searching '${query}'`, async () => {
      const results = await backend.searchTracks(query, 20);
      setSearchResults(results);
      setCurrentTab("search");
      setStatusMessage(`Search returned ${results.length} track(s)`);
    });

    if (searchInputRef.current) {
      searchInputRef.current.value = "";
      searchInputRef.current.blur();
    }
    setFocusTarget("browse");
  }, [backend, runTask]);

  // Dispatch the selected browse entry according to its item type.
  const handleBrowseSelection = useCallback(async () => {
    const selected = browseSelectRef.current?.getSelectedOption();
    if (!selected || !selected.value) {
      return;
    }

    const value = selected.value as BrowseItemValue;

    if (value.kind === "playlist") {
      await runTask(`Play playlist: ${value.playlist.name}`, async () => {
        const contextUri = value.playlist.contextUri ?? `spotify:playlist:${value.playlist.id}`;
        await backend.play({ contextUri });
      });
      return;
    }

    if (value.kind === "device") {
      const deviceId = value.device.id;
      if (!deviceId) {
        setStatusMessage(`Device '${value.device.name}' cannot be selected (missing id)`);
        return;
      }

      await runTask(`Transfer playback: ${value.device.name}`, async () => {
        await backend.transferPlayback(deviceId, false);
      });
      return;
    }

    if (value.kind === "track") {
      await runTask(`Play track: ${value.track.name}`, async () => {
        await backend.play({ uris: [value.track.uri] });
      });
      return;
    }

    await runAction(value.action);
  }, [backend, runAction, runTask]);

  // Global shortcuts stay disabled while the search input owns focus.
  const handleGlobalKeypress = useCallback(
    (key: TuiKeyEvent) => {
      if (key.name === "tab") {
        key.preventDefault();
        setFocusTarget((prev: "browse" | "search") => (prev === "search" ? "browse" : "search"));
        setStatusMessage((prev: string) => (prev.startsWith("Focus:") ? prev : "Focus changed"));
        return;
      }

      if (key.name === "escape" && focusTarget === "search") {
        key.preventDefault();
        setFocusTarget("browse");
        setStatusMessage("Focus: browse");
        return;
      }

      if (key.name === "/" && focusTarget !== "search") {
        key.preventDefault();
        setFocusTarget("search");
        setStatusMessage("Focus: search");
        return;
      }

      if (focusTarget === "search") {
        return;
      }

      if (key.ctrl && key.name === "q") {
        key.preventDefault();
        requestExit();
        return;
      }

      if (key.ctrl && key.name === "r") {
        key.preventDefault();
        void runTask("Refreshing state", async () => {
          await backend.refresh();
        });
        return;
      }

      if (key.ctrl && key.name === "p") {
        key.preventDefault();
        void runTask("Toggle play/pause", async () => {
          const state = backend.getState();
          if (state.playback?.isPlaying) {
            await backend.pause();
          } else {
            await backend.play();
          }
        });
        return;
      }

      if (key.ctrl && key.name === "n") {
        key.preventDefault();
        void runTask("Next track", async () => {
          await backend.nextTrack();
        });
        return;
      }

      if (key.ctrl && key.name === "b") {
        key.preventDefault();
        void runTask("Previous track", async () => {
          await backend.previousTrack();
        });
        return;
      }

      if (key.name === "1") {
        setCurrentTab("now");
        return;
      }

      if (key.name === "2") {
        setCurrentTab("playlists");
        return;
      }

      if (key.name === "3") {
        setCurrentTab("devices");
        return;
      }

      if (key.name === "4") {
        setCurrentTab("search");
      }
    },
    [backend, focusTarget, requestExit, runTask],
  );

  useGlobalKeyboard(handleGlobalKeypress);
  useBackendLifecycle({
    backend,
    setBackendState,
    setBackendReady,
    setStatusMessage,
  });
  useBrowseUiSync({
    browseOptions,
    currentTab,
    focusTarget,
    setBrowseSelectedIndex,
    selectedBrowseNameRef,
    tabSelectRef,
    browseSelectRef,
    searchInputRef,
  });
  usePlaybackPolling({
    backend,
    backendReady,
    setStatusMessage,
  });
  useAlbumCover({
    renderer,
    backend,
    playbackItem: backendState.playback?.item ?? null,
    coverTerminalRef,
  });

  // Mirror the visual tab control back into state when the selection changes.
  const handleTabChanged = useCallback(() => {
    const selected = tabSelectRef.current?.getSelectedOption();
    if (!selected) {
      return;
    }

    setCurrentTab(selected.value as ViewTab);
  }, []);

  // Preserve the selected item across list rebuilds when possible.
  const syncBrowseSelection = useCallback(() => {
    const selectedIndex = browseSelectRef.current?.getSelectedIndex() ?? 0;
    setBrowseSelectedIndex(selectedIndex);
    selectedBrowseNameRef.current = browseOptions[selectedIndex]?.name ?? null;
  }, [browseOptions]);

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} gap={1} backgroundColor="#111111">
      <HeaderPanel headerText={headerText} />

      <box flexGrow={1} flexDirection="row" gap={1}>
        <BrowsePanel
          tabSelectRef={tabSelectRef}
          browseSelectRef={browseSelectRef}
          browseOptions={browseOptions}
          browseSelectedIndex={browseSelectedIndex}
          focusTarget={focusTarget}
          onTabChange={handleTabChanged}
          onBrowseChange={syncBrowseSelection}
          onBrowseSelect={() => {
            syncBrowseSelection();
            void handleBrowseSelection();
          }}
        />

        <DetailsPanel coverTerminalRef={coverTerminalRef} detailsText={detailsText} />
      </box>

      <ControlsPanel
        searchInputRef={searchInputRef}
        focusTarget={focusTarget}
        statusMessage={statusMessage}
        onSearchSubmit={() => {
          void runSearchFromInput();
        }}
      />
    </box>
  );
}

export class SpotifyTuiApp {
  constructor(private readonly backend: SpotifyBackend) {}

  async run(): Promise<void> {
    const renderer = await createCliRenderer({
      useAlternateScreen: true,
      useConsole: false,
      exitOnCtrlC: true,
      useMouse: true,
      autoFocus: true,
    });

    const root = createRoot(renderer as unknown as Parameters<typeof createRoot>[0]);

    await new Promise<void>((resolve) => {
      root.render(<SpotifyTuiRoot backend={this.backend} onExit={resolve} />);
    });

    root.unmount();

    try {
      await this.backend.stopPlayer();
    } catch {
      // Ignore shutdown errors from optional player adapter.
    }

    renderer.destroy();
  }
}
