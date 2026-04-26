import { Coffee, ArrowDown } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative py-16 sm:py-24 text-center px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-ama-amber/5 to-transparent pointer-events-none" />
      <div className="relative animate-fade-in-up">
        <div className="inline-flex items-center gap-2 bg-ama-card border border-ama-border rounded-full px-4 py-2 mb-6">
          <Coffee className="w-4 h-4 text-ama-amber" />
          <span className="text-sm text-ama-text-muted">Una nueva experiencia para disfrutar</span>
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold text-ama-text mb-4 tracking-tight">
          <span className="text-ama-amber">AMA</span> Café
        </h1>
        <p className="text-ama-text-muted text-lg max-w-md mx-auto mb-8">
          Explora nuestro menu y arma tu pedido
        </p>
        <a
          href="#menu"
          className="inline-flex items-center gap-2 bg-ama-amber hover:bg-ama-amber-light text-ama-darker font-semibold px-6 py-3 rounded-full transition-colors"
        >
          Ver Menu
          <ArrowDown className="w-4 h-4" />
        </a>
      </div>
    </section>
  );
}
