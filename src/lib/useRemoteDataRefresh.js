// The listener half of src/lib/liveSync.js, as one hook.
//
// Kept out of liveSync.js on purpose: that module is imported by App.jsx's boot path and, like
// progressSync.js, is deliberately free of any React dependency. This file is the only place the
// two meet.
//
// Every panel that holds its own list state (ServiceLogPanel, QuickCapture, WeeklyCheckin,
// ProfileIntelPrompt) needs exactly the same three lines, and writing them five times is how one
// of the five ends up leaking a listener or refetching in a loop.
import { useEffect, useRef } from 'react';
import { REMOTE_DATA_EVENT } from './liveSync';

// One remote change is frequently several row writes (a panel saving a row and then patching it
// with an extraction result; a student clearing three items on a phone). Each bumps the version,
// and each would otherwise cost every mounted panel a full refetch.
const DEBOUNCE_MS = 600;

/**
 * Runs `fn` shortly after this account's data changes on another device.
 *
 * `fn` is held in a ref rather than being a dependency, so a caller passing an inline closure
 * does not re-register the listener on every render — the usual way a hook like this quietly
 * becomes an unsubscribe/subscribe loop.
 */
export default function useRemoteDataRefresh(fn) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let timer = null;
    const onChanged = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { fnRef.current?.(); } catch { /* a refetch failing is not fatal */ } }, DEBOUNCE_MS);
    };
    window.addEventListener(REMOTE_DATA_EVENT, onChanged);
    return () => { clearTimeout(timer); window.removeEventListener(REMOTE_DATA_EVENT, onChanged); };
  }, []);
}
