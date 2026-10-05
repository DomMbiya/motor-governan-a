/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  // A interface só conversa com a API local. Nenhum recurso externo é carregado.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "worker-src 'self' blob:",
              "connect-src 'self'",
              "frame-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    // pdf.js referencia 'canvas' opcionalmente (Node); no navegador não é usado.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
