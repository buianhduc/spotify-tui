import { type CliRenderer } from "@opentui/core";
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer";
import { intToRGBA, Jimp } from "jimp";

import type { Track } from "../../backend/models.ts";

export type CoverRenderMode = "ansi" | "kitty";

export const COVER_BLOCK_COLS = 34;
export const COVER_BLOCK_ROWS = 17;

const COVER_IMAGE_HEIGHT = COVER_BLOCK_ROWS * 2;
const COVER_KITTY_IMAGE_SIZE = 320;
const KITTY_IMAGE_CHUNK_SIZE = 4096;
const KITTY_IMAGE_ID = 9001;
const LOADING_COVER_ANSI = "\x1b[38;2;148;163;184mLoading album cover...\x1b[0m";

export const EMPTY_COVER_ANSI = [
  "\x1b[38;2;148;163;184mNo album cover loaded.\x1b[0m",
  "\x1b[38;2;100;116;139mStart playback to render album art.\x1b[0m",
].join("\n");

export class AlbumCoverComponent {
  private coverAnsiCache = new Map<string, string>();
  private coverPngCache = new Map<string, Buffer>();
  private coverRequestId = 0;
  private activeCoverUrl: string | null = null;
  private activeKittyImage: Buffer | null = null;
  private lastKittyRenderKey: string | null = null;
  private renderMode: CoverRenderMode;

  constructor(
    private readonly renderer: CliRenderer,
    private readonly coverTerminal: GhosttyTerminalRenderable,
  ) {
    this.renderMode = this.resolveRenderMode(this.renderer.capabilities);
  }

  resolveRenderMode(capabilities: any | null): CoverRenderMode {
    return capabilities?.kitty_graphics ? "kitty" : "ansi";
  }

  setRenderMode(mode: CoverRenderMode): void {
    if (this.renderMode === mode) {
      return;
    }

    this.renderMode = mode;
    this.activeCoverUrl = null;
    this.lastKittyRenderKey = null;

    if (mode !== "kitty") {
      this.activeKittyImage = null;
      this.clearKittyImage();
      this.coverTerminal.visible = true;
    }
  }

  getMode(): CoverRenderMode {
    return this.renderMode;
  }

  update(track: Track | null): void {
    if (this.renderMode === "kitty") {
      this.updateKitty(track);
      return;
    }

    this.updateAnsi(track);
  }

  onResize(): void {
    if (this.renderMode === "kitty" && this.activeKittyImage) {
      this.drawKittyImage(this.activeKittyImage, true);
    }
  }

  destroy(): void {
    this.clearKittyImage();
  }

  private updateAnsi(track: Track | null): void {
    this.activeKittyImage = null;
    this.lastKittyRenderKey = null;
    this.clearKittyImage();
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

  private updateKitty(track: Track | null): void {
    const coverUrl = track?.album?.coverUrl ?? null;
    if (!coverUrl) {
      this.activeCoverUrl = null;
      this.activeKittyImage = null;
      this.lastKittyRenderKey = null;
      this.clearKittyImage();
      this.coverTerminal.visible = true;
      this.coverTerminal.ansi = EMPTY_COVER_ANSI;
      this.renderer.requestRender();
      return;
    }

    if (this.activeCoverUrl === coverUrl) {
      if (this.activeKittyImage) {
        this.coverTerminal.visible = false;
        this.drawKittyImage(this.activeKittyImage);
      }
      return;
    }

    this.activeCoverUrl = coverUrl;
    const cached = this.coverPngCache.get(coverUrl);
    if (cached) {
      this.activeKittyImage = cached;
      this.coverTerminal.visible = false;
      this.drawKittyImage(cached, true);
      this.renderer.requestRender();
      return;
    }

    this.activeKittyImage = null;
    this.lastKittyRenderKey = null;
    this.clearKittyImage();
    this.coverTerminal.visible = true;
    this.coverTerminal.ansi = LOADING_COVER_ANSI;
    this.renderer.requestRender();

    const requestId = ++this.coverRequestId;
    void this.renderAlbumCoverPng(coverUrl)
      .then((coverPng) => {
        if (requestId !== this.coverRequestId || this.activeCoverUrl !== coverUrl) {
          return;
        }

        this.coverPngCache.set(coverUrl, coverPng);
        this.activeKittyImage = coverPng;
        this.coverTerminal.visible = false;
        this.drawKittyImage(coverPng, true);
        this.renderer.requestRender();
      })
      .catch((error) => {
        if (requestId !== this.coverRequestId || this.activeCoverUrl !== coverUrl) {
          return;
        }

        this.activeKittyImage = null;
        this.lastKittyRenderKey = null;
        this.clearKittyImage();
        this.coverTerminal.visible = true;

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

  private async renderAlbumCoverPng(coverUrl: string): Promise<Buffer> {
    const image = await Jimp.read(coverUrl);
    image.cover({ w: COVER_KITTY_IMAGE_SIZE, h: COVER_KITTY_IMAGE_SIZE });
    return image.getBuffer("image/png");
  }

  private drawKittyImage(imagePng: Buffer, force = false): void {
    if (
      this.renderMode !== "kitty" ||
      !this.renderer.capabilities?.kitty_graphics ||
      !process.stdout.writable
    ) {
      return;
    }

    const cols = Math.max(1, Math.floor(this.coverTerminal.width));
    const rows = Math.max(1, Math.floor(this.coverTerminal.height));
    const col = Math.max(1, Math.floor(this.coverTerminal.x) + 1);
    const row = Math.max(1, Math.floor(this.coverTerminal.y) + 1);

    const renderKey = `${this.activeCoverUrl ?? "none"}:${col}:${row}:${cols}:${rows}:${imagePng.byteLength}`;
    if (!force && renderKey === this.lastKittyRenderKey) {
      return;
    }

    const base64Data = imagePng.toString("base64");
    const chunks: string[] = [];
    for (let offset = 0; offset < base64Data.length; offset += KITTY_IMAGE_CHUNK_SIZE) {
      const chunk = base64Data.slice(offset, offset + KITTY_IMAGE_CHUNK_SIZE);
      const more = offset + KITTY_IMAGE_CHUNK_SIZE < base64Data.length ? 1 : 0;
      const control =
        offset === 0
          ? `a=T,f=100,t=d,q=2,i=${KITTY_IMAGE_ID},c=${cols},r=${rows},m=${more}`
          : `m=${more}`;
      chunks.push(`\x1b_G${control};${chunk}\x1b\\`);
    }

    process.stdout.write(`\x1b7\x1b[${row};${col}H${chunks.join("")}\x1b8`);
    this.lastKittyRenderKey = renderKey;
  }

  private clearKittyImage(): void {
    if (!this.renderer.capabilities?.kitty_graphics || !process.stdout.writable) {
      return;
    }

    process.stdout.write(`\x1b_Ga=d,d=I,i=${KITTY_IMAGE_ID};\x1b\\`);
    this.lastKittyRenderKey = null;
  }
}
