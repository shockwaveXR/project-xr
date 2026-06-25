// ─── TcgpJumpNav ─────────────────────────────────────────────────────────────
//
// floating bottom-right nav for the (very long) tcg pocket grid. appears once
// the user has scrolled down a screenful. two affordances:
//   - back to top (always)
//   - jump to a section (only when there's more than one labelled section —
//     e.g. grouped by set / rarity / element); opens a compact list of the
//     visible section labels and smooth-scrolls to the chosen one.
//
// the page scrolls inside `.app-scroll`, not the window, so visibility tracks
// that element's scrollTop (via the shared app-scroll helpers) and section
// jumps rely on each section carrying id="tcgp-section-<slug>".

import { useEffect, useRef, useState } from 'react';
import { getAppScroller, appScrollTo } from '../utils/app-scroll';

export default function TcgpJumpNav({ sections }) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen]       = useState(false);
  const navRef = useRef(null);

  // show the control after one screenful of scrolling inside .app-scroll.
  useEffect(() => {
    const scroller = getAppScroller();
    if (!scroller) return;
    const onScroll = () => setVisible(scroller.scrollTop > 500);
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  // close the section list on outside-click / Esc — same pattern as the page's
  // filter dropdowns.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setOpen(false); };
    const onKey  = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const labelled = sections.filter(s => s.label);
  const canJump  = labelled.length > 1;

  const jumpTo = (slug) => {
    setOpen(false);
    document.getElementById(`tcgp-section-${slug}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const toTop = () => { setOpen(false); appScrollTo(0, 'smooth'); };

  if (!visible) return null;

  return (
    <div ref={navRef} className="tcgp-jump">
      {canJump && open && (
        <ul className="tcgp-jump__list">
          {labelled.map(s => (
            <li key={s.slug}>
              <button type="button" className="tcgp-jump__section" onClick={() => jumpTo(s.slug)}>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="tcgp-jump__buttons">
        {canJump && (
          <button
            type="button"
            className={`tcgp-jump__btn${open ? ' is-open' : ''}`}
            onClick={() => setOpen(o => !o)}
            aria-label="jump to section"
            aria-expanded={open}
            title="jump to section"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <line x1="3" y1="4" x2="13" y2="4" /><line x1="3" y1="8" x2="13" y2="8" /><line x1="3" y1="12" x2="13" y2="12" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="tcgp-jump__btn"
          onClick={toTop}
          aria-label="back to top"
          title="back to top"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 13V4" /><path d="M4 7l4-4 4 4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
