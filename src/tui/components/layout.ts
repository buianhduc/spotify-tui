import {
  BoxRenderable,
  InputRenderable,
  SelectRenderable,
  TabSelectRenderable,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer";

import { TABS } from "./browse.ts";
import { COVER_BLOCK_COLS, COVER_BLOCK_ROWS } from "./album-cover.ts";

export const DEFAULT_HINTS =
  "Ctrl+Q quit | Ctrl+P play/pause | Ctrl+N next | Ctrl+B prev | Ctrl+R refresh | 1-4 tabs | / search | Tab focus";

export interface TuiLayout {
  headerText: TextRenderable;
  coverTerminal: GhosttyTerminalRenderable;
  detailsText: TextRenderable;
  statusText: TextRenderable;
  hintsText: TextRenderable;
  searchInput: InputRenderable;
  tabSelect: TabSelectRenderable;
  browseSelect: SelectRenderable;
}

export function mountTuiLayout(renderer: CliRenderer, initialCoverText: string): TuiLayout {
  const app = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    padding: 1,
    gap: 1,
    backgroundColor: "#111111",
  });

  const header = new BoxRenderable(renderer, {
    border: true,
    borderStyle: "rounded",
    borderColor: "#3f3f46",
    title: "Spotify TUI",
    height: 4,
    paddingX: 1,
    paddingY: 0,
  });
  const headerText = new TextRenderable(renderer, {
    content: "Initializing...",
    fg: "#fafafa",
  });
  header.add(headerText);

  const main = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexDirection: "row",
    gap: 1,
  });

  const leftPane = new BoxRenderable(renderer, {
    width: "40%",
    border: true,
    borderStyle: "single",
    borderColor: "#3f3f46",
    title: "Browse",
    flexDirection: "column",
    padding: 1,
    gap: 1,
  });

  const tabSelect = new TabSelectRenderable(renderer, {
    options: TABS,
    showDescription: false,
    showUnderline: true,
    wrapSelection: true,
    selectedBackgroundColor: "#14532d",
    selectedTextColor: "#ecfccb",
    focusedBackgroundColor: "#0f172a",
    focusedTextColor: "#e2e8f0",
  });

  const browseSelect = new SelectRenderable(renderer, {
    flexGrow: 1,
    options: [],
    wrapSelection: true,
    showDescription: true,
    selectedBackgroundColor: "#1e293b",
    selectedTextColor: "#f8fafc",
    focusedBackgroundColor: "#0f172a",
    focusedTextColor: "#cbd5e1",
  });

  leftPane.add(tabSelect);
  leftPane.add(browseSelect);

  const rightPane = new BoxRenderable(renderer, {
    flexGrow: 1,
    border: true,
    borderStyle: "single",
    borderColor: "#3f3f46",
    title: "Details",
    flexDirection: "row",
    gap: 1,
    padding: 1,
  });

  const coverPane = new BoxRenderable(renderer, {
    width: "45%",
    border: true,
    borderStyle: "single",
    borderColor: "#334155",
    title: "Current Album Cover",
    padding: 1,
    overflow: "hidden",
  });

  const coverTerminal = new GhosttyTerminalRenderable(renderer, {
    width: "100%",
    height: "100%",
    ansi: initialCoverText,
    cols: COVER_BLOCK_COLS,
    rows: COVER_BLOCK_ROWS,
    selectable: false,
    wrapMode: "none",
    truncate: true,
    visible: true,
  });

  coverPane.add(coverTerminal);

  const metaPane = new BoxRenderable(renderer, {
    flexGrow: 1,
    border: true,
    borderStyle: "single",
    borderColor: "#334155",
    title: "Now Playing",
    padding: 1,
  });

  const detailsText = new TextRenderable(renderer, {
    content: "Loading...",
    fg: "#e5e7eb",
  });

  metaPane.add(detailsText);
  rightPane.add(coverPane);
  rightPane.add(metaPane);

  main.add(leftPane);
  main.add(rightPane);

  const footer = new BoxRenderable(renderer, {
    border: true,
    borderStyle: "single",
    borderColor: "#3f3f46",
    title: "Controls",
    flexDirection: "column",
    height: 6,
    paddingX: 1,
    paddingY: 0,
  });

  const hintsText = new TextRenderable(renderer, {
    fg: "#a1a1aa",
    content: DEFAULT_HINTS,
  });

  const searchInput = new InputRenderable(renderer, {
    placeholder: "Search track, press Enter",
    value: "",
    width: "100%",
  });

  const statusText = new TextRenderable(renderer, {
    fg: "#d4d4d8",
    content: "Ready",
  });

  footer.add(hintsText);
  footer.add(searchInput);
  footer.add(statusText);

  app.add(header);
  app.add(main);
  app.add(footer);
  renderer.root.add(app);

  browseSelect.focus();

  return {
    headerText,
    coverTerminal,
    detailsText,
    statusText,
    hintsText,
    searchInput,
    tabSelect,
    browseSelect,
  };
}
