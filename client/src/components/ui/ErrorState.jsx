export default function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-300 mb-1">Couldn't load listings</h3>
      <p className="text-sm text-gray-500 mb-4">{message || 'Something went wrong'}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-brand-700 text-brand-200 rounded-lg text-sm font-medium"
        >
          Retry
        </button>
      )}
    </div>
  );
}
