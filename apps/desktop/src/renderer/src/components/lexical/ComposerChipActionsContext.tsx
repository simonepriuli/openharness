import { createContext, useContext } from "react";
import type { ToolSegment } from "../../lib/composer-draft";

export type ComposerChipActions = {
  onRemoveTool?: (segment: ToolSegment) => void;
};

export const ComposerChipActionsContext = createContext<ComposerChipActions>({});

export function useComposerChipActions(): ComposerChipActions {
  return useContext(ComposerChipActionsContext);
}
