export default function SkeletonCard() {
  return (
    <div className="bg-ama-card rounded-2xl border border-ama-border overflow-hidden animate-pulse">
      <div className="h-32 bg-ama-dark" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-ama-dark rounded w-3/4" />
        <div className="h-3 bg-ama-dark rounded w-full" />
        <div className="h-3 bg-ama-dark rounded w-1/2" />
        <div className="flex items-center justify-between pt-1">
          <div className="h-5 bg-ama-dark rounded w-20" />
          <div className="h-8 w-8 bg-ama-dark rounded-full" />
        </div>
      </div>
    </div>
  );
}
