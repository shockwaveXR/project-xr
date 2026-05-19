import { useEffect, useState } from 'react';
import Img from './img';

// modal that cycles through a pokemon's sprite variants — normal / shiny
// / male / female / male-shiny / female-shiny depending on what's
// available. opens when a user taps any sprite in the detail page's
// sprite-row. left/right arrows + keyboard ← / → cycle. Esc or backdrop
// tap closes.
//
// `slots` shape: [{ src, gender: 'male'|'female'|null, shiny: bool, alt }]
export default function SpriteModal({ slots, startIndex = 0, pokemonName, onClose, closing = false }) {
  const safeStart = Math.max(0, Math.min(startIndex, slots.length - 1));
  const [idx, setIdx] = useState(safeStart);

  const total = slots.length;
  const go = (delta) => setIdx(i => (i + delta + total) % total);

  // close on Escape, cycle on arrow keys. listening on window so the
  // user doesn't have to focus inside the modal first.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1);  }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, total]);

  const slot = slots[idx];
  if (!slot) return null;

  const label = describeSlot(slot, pokemonName);

  return (
    <div className={`sprite-modal-overlay${closing ? ' closing' : ''}`} onClick={onClose}>
      <div className="sprite-modal" onClick={e => e.stopPropagation()}>
        <button className="sprite-modal__close" onClick={onClose} aria-label="close">✕</button>

        <div className="sprite-modal__stage">
          {total > 1 && (
            <button
              className="sprite-modal__arrow sprite-modal__arrow--prev"
              onClick={() => go(-1)}
              aria-label="previous variant"
            >‹</button>
          )}

          <Img
            key={idx}
            src={slot.src}
            alt={slot.alt || `${pokemonName} ${label}`}
            className="sprite-modal__img"
          />

          {total > 1 && (
            <button
              className="sprite-modal__arrow sprite-modal__arrow--next"
              onClick={() => go(1)}
              aria-label="next variant"
            >›</button>
          )}
        </div>

        <div className="sprite-modal__badges">
          {slot.gender === 'male'   && <span className="sprite-modal__pill sprite-modal__pill--male"   aria-label="male">{'♂︎'}</span>}
          {slot.gender === 'female' && <span className="sprite-modal__pill sprite-modal__pill--female" aria-label="female">{'♀︎'}</span>}
          {slot.shiny               && <span className="sprite-modal__pill sprite-modal__pill--shiny"  aria-label="shiny">shiny</span>}
          {!slot.gender && !slot.shiny && <span className="sprite-modal__pill sprite-modal__pill--default">default</span>}
        </div>

        {total > 1 && (
          <div className="sprite-modal__dots" aria-hidden="true">
            {slots.map((_, i) => (
              <span
                key={i}
                className={`sprite-modal__dot${i === idx ? ' is-active' : ''}`}
                onClick={() => setIdx(i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function describeSlot(slot, name) {
  const parts = [];
  if (slot.gender === 'male')   parts.push('male');
  if (slot.gender === 'female') parts.push('female');
  if (slot.shiny)               parts.push('shiny');
  if (!parts.length)            parts.push('default');
  return parts.join(' ');
}
