export default function SkeletonCard() {
  return (
    <div className="bg-brand-900/40 rounded-xl p-4 animate-pulse">
      <div className="flex justify-between items-start mb-3">
        <div className="h-5 bg-brand-800 rounded w-3/4" />
        <div className="h-5 bg-brand-800 rounded-full w-16" />
      </div>
      <div className="h-7 bg-brand-800 rounded w-1/3 mb-3" />
      <div className="flex gap-2 mb-3">
        <div className="h-4 bg-brand-800 rounded w-12" />
        <div className="h-4 bg-brand-800 rounded w-16" />
        <div className="h-4 bg-brand-800 rounded w-24" />
      </div>
      <div className="h-4 bg-brand-800 rounded w-full" />
    </div>
  );
}
