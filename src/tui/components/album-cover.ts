import { type CliRenderer } from "@opentui/core";
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer";
import { intToRGBA, Jimp } from "jimp";

import type { Track } from "../../backend/models.ts";

export const COVER_BLOCK_COLS = 34;
export const COVER_BLOCK_ROWS = 17;

const COVER_IMAGE_HEIGHT = COVER_BLOCK_ROWS * 2;
const LOADING_COVER_ANSI = "\x1b[38;2;148;163;184mLoading album cover...\x1b[0m";

export const EMPTY_COVER_ANSI = [
  "\x1b[38;2;148;163;184mNo album cover loaded.\x1b[0m",
  "\x1b[38;2;100;116;139mStart playback to render album art.\x1b[0m",
].join("\n");

export class AlbumCoverComponent {
  private coverAnsiCache = new Map<string, string>();
  private coverRequestId = 0;
  private activeCoverUrl: string | null = null;

  constructor(
    private readonly renderer: CliRenderer,
    private readonly coverTerminal: GhosttyTerminalRenderable,
  ) {}

  update(track: Track | null): void {
    this.updateAnsi(track);
  }

  destroy(): void {}

  private updateAnsi(track: Track | null): void {
    this.coverTerminal.visible = true;

    const coverUrl = track?.album?.coverUrl ?? null;
    if (!coverUrl) {
      this.activeCoverUrl = null;
      this.coverTerminal.ansi = EMPTY_COVER_ANSI;
      this.renderer.requestRender();
      return;
    }

    if (this.activeCoverUrl === coverUrl) {
      return;
    }

    this.activeCoverUrl = coverUrl;
    const cached = this.coverAnsiCache.get(coverUrl);
    if (cached) {
      this.coverTerminal.ansi = cached;
      this.renderer.requestRender();
      return;
    }

    this.coverTerminal.ansi = LOADING_COVER_ANSI;
    this.renderer.requestRender();

    const requestId = ++this.coverRequestId;
    void this.renderAlbumCoverAnsi(coverUrl)
      .then((coverAnsi) => {
        if (requestId !== this.coverRequestId || this.activeCoverUrl !== coverUrl) {
          return;
        }

        this.coverAnsiCache.set(coverUrl, coverAnsi);
        this.coverTerminal.ansi = coverAnsi;
        this.renderer.requestRender();
      })
      .catch((error) => {
        if (requestId !== this.coverRequestId || this.activeCoverUrl !== coverUrl) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        this.coverTerminal.ansi = `\x1b[38;2;248;113;113mAlbum art unavailable\x1b[0m\n${message}`;
        this.renderer.requestRender();
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
}
