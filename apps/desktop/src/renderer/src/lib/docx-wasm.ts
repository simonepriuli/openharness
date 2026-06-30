import wasmUrl from "@extend-ai/react-docx/docx_wasm_bg.wasm?url";
import { initWasm, setWasmSource } from "@extend-ai/react-docx";

let wasmReady: Promise<void> | null = null;

/** Preload DOCX wasm on the main thread (avoids worker + URL issues in Electron). */
export function ensureDocxWasmReady(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const response = await fetch(wasmUrl);
      if (!response.ok) {
        throw new Error(`Failed to load DOCX wasm (${response.status})`);
      }
      const buffer = await response.arrayBuffer();
      setWasmSource(buffer);
      await initWasm(buffer);
    })();
  }
  return wasmReady;
}
