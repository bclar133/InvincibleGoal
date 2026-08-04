import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.SITE_BASE || (process.env.GITHUB_PAGES === "true" ? "/InvincibleGoal/" : "/"),
});
