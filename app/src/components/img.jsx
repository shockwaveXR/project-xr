import { useLayoutEffect, useRef, useState } from 'react';

// drop-in wrapper around <img> that shows a centered spinner while the image
// is still loading and fades the image in once it's ready. behaves exactly
// like a normal <img> otherwise — pass any standard img prop through.
//
// the wrapper is `display: inline-block` and inherits no size of its own,
// so styling that targets the inner img (width, height, object-fit) keeps
// working unchanged. add className for the spinner wrapper via wrapClassName
// only when you need extra layout overrides; most callers won't need it.
//
// optional `fallbackSrc`: if the primary `src` fails to load (404/403/decode
// error), the image transparently retries with this url before giving up. used
// by the tcg-pocket modal where newer sets only host the smaller webp full and
// the higher-res png 403s — see cdnFullUrl in scrape-tcg-pocket.js.
export default function Img({ src, fallbackSrc, alt = '', className, wrapClassName, style, onLoad, onError, ...rest }) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const imgRef = useRef(null);

  // restart from the primary src whenever the src prop itself changes (e.g. the
  // modal cycling to a different card). the detection effect below then runs
  // against the freshly-applied currentSrc.
  useLayoutEffect(() => { setCurrentSrc(src); }, [src]);

  // cached-image race: when the browser already has the bytes (return visit,
  // hot reload, prior render), the img's `load` event fires before React
  // attaches onLoad, so state never flips. checking img.complete after the DOM
  // is committed but before paint catches the cached case. keyed on currentSrc
  // so the fallback swap is detected too. a cached *failure* (complete but
  // naturalWidth 0) escalates to the fallback the same way a live error does.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) { setLoaded(false); setErrored(false); return; }
    if (img.complete) {
      if (img.naturalWidth > 0) {
        setLoaded(true); setErrored(false);
      } else if (fallbackSrc && currentSrc !== fallbackSrc) {
        setCurrentSrc(fallbackSrc); setLoaded(false); setErrored(false);
      } else {
        setLoaded(false); setErrored(true);
      }
    } else {
      setLoaded(false); setErrored(false);
    }
  }, [currentSrc, fallbackSrc]);

  const handleLoad = (e) => { setLoaded(true); onLoad?.(e); };
  const handleError = (e) => {
    // one retry against the fallback before surfacing the error state.
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
    } else {
      setErrored(true); onError?.(e);
    }
  };

  return (
    <span
      className={`g-img${loaded ? ' g-img--loaded' : ''}${errored ? ' g-img--errored' : ''}${wrapClassName ? ' ' + wrapClassName : ''}`}
      style={style}
    >
      <img
        ref={imgRef}
        src={currentSrc}
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
