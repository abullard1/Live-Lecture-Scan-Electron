import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
    plugins: [vue()],
    build: {
        outDir: "dist",
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, "src/main.js"),
                renderer: path.resolve(__dirname, "src/preload.js")
            }
        }
    },
    server: {
        port: 3000
    }
});