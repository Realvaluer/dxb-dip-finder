export default function EmptyState({ onReset }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-brand-900/60 flex items-center justify-center mb-4">
        <svg className="w-10 h-10 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-300 mb-1">No deals match your filters</h3>
      <p className="text-sm text-gray-500 mb-4">Try lowering the min dip % or clearing area filters</p>
      {onReset && (
        <button
          onClick={onReset}
          className="px-4 py-2 bg-brand-700 text-brand-200 rounded-lg text-sm font-medium"
        >
          Reset filters
        </button>
      )}
    </div>
  );
}
