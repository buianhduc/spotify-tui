import type { BackendState } from "../../backend/models.ts";
import type { ViewTab } from "./browse.ts";

export function buildHeaderText(state: BackendState): string {
  const userLabel = state.user ? `${state.user.displayName} (${state.user.id})` : "not authenticated";
  const deviceLabel = state.playback?.device?.name ?? "none";
  const nowLabel = state.playback?.item
    ? `${state.playback.item.name} - ${state.playback.item.artists.map((artist) => artist.name).join(", ")}`
    : "nothing playing";

  return `User: ${userLabel}\nNow: ${nowLabel}\nDevice: ${deviceLabel}`;
}

export function buildDetailsText(state: BackendState, currentTab: ViewTab, searchResultsCount: number): string {
  const lines: string[] = [];

  lines.push(`View: ${currentTab.toUpperCase()}`);
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
  lines.push(`- Search   : ${searchResultsCount}`);

  if (state.lastUpdatedAt) {
    lines.push("");
    lines.push(`Last update: ${new Date(state.lastUpdatedAt).toLocaleTimeString()}`);
  }

  return lines.join("\n");
}

export function formatDuration(durationMs: number): string {
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
