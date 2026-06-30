import { createContext, useContext, type RefObject } from "react";

export const ComposerMenuPortalContext = createContext<RefObject<HTMLElement | null> | null>(
  null,
);

export function useComposerMenuPortal(): RefObject<HTMLElement | null> | null {
  return useContext(ComposerMenuPortalContext);
}
