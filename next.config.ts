import type { NextConfig } from "next";

// pdf-parse loads the pdf.js worker and the @napi-rs/canvas native binary at
// runtime, so Vercel's file tracing does not see them. Ship them explicitly
// with the routes that read PDFs.
const pdfRuntimeFiles = [
  "./node_modules/pdf-parse/dist/**/*",
  "./node_modules/pdfjs-dist/legacy/build/**/*",
  "./node_modules/@napi-rs/**/*",
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
  outputFileTracingIncludes: {
    "/api/receipts/analyze": pdfRuntimeFiles,
    "/api/admin/documents/analyze": pdfRuntimeFiles,
  },
};

export default nextConfig;
