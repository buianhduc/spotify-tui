import {
  createCliRenderer,
  InputRenderableEvents,
  type KeyEvent,
  SelectRenderableEvents,
  TabSelectRenderableEvents,
  type CliRenderer,
} from "@opentui/core";

import type { BackendState, Track } from "../backend/models.ts";
import type { SpotifyBackend } from "../backend/spotify-backend.ts";
import { AlbumCoverComponent, EMPTY_COVER_ANSI } from "./components/album-cover.ts";
import {
  type BrowseAction,
  type BrowseItemValue,
  TABS,
  type ViewTab,
  buildBrowseOptions,
} from "./components/browse.ts";
import { buildDetailsText, buildHeaderText } from "./components/formatters.ts";
import { DEFAULT_HINTS, type TuiLayout, mountTuiLayout } from "./components/layout.ts";

const REFRESH_PLAYBACK_MS = 4000;
const REFRESH_FULL_STATE_EVERY = 6;

export class SpotifyTuiApp {
  private renderer: CliRenderer | null = null;
  private layout: TuiLayout | null = null;
  private albumCover: AlbumCoverComponent | null = null;

  private currentTab: ViewTab = "now";
  private searchResults: Track[] = [];
  private statusMessage = "Ready";
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private pollInFlight = false;
  private pollTick = 0;
  private isRunning = true;
  private stopResolver: (() => void) | null = null;

  private readonly disposers: Array<() => void> = [];

  constructor(private readonly backend: SpotifyBackend) {}

  async run(): Promise<void> {
    this.attachBackendListeners();
    await this.backend.initialize();

    this.renderer = await createCliRenderer({
      useAlternateScreen: true,
      useConsole: false,
      exitOnCtrlC: false,
      useMouse: true,
      autoFocus: true,
    });

    this.mountUi();
    this.attachRendererListeners();
    this.startBackgroundRefresh();
    this.refreshUi();

    await new Promise<void>((resolve) => {
      this.stopResolver = resolve;
    });

    await this.shutdown();
  }

  private attachBackendListeners(): void {
    this.disposers.push(
      this.backend.on("stateChanged", () => {
        this.refreshUi();
      }),
    );

    this.disposers.push(
      this.backend.on("error", (error) => {
        this.setStatus(`Error: ${error.message}`);
      }),
    );
  }

  private mountUi(): void {
    if (!this.renderer) {
      return;
    }

    this.layout = mountTuiLayout(this.renderer, EMPTY_COVER_ANSI);
    this.albumCover = new AlbumCoverComponent(this.renderer, this.layout.coverTerminal);
  }

  private attachRendererListeners(): void {
    if (!this.renderer || !this.layout || !this.albumCover) {
      return;
    }

    const { tabSelect, browseSelect, searchInput } = this.layout;

    const onCapabilities = (capabilities: any) => {
      if (!this.albumCover) {
        return;
      }

      const nextMode = this.albumCover.resolveRenderMode(capabilities);
      if (nextMode === this.albumCover.getMode()) {
        return;
      }

      this.albumCover.setRenderMode(nextMode);
      this.albumCover.update(this.backend.getState().playback?.item ?? null);
      this.setStatus(nextMode === "kitty" ? "Album cover mode: kitty graphics" : "Album cover mode: ANSI fallback");
    };

    const onResize = () => {
      this.albumCover?.onResize();
    };

    this.renderer.on("capabilities", onCapabilities);
    this.renderer.on("resize", onResize);
    this.disposers.push(() => {
      this.renderer?.off("capabilities", onCapabilities);
      this.renderer?.off("resize", onResize);
    });

    tabSelect.on(TabSelectRenderableEvents.SELECTION_CHANGED, () => {
      const selected = tabSelect.getSelectedOption();
      if (!selected) {
        return;
      }

      this.currentTab = selected.value as ViewTab;
      this.updateBrowseOptions();
      this.updateDetails();
      this.renderer?.requestRender();
    });

    browseSelect.on(SelectRenderableEvents.ITEM_SELECTED, () => {
      void this.handleBrowseSelection();
    });

    searchInput.on(InputRenderableEvents.ENTER, () => {
      void this.runSearchFromInput();
    });

    this.renderer.keyInput.on("keypress", (key) => {
      void this.handleGlobalKeypress(key);
    });
  }

  private async handleGlobalKeypress(key: KeyEvent): Promise<void> {
    if (!this.renderer || !this.layout) {
      return;
    }

    const { searchInput, browseSelect, tabSelect } = this.layout;
    const searchFocused = this.renderer.currentFocusedRenderable === searchInput;

    if (key.name === "tab") {
      key.preventDefault();
      if (searchFocused) {
        browseSelect.focus();
        this.setStatus("Focus: browse");
      } else {
        searchInput.focus();
        this.setStatus("Focus: search");
      }
      return;
    }

    if (key.name === "escape" && searchFocused) {
      key.preventDefault();
      browseSelect.focus();
      this.setStatus("Focus: browse");
      return;
    }

    if (key.name === "/" && !searchFocused) {
      key.preventDefault();
      searchInput.focus();
      this.setStatus("Focus: search");
      return;
    }

    if (searchFocused) {
      return;
    }

    if (key.ctrl && key.name === "q") {
      key.preventDefault();
      this.requestStop();
      return;
    }

    if (key.ctrl && key.name === "r") {
      key.preventDefault();
      await this.runTask("Refreshing state", async () => {
        await this.backend.refresh();
      });
      return;
    }

    if (key.ctrl && key.name === "p") {
      key.preventDefault();
      await this.runTask("Toggle play/pause", async () => {
        const state = this.backend.getState();
        if (state.playback?.isPlaying) {
          await this.backend.pause();
        } else {
          await this.backend.play();
        }
      });
      return;
    }

    if (key.ctrl && key.name === "n") {
      key.preventDefault();
      await this.runTask("Next track", async () => {
        await this.backend.nextTrack();
      });
      return;
    }

    if (key.ctrl && key.name === "b") {
      key.preventDefault();
      await this.runTask("Previous track", async () => {
        await this.backend.previousTrack();
      });
      return;
    }

    if (key.name === "1") {
      this.switchTab("now");
      return;
    }

    if (key.name === "2") {
      this.switchTab("playlists");
      return;
    }

    if (key.name === "3") {
      this.switchTab("devices");
      return;
    }

    if (key.name === "4") {
      this.switchTab("search");
      return;
    }

    // Keep tabSelect focused behavior consistent when changing shortcuts.
    if (key.name === "left" || key.name === "right") {
      tabSelect.focus();
    }
  }

  private switchTab(tab: ViewTab): void {
    if (!this.layout) {
      return;
    }

    const tabIndex = TABS.findIndex((item) => item.value === tab);
    if (tabIndex < 0) {
      return;
    }

    this.currentTab = tab;
    this.layout.tabSelect.setSelectedIndex(tabIndex);
    this.updateBrowseOptions();
    this.updateDetails();
    this.renderer?.requestRender();
  }

  private async handleBrowseSelection(): Promise<void> {
    if (!this.layout) {
      return;
    }

    const selected = this.layout.browseSelect.getSelectedOption();
    if (!selected || !selected.value) {
      return;
    }

    const value = selected.value as BrowseItemValue;

    if (value.kind === "playlist") {
      await this.runTask(`Play playlist: ${value.playlist.name}`, async () => {
        const contextUri = value.playlist.contextUri ?? `spotify:playlist:${value.playlist.id}`;
        await this.backend.play({ contextUri });
      });
      return;
    }

    if (value.kind === "device") {
      const deviceId = value.device.id;
      if (!deviceId) {
        this.setStatus(`Device '${value.device.name}' cannot be selected (missing id)`);
        return;
      }

      await this.runTask(`Transfer playback: ${value.device.name}`, async () => {
        await this.backend.transferPlayback(deviceId, false);
      });
      return;
    }

    if (value.kind === "track") {
      await this.runTask(`Play track: ${value.track.name}`, async () => {
        await this.backend.play({ uris: [value.track.uri] });
      });
      return;
    }

    await this.runAction(value.action);
  }

  private async runAction(action: BrowseAction): Promise<void> {
    switch (action) {
      case "toggle-play": {
        await this.runTask("Toggle play/pause", async () => {
          const state = this.backend.getState();
          if (state.playback?.isPlaying) {
            await this.backend.pause();
          } else {
            await this.backend.play();
          }
        });
        break;
      }
      case "next": {
        await this.runTask("Next track", async () => {
          await this.backend.nextTrack();
        });
        break;
      }
      case "previous": {
        await this.runTask("Previous track", async () => {
          await this.backend.previousTrack();
        });
        break;
      }
      case "refresh": {
        await this.runTask("Refreshing state", async () => {
          await this.backend.refresh();
        });
        break;
      }
      case "start-player": {
        await this.runTask("Starting local player", async () => {
          const started = await this.backend.startPlayer();
          this.setStatus(started ? "Player started" : "No player adapter configured");
        });
        break;
      }
      case "stop-player": {
        await this.runTask("Stopping local player", async () => {
          const stopped = await this.backend.stopPlayer();
          this.setStatus(stopped ? "Player stopped" : "No player adapter configured");
        });
        break;
      }
    }
  }

  private async runSearchFromInput(): Promise<void> {
    if (!this.layout) {
      return;
    }

    const query = this.layout.searchInput.value.trim();
    if (!query) {
      this.setStatus("Search query is empty");
      return;
    }

    await this.runTask(`Searching '${query}'`, async () => {
      this.searchResults = await this.backend.searchTracks(query, 20);
      this.currentTab = "search";
      this.switchTab("search");
      this.setStatus(`Search returned ${this.searchResults.length} track(s)`);
    });

    this.layout.searchInput.value = "";
    this.layout.searchInput.blur();
    this.layout.browseSelect.focus();
  }

  private startBackgroundRefresh(): void {
    this.refreshInterval = setInterval(() => {
      void this.pollBackend();
    }, REFRESH_PLAYBACK_MS);
  }

  private async pollBackend(): Promise<void> {
    if (this.pollInFlight || !this.isRunning) {
      return;
    }

    this.pollInFlight = true;

    try {
      this.pollTick += 1;
      await this.backend.refreshPlayback();

      if (this.pollTick % REFRESH_FULL_STATE_EVERY === 0) {
        await this.backend.getDevices();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`Poll error: ${message}`);
    } finally {
      this.pollInFlight = false;
    }
  }

  private refreshUi(): void {
    if (!this.layout) {
      return;
    }

    const state = this.backend.getState();

    this.layout.headerText.content = buildHeaderText(state);
    this.updateBrowseOptions(state);
    this.updateDetails(state);
    this.albumCover?.update(state.playback?.item ?? null);

    this.layout.statusText.content = `Status: ${this.statusMessage}`;
    this.layout.hintsText.content = DEFAULT_HINTS;

    this.renderer?.requestRender();
  }

  private updateBrowseOptions(state?: BackendState): void {
    if (!this.layout) {
      return;
    }

    const snapshot = state ?? this.backend.getState();
    const currentSelection = this.layout.browseSelect.getSelectedOption();
    const previousName = currentSelection?.name;

    const options = buildBrowseOptions(snapshot, this.currentTab, this.searchResults);
    this.layout.browseSelect.options = options;

    if (options.length === 0) {
      return;
    }

    const preferredIndex = previousName ? options.findIndex((option) => option.name === previousName) : -1;
    this.layout.browseSelect.setSelectedIndex(preferredIndex >= 0 ? preferredIndex : 0);
  }

  private updateDetails(state?: BackendState): void {
    if (!this.layout) {
      return;
    }

    const snapshot = state ?? this.backend.getState();
    this.layout.detailsText.content = buildDetailsText(snapshot, this.currentTab, this.searchResults.length);
  }

  private async runTask(description: string, task: () => Promise<void>): Promise<void> {
    this.setStatus(`${description}...`);

    try {
      await task();
      this.refreshUi();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`${description} failed: ${message}`);
    }
  }

  private setStatus(message: string): void {
    this.statusMessage = message;
    if (this.layout) {
      this.layout.statusText.content = `Status: ${message}`;
    }
    this.renderer?.requestRender();
  }

  private requestStop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.stopResolver?.();
    this.stopResolver = null;
  }

  private async shutdown(): Promise<void> {
    this.isRunning = false;

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    try {
      await this.backend.stopPlayer();
    } catch {
      // Ignore shutdown errors from optional player adapter.
    }

    for (const dispose of this.disposers.splice(0, this.disposers.length)) {
      try {
        dispose();
      } catch {
        // Ignore disposer failures.
      }
    }

    this.albumCover?.destroy();

    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }

    this.layout = null;
    this.albumCover = null;
  }
}
