import { getDipColor } from '../../utils/formatters';

export default function DipBadge({ percent, size = 'sm' }) {
  if (percent === null || percent === undefined) return null;
  const { bg, text } = getDipColor(percent);
  const sizeClass = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';

  return (
    <span className={`${bg} ${text} ${sizeClass} rounded-full font-semibold inline-flex items-center`}>
      {percent > 0 ? '-' : '+'}{Math.abs(percent).toFixed(1)}%
    </span>
  );
}
