import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function githubPagesAssetPaths(): Plugin {
  return {
    name: "github-pages-asset-paths",
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === "asset" && item.fileName.endsWith(".css") && typeof item.source === "string") {
          item.source = item.source.replaceAll("/valkyrie-full.png", "../public/valkyrie-full.png");
        }
      }
    },
  };
}

export default defineConfig({
  root: __dirname,
  base: "/camline-valkyrie-atlas/",
  publicDir: false,
  plugins: [react(), githubPagesAssetPaths()],
  build: {
    outDir: "../github-pages-dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "static/app.js",
        chunkFileNames: "static/[name].js",
        assetFileNames: (asset) => (asset.name?.endsWith(".css") ? "static/app.css" : "static/[name][extname]"),
      },
    },
  },
});
