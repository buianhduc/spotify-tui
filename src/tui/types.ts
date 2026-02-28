export interface TuiOptionHandle {
  value?: unknown;
}

export interface TabSelectHandle {
  getSelectedOption(): TuiOptionHandle | null;
  setSelectedIndex(index: number): void;
}

export interface BrowseSelectHandle {
  focus(): void;
  getSelectedIndex(): number;
  getSelectedOption(): TuiOptionHandle | null;
}

export interface SearchInputHandle {
  value: string;
  focus(): void;
  blur(): void;
}

export interface TuiKeyEvent {
  name: string;
  ctrl: boolean;
  preventDefault(): void;
}
