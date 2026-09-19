import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The import route reads the bundled sample calendars with fs; tell the tracer to ship them.
  outputFileTracingIncludes: { "/api/import": ["./data/*.ics"] },
};

export default nextConfig;
