import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer";
import { extend } from "@opentui/react";

import { COVER_BLOCK_COLS, COVER_BLOCK_ROWS, EMPTY_COVER_ANSI } from "./album-cover.ts";

const GhosttyTerminal: any = "ghostty-terminal";

extend({ "ghostty-terminal": GhosttyTerminalRenderable });

interface DetailsPanelProps {
  coverTerminalRef: React.RefObject<GhosttyTerminalRenderable | null>;
  detailsText: string;
}

// The details view owns album art and playback metadata, but not the loading logic.
export function DetailsPanel({ coverTerminalRef, detailsText }: DetailsPanelProps): React.ReactNode {
  return (
    <box
      flexGrow={1}
      border
      borderStyle="single"
      borderColor="#3f3f46"
      title="Details"
      flexDirection="row"
      gap={1}
      padding={1}
    >
      <box
        width="45%"
        border
        borderStyle="single"
        borderColor="#334155"
        title="Current Album Cover"
        padding={1}
        overflow="hidden"
      >
        <GhosttyTerminal
          ref={coverTerminalRef}
          width="100%"
          height="100%"
          ansi={EMPTY_COVER_ANSI}
          cols={COVER_BLOCK_COLS}
          rows={COVER_BLOCK_ROWS}
          selectable={false}
          wrapMode="none"
          truncate
        />
      </box>

      <box flexGrow={1} border borderStyle="single" borderColor="#334155" title="Now Playing" padding={1}>
        <text fg="#e5e7eb">{detailsText}</text>
      </box>
    </box>
  );
}
