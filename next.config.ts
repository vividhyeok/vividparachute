import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["node:sqlite","puppeteer-core","@sparticuz/chromium"],
  outputFileTracingIncludes: { '/api/pdf': ['./assets/fonts/**','./node_modules/katex/dist/**','./node_modules/@sparticuz/chromium/bin/**'] },
  outputFileTracingExcludes: { '*': ['./data/**','./tmp/**','./output/**','./.venv/**'] },
};
export default config;
