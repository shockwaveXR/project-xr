import { useLayoutEffect, useRef, useState } from 'react';

// drop-in wrapper around <img> that shows a centered spinner while the image
// is still loading and fades the image in once it's ready. behaves exactly
// like a normal <img> otherwise — pass any standard img prop through.
//
// the wrapper is `display: inline-block` and inherits no size of its own,
// so styling that targets the inner img (width, height, object-fit) keeps
// working unchanged. add className for the spinner wrapper via wrapClassName
// only when you need extra layout overrides; most callers won't need it.
export default function Img({ src, alt = '', className, wrapClassName, style, onLoad, onError, ...rest }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const imgRef = useRef(null);

  // single layout effect handles both the cached-image race AND the src-
  // change reset in one pass — running both as separate effects was the
  // original bug: useEffect (reset to false) ran AFTER useLayoutEffect
  // (detect cached → true), wiping the cached detection on every src change.
  //
  // cached-image race: when the browser already has the bytes (return visit,
  // hot reload, prior page render), the img's `load` event fires before
  // React attaches the onLoad handler, so state never flips. checking
  // img.complete after the DOM is committed but before paint catches the
  // cached case and flips state immediately.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) { setLoaded(false); setErrored(false); return; }
    if (img.complete) {
      if (img.naturalWidth > 0) { setLoaded(true); setErrored(false); }
      else { setLoaded(false); setErrored(true); }
    } else {
      setLoaded(false); setErrored(false);
    }
  }, [src]);

  const handleLoad = (e) => { setLoaded(true); onLoad?.(e); };
  const handleError = (e) => { setErrored(true); onError?.(e); };

  return (
    <span
      className={`g-img${loaded ? ' g-img--loaded' : ''}${errored ? ' g-img--errored' : ''}${wrapClassName ? ' ' + wrapClassName : ''}`}
      style={style}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={className}
        onLoad={handleLoad}
        onError={handleError}
        {...rest}
      />
      {!loaded && !errored && <span className="g-img__spinner" aria-hidden="true" />}
    </span>
  );
}
