/// <reference types="vite/client" />

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    MathJax?: {
      typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
    };
  }
}

export {};
