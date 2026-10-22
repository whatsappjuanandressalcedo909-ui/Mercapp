// Ensures @vitejs/plugin-react preamble globals are always defined prior to module evaluation,
// even if a PWA Service Worker serves a cached index.html shell.
if (typeof window !== 'undefined') {
  const win = window as unknown as {
    $RefreshReg$?: () => void;
    $RefreshSig$?: () => <T>(type: T) => T;
    __vite_plugin_react_preamble_installed__?: boolean;
  };
  if (!win.$RefreshReg$) {
    win.$RefreshReg$ = () => {};
  }
  if (!win.$RefreshSig$) {
    win.$RefreshSig$ = () => (type) => type;
  }
  win.__vite_plugin_react_preamble_installed__ = true;
}

export {};
