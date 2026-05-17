import { useEffect, useState } from 'react';

// group-gate for image loading: returns true only once every non-null URL
// in the list has finished loading (via Image.decode with onload/onerror
// fallbacks so broken urls don't deadlock the gate). resets to false
// whenever the set of urls changes — used by the pokemon detail page's
// sprite-row so navigating prev/next never paints male-sprite-then-
// shiny-half-a-second-later: both slots stay on a spinner until the
// slowest one is decoded, then both reveal together.
export function useSpritesReady(urls = []) {
  const valid = urls.filter(Boolean);
  const key = valid.join('|');
  const [readyKey, setReadyKey] = useState(null);

  useEffect(() => {
    if (valid.length === 0) { setReadyKey(key); return; }
    let cancelled = false;
    Promise.all(valid.map((u) => new Promise((resolve) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve; // don't block on broken urls
      img.src = u;
      img.decode?.().catch(() => {});
    }))).then(() => {
      if (!cancelled) setReadyKey(key);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return readyKey === key;
}
