export type SelectionActionPayload = {
  cwd: string;
  relativePath: string;
  message: string;
};

export type OnSelectionAction = (payload: SelectionActionPayload) => void;
