export function SkeletonCard() {
  return (
    <div className="bg-card rounded-xl p-4">
      <div className="flex justify-between mb-2">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-5 w-14 rounded-full" />
      </div>
      <div className="skeleton h-4 w-40 mb-1" />
      <div className="skeleton h-3 w-28 mb-3" />
      <div className="skeleton h-5 w-32 mb-2" />
      <div className="skeleton h-3 w-48" />
    </div>
  );
}

export function SkeletonCards({ count = 4 }) {
  return (
    <div className="px-4 flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
