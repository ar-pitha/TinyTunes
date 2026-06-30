import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    // For Capacitor Android build
    outDir: mode === "android" ? "../app/www" : "dist",
    emptyOutDir: true,
  },
}));import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    // For Capacitor Android build
    outDir: mode === "android" ? "../app/www" : "dist",
    emptyOutDir: true,
  },
}));