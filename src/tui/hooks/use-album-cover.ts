import type { CliRenderer } from "@opentui/core";
import { useEffect, useRef } from "react";
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer";

import type { Track } from "../../backend/models.ts";
import type { SpotifyBackend } from "../../backend/spotify-backend.ts";
import { AlbumCoverComponent } from "../components/album-cover.ts";

interface UseAlbumCoverOptions {
  renderer: CliRenderer;
  backend: SpotifyBackend;
  playbackItem: Track | null;
  coverTerminalRef: React.MutableRefObject<GhosttyTerminalRenderable | null>;
}

// Drive album art rendering independently from the rest of the screen layout.
export function useAlbumCover({
  renderer,
  backend,
  playbackItem,
  coverTerminalRef,
}: UseAlbumCoverOptions): void {
  const albumCoverRef = useRef<AlbumCoverComponent | null>(null);

  useEffect(() => {
    const coverTerminal = coverTerminalRef.current;
    if (!coverTerminal) {
      return;
    }

    const albumCover = new AlbumCoverComponent(renderer as unknown as CliRenderer, coverTerminal);
    albumCoverRef.current = albumCover;
    albumCover.update(backend.getState().playback?.item ?? null);

    return () => {
      albumCover.destroy();
      if (albumCoverRef.current === albumCover) {
        albumCoverRef.current = null;
      }
    };
  }, [backend, coverTerminalRef, renderer]);

  useEffect(() => {
    albumCoverRef.current?.update(playbackItem);
  }, [playbackItem]);
}
