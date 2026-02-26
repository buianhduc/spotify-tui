import type { SelectOption } from "@opentui/core";

import type { BackendState, Device, PlaylistSummary, Track } from "../../backend/models.ts";
import { formatDuration } from "./formatters.ts";

export type ViewTab = "now" | "playlists" | "devices" | "search";

export type BrowseAction =
  | "toggle-play"
  | "next"
  | "previous"
  | "refresh"
  | "start-player"
  | "stop-player";

export type BrowseItemValue =
  | { kind: "action"; action: BrowseAction }
  | { kind: "playlist"; playlist: PlaylistSummary }
  | { kind: "device"; device: Device }
  | { kind: "track"; track: Track };

export const TABS: Array<{ name: string; description: string; value: ViewTab }> = [
  { name: "Now", description: "Playback controls and status", value: "now" },
  { name: "Playlists", description: "Your Spotify playlists", value: "playlists" },
  { name: "Devices", description: "Available Spotify devices", value: "devices" },
  { name: "Search", description: "Track search results", value: "search" },
];

export function buildBrowseOptions(state: BackendState, currentTab: ViewTab, searchResults: Track[]): SelectOption[] {
  if (currentTab === "now") {
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

  if (currentTab === "playlists") {
    return state.playlists.map((playlist) => ({
      name: playlist.name,
      description: `${playlist.tracksTotal} tracks | owner: ${playlist.ownerName}`,
      value: { kind: "playlist", playlist } satisfies BrowseItemValue,
    }));
  }

  if (currentTab === "devices") {
    return state.devices.map((device) => ({
      name: `${device.isActive ? "* " : ""}${device.name}`,
      description: `${device.type} | volume: ${device.volumePercent ?? "n/a"}`,
      value: { kind: "device", device } satisfies BrowseItemValue,
    }));
  }

  return searchResults.map((track) => ({
    name: track.name,
    description: `${track.artists.map((artist) => artist.name).join(", ")} | ${formatDuration(track.durationMs)}`,
    value: { kind: "track", track } satisfies BrowseItemValue,
  }));
}
