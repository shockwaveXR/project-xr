// the page scrolls inside `.app-scroll`, NOT on body/html. body is fixed-height
// with overflow:hidden so the header (above .app-scroll in the layout) stays
// pinned to the viewport during ios rubber-band overscroll — the bounce
// happens inside .app-scroll only, "below the header line".
//
// these helpers centralize references to the scroll container so consumers
// don't have to know the selector or worry about timing (the element exists
// from first render). every spot that previously did `window.scrollY` /
// `window.scrollTo` reads through here instead.

const SELECTOR = '.app-scroll';

export const getAppScroller = () => document.querySelector(SELECTOR);

export const appScrollY = () => getAppScroller()?.scrollTop ?? 0;

export const appScrollTo = (top, behavior = 'auto') => {
  getAppScroller()?.scrollTo({ top, behavior });
};

export const appScrollBy = (delta, behavior = 'auto') => {
  getAppScroller()?.scrollBy({ top: delta, behavior });
};

// shared per-history-key scroll cache. populated by ScrollManager via a
// scroll listener; consumed by ScrollManager on POP nav for the generic
// restore path, AND by HomePage (which loads its grid asynchronously)
// so it can re-apply the saved position once its data actually renders
// — the synchronous post-commit scrollTo in ScrollManager fires before
// the pokemon list resolves and lands at a too-short scroll-height
// otherwise.
export const scrollPositions = new Map();
