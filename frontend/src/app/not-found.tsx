import Link from "next/link";

export default function NotFound() {
  return (
    <main id="conteudo" className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-[13px] text-ink-muted">404</p>
      <h1 className="mt-2 text-[22px] font-semibold">Página não encontrada</h1>
      <p className="mt-2 text-ink-muted">O endereço não corresponde a nenhuma tela do sistema.</p>
      <Link href="/" className="mt-6 font-medium text-petrol-600 underline underline-offset-2">Ir para as análises</Link>
    </main>
  );
}
