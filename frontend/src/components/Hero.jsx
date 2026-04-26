export default function Hero() {
  return (
    <section className="relative py-6 sm:py-8 text-center px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-ama-amber/5 to-transparent pointer-events-none" />
      <div className="relative animate-fade-in-up">
        <p className="text-ama-text-muted text-base sm:text-lg max-w-md mx-auto">
          Explora nuestro menu y arma tu pedido
        </p>
      </div>
    </section>
  );
}
