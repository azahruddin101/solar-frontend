'use client';

// Bridge between React UI outside the <Canvas> and the three.js scene inside it.
// Scene components register their functions here on mount.
export const sceneApi = {
  capture: null, // async () => dataURL
  setView: null, // (name) => void
};
