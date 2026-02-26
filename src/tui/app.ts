import {
  BoxRenderable,
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  type KeyEvent,
  type SelectOption,
  SelectRenderable,
  SelectRenderableEvents,
  TabSelectRenderable,
  TabSelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer";
import { intToRGBA, Jimp } from "jimp";

import type { BackendState, Device, PlaylistSummary, Track } from "../backend/models.ts";
import type { SpotifyBackend } from "../backend/spotify-backend.ts";

type ViewTab = "now" | "playlists" | "devices" | "search";

type BrowseAction =
  | "toggle-play"
  | "next"
  | "previous"
  | "refresh"
  | "start-player"
  | "stop-player";

type BrowseItemValue =
  | { kind: "action"; action: BrowseAction }
  | { kind: "playlist"; playlist: PlaylistSummary }
  | { kind: "device"; device: Device }
  | { kind: "track"; track: Track };

const TABS: Array<{ name: string; description: string; value: ViewTab }> = [
  { name: "Now", description: "Playback controls and status", value: "now" },
  { name: "Playlists", description: "Your Spotify playlists", value: "playlists" },
  { name: "Devices", description: "Available Spotify devices", value: "devices" },
  { name: "Search", description: "Track search results", value: "search" },
];

const REFRESH_PLAYBACK_MS = 4000;
const REFRESH_FULL_STATE_EVERY = 6;
const COVER_BLOCK_COLS = 34;
const COVER_BLOCK_ROWS = 17;
const COVER_IMAGE_HEIGHT = COVER_BLOCK_ROWS * 2;
const EMPTY_COVER_ANSI = [
  "\x1b[38;2;148;163;184mNo album cover loaded.\x1b[0m",
  "\x1b[38;2;100;116;139mStart playback to render album art.\x1b[0m",
].join("\n");
const LOADING_COVER_ANSI = "\x1b[38;2;148;163;184mLoading album cover...\x1b[0m";

export class SpotifyTuiApp {
  private renderer: CliRenderer | null = null;
  private headerText: TextRenderable | null = null;
  private coverTerminal: GhosttyTerminalRenderable | null = null;
  private detailsText: TextRenderable | null = null;
  private statusText: TextRenderable | null = null;
  private hintsText: TextRenderable | null = null;
  private searchInput: InputRenderable | null = null;
  private tabSelect: TabSelectRenderable | null = null;
  private browseSelect: SelectRenderable | null = null;

  private currentTab: ViewTab = "now";
  private searchResults: Track[] = [];
  private statusMessage = "Ready";
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private pollInFlight = false;
  private pollTick = 0;
  private isRunning = true;
  private stopResolver: (() => void) | null = null;

  private coverCache = new Map<string, string>();
  private coverRequestId = 0;
  private activeCoverUrl: string | null = null;

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

    const app = new BoxRenderable(this.renderer, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      padding: 1,
      gap: 1,
      backgroundColor: "#111111",
    });

    const header = new BoxRenderable(this.renderer, {
      border: true,
      borderStyle: "rounded",
      borderColor: "#3f3f46",
      title: "Spotify TUI",
      height: 4,
      paddingX: 1,
      paddingY: 0,
    });
    this.headerText = new TextRenderable(this.renderer, {
      content: "Initializing...",
      fg: "#fafafa",
    });
    header.add(this.headerText);

    const main = new BoxRenderable(this.renderer, {
      flexGrow: 1,
      flexDirection: "row",
      gap: 1,
    });

    const leftPane = new BoxRenderable(this.renderer, {
      width: "40%",
      border: true,
      borderStyle: "single",
      borderColor: "#3f3f46",
      title: "Browse",
      flexDirection: "column",
      padding: 1,
      gap: 1,
    });

    this.tabSelect = new TabSelectRenderable(this.renderer, {
      options: TABS,
      showDescription: false,
      showUnderline: true,
      wrapSelection: true,
      selectedBackgroundColor: "#14532d",
      selectedTextColor: "#ecfccb",
      focusedBackgroundColor: "#0f172a",
      focusedTextColor: "#e2e8f0",
    });

    this.browseSelect = new SelectRenderable(this.renderer, {
      flexGrow: 1,
      options: [],
      wrapSelection: true,
      showDescription: true,
      selectedBackgroundColor: "#1e293b",
      selectedTextColor: "#f8fafc",
      focusedBackgroundColor: "#0f172a",
      focusedTextColor: "#cbd5e1",
    });

    leftPane.add(this.tabSelect);
    leftPane.add(this.browseSelect);

    const rightPane = new BoxRenderable(this.renderer, {
      flexGrow: 1,
      border: true,
      borderStyle: "single",
      borderColor: "#3f3f46",
      title: "Details",
      flexDirection: "row",
      gap: 1,
      padding: 1,
    });

    const coverPane = new BoxRenderable(this.renderer, {
      width: "45%",
      border: true,
      borderStyle: "single",
      borderColor: "#334155",
      title: "Current Album Cover",
      padding: 1,
    });

    this.coverTerminal = new GhosttyTerminalRenderable(this.renderer, {
      width: "100%",
      height: "100%",
      ansi: EMPTY_COVER_ANSI,
      cols: COVER_BLOCK_COLS,
      rows: COVER_BLOCK_ROWS,
      selectable: false,
      wrapMode: "none",
      truncate: true,
    });

    coverPane.add(this.coverTerminal);

    const metaPane = new BoxRenderable(this.renderer, {
      flexGrow: 1,
      border: true,
      borderStyle: "single",
      borderColor: "#334155",
      title: "Now Playing",
      padding: 1,
    });

    this.detailsText = new TextRenderable(this.renderer, {
      content: "Loading...",
      fg: "#e5e7eb",
    });

    metaPane.add(this.detailsText);
    rightPane.add(coverPane);
    rightPane.add(metaPane);

    main.add(leftPane);
    main.add(rightPane);

    const footer = new BoxRenderable(this.renderer, {
      border: true,
      borderStyle: "single",
      borderColor: "#3f3f46",
      title: "Controls",
      flexDirection: "column",
      height: 6,
      paddingX: 1,
      paddingY: 0,
    });

    this.hintsText = new TextRenderable(this.renderer, {
      fg: "#a1a1aa",
      content:
        "Ctrl+Q quit | Ctrl+P play/pause | Ctrl+N next | Ctrl+B prev | Ctrl+R refresh | 1-4 tabs | / focus search | Tab focus",
    });

    this.searchInput = new InputRenderable(this.renderer, {
      placeholder: "Search track, press Enter",
      value: "",
      width: "100%",
    });

    this.statusText = new TextRenderable(this.renderer, {
      fg: "#d4d4d8",
      content: "Ready",
    });

    footer.add(this.hintsText);
    footer.add(this.searchInput);
    footer.add(this.statusText);

    app.add(header);
    app.add(main);
    app.add(footer);
    this.renderer.root.add(app);

    this.browseSelect.focus();
  }

  private attachRendererListeners(): void {
    if (!this.renderer || !this.tabSelect || !this.browseSelect || !this.searchInput) {
      return;
    }

    this.tabSelect.on(TabSelectRenderableEvents.SELECTION_CHANGED, () => {
      const selected = this.tabSelect?.getSelectedOption();
      if (!selected) {
        return;
      }

      this.currentTab = selected.value as ViewTab;
      this.updateBrowseOptions();
      this.updateDetails();
      this.renderer?.requestRender();
    });

    this.browseSelect.on(SelectRenderableEvents.ITEM_SELECTED, () => {
      void this.handleBrowseSelection();
    });

    this.searchInput.on(InputRenderableEvents.ENTER, () => {
      void this.runSearchFromInput();
    });

    this.renderer.keyInput.on("keypress", (key) => {
      void this.handleGlobalKeypress(key);
    });
  }

  private async handleGlobalKeypress(key: KeyEvent): Promise<void> {
    if (!this.renderer || !this.searchInput || !this.browseSelect || !this.tabSelect) {
      return;
    }

    const searchFocused = this.renderer.currentFocusedRenderable === this.searchInput;

    if (key.name === "tab") {
      key.preventDefault();
      if (searchFocused) {
        this.browseSelect.focus();
        this.setStatus("Focus: browse");
      } else {
        this.searchInput.focus();
        this.setStatus("Focus: search");
      }
      return;
    }

    if (key.name === "escape" && searchFocused) {
      key.preventDefault();
      this.browseSelect.focus();
      this.setStatus("Focus: browse");
      return;
    }

    if (key.name === "/" && !searchFocused) {
      key.preventDefault();
      this.searchInput.focus();
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
    }
  }

  private switchTab(tab: ViewTab): void {
    if (!this.tabSelect) {
      return;
    }

    const tabIndex = TABS.findIndex((item) => item.value === tab);
    if (tabIndex < 0) {
      return;
    }

    this.currentTab = tab;
    this.tabSelect.setSelectedIndex(tabIndex);
    this.updateBrowseOptions();
    this.updateDetails();
    this.renderer?.requestRender();
  }

  private async handleBrowseSelection(): Promise<void> {
    if (!this.browseSelect) {
      return;
    }

    const selected = this.browseSelect.getSelectedOption();
    if (!selected || !selected.value) {
      return;
    }

    const value = selected.value as BrowseItemValue;

    if (value.kind === "playlist") {
      await this.runTask(`Play playlist: ${value.playlist.name}`, async () => {
        await this.backend.play({
          contextUri: `spotify:playlist:${value.playlist.id}`,
        });
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
    if (!this.searchInput) {
      return;
    }

    const query = this.searchInput.value.trim();
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

    this.searchInput.value = "";
    this.searchInput.blur();
    this.browseSelect?.focus();
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
    if (!this.headerText || !this.detailsText || !this.statusText || !this.hintsText || !this.searchInput) {
      return;
    }

    const state = this.backend.getState();

    this.headerText.content = this.buildHeaderText(state);
    this.updateBrowseOptions(state);
    this.updateDetails(state);
    this.updateAlbumCover(state.playback?.item ?? null);

    this.statusText.content = `Status: ${this.statusMessage}`;
    this.hintsText.content =
      "Ctrl+Q quit | Ctrl+P play/pause | Ctrl+N next | Ctrl+B prev | Ctrl+R refresh | 1-4 tabs | / search | Tab focus";

    this.renderer?.requestRender();
  }

  private updateBrowseOptions(state?: BackendState): void {
    if (!this.browseSelect) {
      return;
    }

    const snapshot = state ?? this.backend.getState();
    const currentSelection = this.browseSelect.getSelectedOption();
    const previousName = currentSelection?.name;

    const options = this.buildBrowseOptions(snapshot);
    this.browseSelect.options = options;

    if (options.length === 0) {
      return;
    }

    const preferredIndex = previousName
      ? options.findIndex((option) => option.name === previousName)
      : -1;

    this.browseSelect.setSelectedIndex(preferredIndex >= 0 ? preferredIndex : 0);
  }

  private buildBrowseOptions(state: BackendState): SelectOption[] {
    if (this.currentTab === "now") {
      const isPlaying = Boolean(state.playback?.isPlaying);

      return [
        {
          name: isPlaying ? "Pause" : "Play",
          description: isPlaying ? "Pause current playback" : "Resume current playback",
          value: { kind: "action", action: "toggle-play" } satisfies BrowseItemValue,
        },
        {
          name: "Next",
          description: "Skip to next track",
          value: { kind: "action", action: "next" } satisfies BrowseItemValue,
        },
        {
          name: "Previous",
          description: "Go to previous track",
          value: { kind: "action", action: "previous" } satisfies BrowseItemValue,
        },
        {
          name: "Refresh",
          description: "Reload user/playback/devices",
          value: { kind: "action", action: "refresh" } satisfies BrowseItemValue,
        },
        {
          name: "Start Player",
          description: "Start local player adapter",
          value: { kind: "action", action: "start-player" } satisfies BrowseItemValue,
        },
        {
          name: "Stop Player",
          description: "Stop local player adapter",
          value: { kind: "action", action: "stop-player" } satisfies BrowseItemValue,
        },
      ];
    }

    if (this.currentTab === "playlists") {
      return state.playlists.map((playlist) => ({
        name: playlist.name,
        description: `${playlist.tracksTotal} tracks | owner: ${playlist.ownerName}`,
        value: { kind: "playlist", playlist } satisfies BrowseItemValue,
      }));
    }

    if (this.currentTab === "devices") {
      return state.devices.map((device) => ({
        name: `${device.isActive ? "* " : ""}${device.name}`,
        description: `${device.type} | volume: ${device.volumePercent ?? "n/a"}`,
        value: { kind: "device", device } satisfies BrowseItemValue,
      }));
    }

    return this.searchResults.map((track) => ({
      name: track.name,
      description: `${track.artists.map((artist) => artist.name).join(", ")} | ${formatDuration(track.durationMs)}`,
      value: { kind: "track", track } satisfies BrowseItemValue,
    }));
  }

  private updateDetails(state?: BackendState): void {
    if (!this.detailsText) {
      return;
    }

    const snapshot = state ?? this.backend.getState();
    this.detailsText.content = this.buildDetailsText(snapshot);
  }

  private buildHeaderText(state: BackendState): string {
    const userLabel = state.user ? `${state.user.displayName} (${state.user.id})` : "not authenticated";
    const deviceLabel = state.playback?.device?.name ?? "none";
    const nowLabel = state.playback?.item
      ? `${state.playback.item.name} - ${state.playback.item.artists.map((artist) => artist.name).join(", ")}`
      : "nothing playing";

    return `User: ${userLabel}\nNow: ${nowLabel}\nDevice: ${deviceLabel}`;
  }

  private buildDetailsText(state: BackendState): string {
    const lines: string[] = [];

    lines.push(`View: ${this.currentTab.toUpperCase()}`);
    lines.push("");

    if (state.playback?.item) {
      const track = state.playback.item;
      const artists = track.artists.map((artist) => artist.name).join(", ");
      const albumName = track.album?.name ?? "Unknown";
      const progress = formatDuration(state.playback.progressMs);
      const duration = formatDuration(track.durationMs);

      lines.push(`Track    : ${track.name}`);
      lines.push(`Artists  : ${artists}`);
      lines.push(`Album    : ${albumName}`);
      lines.push(`Device   : ${state.playback.device?.name ?? "none"}`);
      lines.push(`State    : ${state.playback.isPlaying ? "Playing" : "Paused"}`);
      lines.push(`Timeline : ${progress} / ${duration}`);
      lines.push(`Progress : ${buildProgressBar(track.durationMs, state.playback.progressMs, 22)}`);
      lines.push(`Shuffle  : ${state.playback.shuffleState ? "On" : "Off"}`);
      lines.push(`Repeat   : ${state.playback.repeatState}`);
    } else {
      lines.push("No active track.");
      lines.push("Start playback from Spotify or pick a playlist/device from Browse.");
    }

    lines.push("");
    lines.push("Library Snapshot");
    lines.push(`- Playlists: ${state.playlists.length}`);
    lines.push(`- Devices  : ${state.devices.length}`);
    lines.push(`- Search   : ${this.searchResults.length}`);

    if (state.lastUpdatedAt) {
      lines.push("");
      lines.push(`Last update: ${new Date(state.lastUpdatedAt).toLocaleTimeString()}`);
    }

    return lines.join("\n");
  }

  private updateAlbumCover(track: Track | null): void {
    if (!this.coverTerminal) {
      return;
    }

    const coverUrl = track?.album?.coverUrl ?? null;

    if (!coverUrl) {
      this.activeCoverUrl = null;
      this.coverTerminal.ansi = EMPTY_COVER_ANSI;
      this.renderer?.requestRender();
      return;
    }

    if (this.activeCoverUrl === coverUrl) {
      return;
    }

    this.activeCoverUrl = coverUrl;
    const cached = this.coverCache.get(coverUrl);
    if (cached) {
      this.coverTerminal.ansi = cached;
      this.renderer?.requestRender();
      return;
    }

    this.coverTerminal.ansi = LOADING_COVER_ANSI;
    this.renderer?.requestRender();

    const requestId = ++this.coverRequestId;

    void this.renderAlbumCoverAnsi(coverUrl)
      .then((coverAnsi) => {
        if (requestId !== this.coverRequestId || this.activeCoverUrl !== coverUrl || !this.coverTerminal) {
          return;
        }

        this.coverCache.set(coverUrl, coverAnsi);
        this.coverTerminal.ansi = coverAnsi;
        this.renderer?.requestRender();
      })
      .catch((error) => {
        if (requestId !== this.coverRequestId || this.activeCoverUrl !== coverUrl || !this.coverTerminal) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        this.coverTerminal.ansi = `\x1b[38;2;248;113;113mAlbum art unavailable\x1b[0m\n${message}`;
        this.renderer?.requestRender();
      });
  }

  private async renderAlbumCoverAnsi(coverUrl: string): Promise<string> {
    const image = await Jimp.read(coverUrl);
    image.cover({ w: COVER_BLOCK_COLS, h: COVER_IMAGE_HEIGHT });

    const rows: string[] = [];

    for (let y = 0; y < image.bitmap.height; y += 2) {
      let line = "";

      for (let x = 0; x < image.bitmap.width; x += 1) {
        const top = intToRGBA(image.getPixelColor(x, y));
        const bottom = intToRGBA(image.getPixelColor(x, Math.min(y + 1, image.bitmap.height - 1)));
        line += `\x1b[38;2;${top.r};${top.g};${top.b}m\x1b[48;2;${bottom.r};${bottom.g};${bottom.b}m▀`;
      }

      rows.push(`${line}\x1b[0m`);
    }

    return rows.join("\n");
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
    if (this.statusText) {
      this.statusText.content = `Status: ${message}`;
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

    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
  }
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildProgressBar(totalMs: number, progressMs: number, width: number): string {
  if (totalMs <= 0 || width <= 0) {
    return "[----------------------]";
  }

  const ratio = Math.max(0, Math.min(1, progressMs / totalMs));
  const filled = Math.round(width * ratio);
  return `[${"#".repeat(filled)}${"-".repeat(Math.max(0, width - filled))}]`;
}
