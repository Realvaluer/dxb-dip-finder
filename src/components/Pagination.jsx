export default function Pagination({ page, totalPages, total, pageSize, onPageChange }) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between bg-card rounded-b-xl border-t border-border px-4 py-3 text-sm">
      <span className="text-muted">
        Showing {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()} results
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/80 transition-colors"
        >
          ← Prev
        </button>
        <span className="text-muted tabular-nums">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/80 transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
