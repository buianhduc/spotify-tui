import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect } from "react";
import type { SelectOption } from "@opentui/core";

import { TABS, type ViewTab } from "../components/browse.ts";
import type { BrowseSelectHandle, SearchInputHandle, TabSelectHandle } from "../types.ts";

interface UseBrowseUiSyncOptions {
  browseOptions: SelectOption[];
  currentTab: ViewTab;
  focusTarget: "browse" | "search";
  setBrowseSelectedIndex: Dispatch<SetStateAction<number>>;
  selectedBrowseNameRef: MutableRefObject<string | null>;
  tabSelectRef: MutableRefObject<TabSelectHandle | null>;
  browseSelectRef: MutableRefObject<BrowseSelectHandle | null>;
  searchInputRef: MutableRefObject<SearchInputHandle | null>;
}

// Keep selection, tab focus, and input focus stable as the UI state changes.
export function useBrowseUiSync({
  browseOptions,
  currentTab,
  focusTarget,
  setBrowseSelectedIndex,
  selectedBrowseNameRef,
  tabSelectRef,
  browseSelectRef,
  searchInputRef,
}: UseBrowseUiSyncOptions): void {
  useEffect(() => {
    setBrowseSelectedIndex((prev) => {
      if (browseOptions.length === 0) {
        selectedBrowseNameRef.current = null;
        return 0;
      }

      const previousName = selectedBrowseNameRef.current;
      const preferred = previousName ? browseOptions.findIndex((option) => option.name === previousName) : -1;
      const nextIndex = preferred >= 0 ? preferred : Math.min(prev, browseOptions.length - 1);
      selectedBrowseNameRef.current = browseOptions[nextIndex]?.name ?? null;
      return nextIndex;
    });
  }, [browseOptions, selectedBrowseNameRef, setBrowseSelectedIndex]);

  useEffect(() => {
    const tabIndex = TABS.findIndex((tab) => tab.value === currentTab);
    if (tabIndex >= 0) {
      tabSelectRef.current?.setSelectedIndex(tabIndex);
    }
  }, [currentTab, tabSelectRef]);

  useEffect(() => {
    if (focusTarget === "browse") {
      browseSelectRef.current?.focus();
      return;
    }

    searchInputRef.current?.focus();
  }, [browseSelectRef, focusTarget, searchInputRef]);
}
