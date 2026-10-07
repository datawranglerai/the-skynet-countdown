import { useEffect, useRef, useState } from 'react';
import soundtrackUrl from '../../assets/sounds/Kepler Harmony of the Worlds.mp3';

export default function Soundtrack() {
  const audio = useRef<HTMLAudioElement>(null);
  const requested = useRef(false);
  const attempt = useRef(0);
  const [status, setStatus] = useState<'off' | 'loading' | 'on' | 'error'>('off');
  const enabled = status === 'loading' || status === 'on';

  useEffect(() => {
    const player = audio.current;
    return () => {
      requested.current = false;
      attempt.current += 1;
      player?.pause();
    };
  }, []);

  async function toggle() {
    const player = audio.current;
    if (!player) return;
    const currentAttempt = ++attempt.current;
    requested.current = !requested.current;

    if (!requested.current) {
      player.pause();
      setStatus('off');
      return;
    }

    setStatus('loading');
    player.volume = 0.2;
    // Assign the source only after opt-in; preload="none" alone is a browser hint.
    if (!player.getAttribute('src') || player.error) player.src = soundtrackUrl;
    try {
      await player.play();
      if (!requested.current) {
        player.pause();
        return;
      }
      if (currentAttempt === attempt.current) setStatus('on');
    } catch {
      // A cancelled or superseded play request must not overwrite a newer choice.
      if (currentAttempt !== attempt.current) return;
      requested.current = false;
      setStatus('error');
    }
  }

  function handlePause() {
    // A queued pause event can arrive after the visitor has already resumed.
    if (!requested.current || !audio.current?.paused) return;
    requested.current = false;
    attempt.current += 1;
    setStatus('off');
  }

  function handleError() {
    if (!audio.current?.error) return;
    requested.current = false;
    attempt.current += 1;
    setStatus('error');
  }

  return <div className="soundtrack">
    <button type="button" className="soundtrack-toggle" role="switch" aria-label="Background soundtrack" aria-checked={enabled} aria-describedby="soundtrack-credit" onClick={() => void toggle()}>
      <span>Soundtrack</span>
      <span className="soundtrack-switch" aria-hidden="true"><span /></span>
      <span className="soundtrack-state" aria-hidden="true">{status === 'loading' ? '…' : enabled ? 'ON' : 'OFF'}</span>
    </button>
    <span className="soundtrack-message" role="status">{status === 'error' ? 'Audio unavailable. Try again.' : ''}</span>
    <audio ref={audio} loop preload="none" aria-hidden="true" onPause={handlePause} onError={handleError} />
  </div>;
}

export function SoundtrackCredit() {
  return <div className="container soundtrack-credit" id="soundtrack-credit">
    <span>Soundtrack: <cite>Kepler’s Harmony of the Worlds</cite> · Laurie Spiegel</span>
    <span>℗ 2012 Laurie Spiegel Publishing (ASCAP)</span>
  </div>;
}
