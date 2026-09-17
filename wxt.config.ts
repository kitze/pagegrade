import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "PageGrade",
    minimum_chrome_version: "120",
    description: "Grade page sections for writing, clarity and on-page SEO with Jev.",
    permissions: ["storage", "activeTab", "scripting", "sidePanel"],
    side_panel: { default_path: "report.html" },
    host_permissions: ["https://ai-gateway.vercel.sh/*"],
    action: { default_title: "Grade this page" },
    icons: { 16: "/icon/16.png", 32: "/icon/32.png", 48: "/icon/48.png", 128: "/icon/128.png" },
  },
});
