export default function CategoryBar({ categories, active, onSelect }) {
  return (
    <nav className="sticky top-16 z-30 bg-ama-darker/95 backdrop-blur-md border-b border-ama-border">
      <div className="max-w-6xl mx-auto px-4 py-3 flex gap-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => onSelect(null)}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            !active
              ? 'bg-ama-amber text-ama-darker'
              : 'bg-ama-card text-ama-text-muted hover:text-ama-text hover:bg-ama-border'
          }`}
        >
          Todo
        </button>
        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => onSelect(cat.name)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              active === cat.name
                ? 'bg-ama-amber text-ama-darker'
                : 'bg-ama-card text-ama-text-muted hover:text-ama-text hover:bg-ama-border'
            }`}
          >
            {cat.display_name}
          </button>
        ))}
      </div>
    </nav>
  );
}
