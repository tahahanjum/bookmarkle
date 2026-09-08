(global => {
  'use strict';

  const P = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  const D = {
    link:      '<path d="M10 13a4 4 0 006 .5l2.5-2.5a4 4 0 00-5.7-5.7L11.5 6.6"/><path d="M14 11a4 4 0 00-6-.5L5.5 13a4 4 0 005.7 5.7l1.2-1.2"/>',
    dots:      '<circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none"/>',
    external:  '<path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 14v5.4A1.6 1.6 0 0116.4 21H4.6A1.6 1.6 0 013 19.4V7.6A1.6 1.6 0 014.6 6H10"/>',
    refresh:   '<path d="M20.5 12a8.5 8.5 0 11-2.6-6.1"/><path d="M20.5 4.5V10H15"/>',
    pencil:    '<path d="M4 20h4.2L20 8.2a2.1 2.1 0 00-3-3L5.2 17V20z"/>',
    share:     '<circle cx="18" cy="5.6" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.4" r="2.6"/><path d="M8.3 10.8l7.4-3.9M8.3 13.2l7.4 3.9"/>',
    trash:     '<path d="M4 7h16"/><path d="M9 7V4.6h6V7"/><path d="M6 7l1 13h10l1-13"/>',
    plus:      '<circle cx="12" cy="12" r="9"/><path d="M12 8.4v7.2M8.4 12h7.2"/>',
    plusSm:    '<path d="M12 5v14M5 12h14"/>',
    x:         '<path d="M6 6l12 12M18 6L6 18"/>',
    chevron:   '<path d="M6 15l6-6 6 6"/>',
    download:  '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    check:     '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    restore:   '<path d="M3.5 12a8.5 8.5 0 102.6-6.1"/><path d="M3.5 4.5V10H9"/>',
    gear:      '<circle cx="12" cy="12" r="3.2"/><path d="M19.6 14.5a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1v.3a2 2 0 11-4 0v-.2a1.6 1.6 0 00-2.8-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-1.1-2.7h-.3a2 2 0 110-4h.2a1.6 1.6 0 001.1-2.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3h.1a1.6 1.6 0 001-1.5v-.3a2 2 0 114 0v.2a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8v.1a1.6 1.6 0 001.5 1h.3a2 2 0 110 4h-.2a1.6 1.6 0 00-1.5 1z"/>',
    user:      '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0115 0"/>',
    globe:     '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 010 18a15 15 0 010-18z"/>',
    bug:       '<path d="M8 7a4 4 0 018 0"/><rect x="7" y="7" width="10" height="12" rx="5"/><path d="M3.5 11H7M17 11h3.5M3.5 17H7M17 17h3.5M12 7v12"/>',
    grip:      '<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
    upload:    '<path d="M12 20V8"/><path d="M7 12l5-5 5 5"/><path d="M4 4h16"/>',
    tabs:      '<rect x="3" y="6" width="13" height="13" rx="2"/><path d="M8 6V4.6A1.6 1.6 0 019.6 3h10.8A1.6 1.6 0 0122 4.6v10.8A1.6 1.6 0 0120.4 17H19"/>'
  };

  function svg(name, size) {
    const d = D[name] || '';
    const s = size || 24;
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" ${P}>${d}</svg>`;
  }

  global.Icons = { svg, paths: D };
})(typeof window !== 'undefined' ? window : globalThis);
