import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: { default: "Motor de Governança — Lei do Bem", template: "%s | Motor de Governança" },
  description: "Apoio à decisão para análise preliminar de enquadramento na Lei do Bem. O processo é determinístico; a decisão é humana.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0E5563", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow-float">
          Ir para o conteúdo
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
