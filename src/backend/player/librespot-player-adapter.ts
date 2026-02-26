import { spawn, type ChildProcess } from "node:child_process";

import type { PlayerAdapter } from "../ports.ts";

export interface LibrespotPlayerAdapterOptions {
  command?: string;
  deviceName?: string;
  username?: string;
  password?: string;
  extraArgs?: string[];
  startupTimeoutMs?: number;
}

export class LibrespotPlayerAdapter implements PlayerAdapter {
  private process: ChildProcess | null = null;

  private readonly command: string;
  private readonly deviceName: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly extraArgs: string[];
  private readonly startupTimeoutMs: number;

  constructor(options: LibrespotPlayerAdapterOptions = {}) {
    this.command = options.command ?? process.env.SPOTIFY_PLAYER_COMMAND ?? "librespot";
    this.deviceName = options.deviceName ?? process.env.SPOTIFY_PLAYER_DEVICE_NAME ?? "spotify-tui";
    this.username = options.username ?? process.env.SPOTIFY_PLAYER_USERNAME;
    this.password = options.password ?? process.env.SPOTIFY_PLAYER_PASSWORD;
    this.extraArgs = options.extraArgs ?? parseExtraArgs(process.env.SPOTIFY_PLAYER_ARGS);
    this.startupTimeoutMs = options.startupTimeoutMs ?? 2_500;
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  getPreferredDeviceName(): string | null {
    return this.deviceName;
  }

  async start(): Promise<void> {
    if (this.isRunning()) {
      return;
    }

    const args = this.buildCommandArgs();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let readyTimer: ReturnType<typeof setTimeout> | null = null;
      const child = spawn(this.command, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.process = child;

      const cleanup = () => {
        if (readyTimer) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        child.stdout.removeAllListeners("data");
        child.stderr.removeAllListeners("data");
      };

      const resolveOnce = () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      };

      const rejectOnce = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        this.process = null;
        cleanup();
        reject(error);
      };

      child.once("error", (error) => {
        rejectOnce(new Error(`Failed to start player '${this.command}': ${error.message}`));
      });

      child.once("exit", (code, signal) => {
        this.process = null;
        if (settled) {
          return;
        }

        cleanup();
        if (signal) {
          rejectOnce(new Error(`Player process exited early due to signal ${signal}.`));
          return;
        }

        rejectOnce(new Error(`Player process exited early with code ${code ?? "unknown"}.`));
      });

      readyTimer = setTimeout(() => {
        resolveOnce();
      }, this.startupTimeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        const line = String(chunk).trim();
        if (!line) {
          return;
        }

        if (line.toLowerCase().includes("error")) {
          rejectOnce(new Error(`Player startup error: ${line}`));
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const line = String(chunk).trim();
        if (!line) {
          return;
        }

        if (line.toLowerCase().includes("error") || line.toLowerCase().includes("failed")) {
          rejectOnce(new Error(`Player startup error: ${line}`));
        }
      });
    });
  }

  async stop(): Promise<void> {
    const child = this.process;
    if (!child) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
      }, 2_000);

      child.once("exit", () => {
        clearTimeout(timeout);
        this.process = null;
        resolve();
      });

      child.kill("SIGTERM");
    });
  }

  private buildCommandArgs(): string[] {
    const args = ["--name", this.deviceName, ...this.extraArgs];

    if (this.username) {
      args.push("--username", this.username);
    }

    if (this.password) {
      args.push("--password", this.password);
    }

    return args;
  }
}

function parseExtraArgs(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
