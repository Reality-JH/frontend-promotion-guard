import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({ root: resolve(import.meta.dirname), plugins: [react()], build: { outDir: "dist", emptyOutDir: true } });
