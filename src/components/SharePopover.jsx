import { useEffect, useRef, useState } from 'react';
import { formatPrice } from '../utils';

export default function SharePopover({ listing, onClose }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);

  const l = listing;
  const beds = l.bedrooms === 0 || l.bedrooms == null ? 'Studio' : `${l.bedrooms}BR`;
  const community = l.community || '';
  const price = formatPrice(l.price_aed);
  const url = `https://www.dxbdipfinder.com/listing/${l.id}`;

  // Build dip text if available
  let dipText = '';
  if (l.last_sale_change_pct != null && l.last_sale_change_pct < 0) {
    dipText = ` — down ${Math.abs(l.last_sale_change_pct).toFixed(1)}%`;
  } else if (l.change_pct != null && l.change_pct < 0) {
    dipText = ` — down ${Math.abs(l.change_pct).toFixed(1)}%`;
  }

  const text = `${beds} in ${l.property_name || community}, ${community}\nListed at ${price}${dipText}\nSee it on DxbDipFinder`;
  const fullText = `${text}\n${url}`;

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  function handleCopy(e) {
    e.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => { setCopied(false); onClose(); }, 1200);
    });
  }

  function handleNativeShare(e) {
    e.stopPropagation();
    navigator.share({ title: `${beds} in ${community}`, text, url }).catch(() => {});
    onClose();
  }

  function handleLink(e, href) {
    e.stopPropagation();
    window.open(href, '_blank', 'noopener');
    onClose();
  }

  const waUrl = `https://wa.me/?text=${encodeURIComponent(fullText)}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  const btnClass = 'flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-white hover:bg-white/5 rounded-lg transition-colors min-h-[40px]';

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg py-1.5 w-48" onClick={e => e.stopPropagation()}>
      <button className={btnClass} onClick={e => handleLink(e, waUrl)}>
        <svg className="w-4 h-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        WhatsApp
      </button>
      <button className={btnClass} onClick={e => handleLink(e, xUrl)}>
        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        X (Twitter)
      </button>
      <button className={btnClass} onClick={handleCopy}>
        <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
      {typeof navigator !== 'undefined' && navigator.share && (
        <button className={btnClass} onClick={handleNativeShare}>
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
          Share...
        </button>
      )}
    </div>
  );
}
