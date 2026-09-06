// ─────────────────────────────────────────────────────────────────────────────
// Who is allowed to run the browser-backed checks, and who is allowed to skip.
//
// Three scripts in `npm run build` drive a real headless Chromium —
// verifyViewportFit, verifyMemory and verifyBootRecovery. Each already knew how
// to skip when no browser could be STARTED. That covered the mirror being down
// or the image being rebuilt without Chromium. It did not cover the failure that
// actually took a deploy down: a browser that starts fine and is then killed by
// the kernel part-way through, on a host that does not have the RAM for it.
//
// ── The deploy this exists to stop breaking ────────────────────────────────
// verifyMemory opens all forty-two routes and then navigates the whole app six
// more times to watch the heap. On a workstation that is unremarkable. Inside a
// Docker build on a small VPS it is the single heaviest thing that happens
// during a release, and when the box runs out of memory the OOM killer takes
// node with it — no exception, no stack, no output. The build exits non-zero
// with the log simply stopping mid-route, and every graceful-skip path in those
// scripts is bypassed, because a process killed from outside gets no chance to
// handle anything. From the operator's side an unrelated deploy just dies with
// no error message at all.
//
// A process cannot catch its own OOM kill, so the fix cannot live inside the
// check. It has to be a decision made before the browser is launched: this host
// is not the place to run these.
//
// ── Why skipping loses nothing ─────────────────────────────────────────────
// These three checks assert facts about the SOURCE — that #root fills the
// viewport, that the DOM does not balloon, that a stale shell recovers. Those
// facts are settled by the commit, not by the machine that packages it, and
// .github/workflows/verify.yml already runs the full build with
// REQUIRE_BROWSER_CHECKS=1 and a known-good Chromium on every push and pull
// request. Running them a second time inside the release image adds no signal;
// it only adds a RAM floor to the deploy host, which is exactly the dependency
// that broke.
//
// ── Precedence ─────────────────────────────────────────────────────────────
// REQUIRE wins over SKIP, deliberately. If both are somehow set, the safe
// reading is "CI expects these to run", and a CI job that quietly skipped its
// own gate because a stray variable leaked into the environment is the one
// outcome worth ruling out.
// ─────────────────────────────────────────────────────────────────────────────

/** True in CI: a browser that will not start is a failure, not a skip. */
export const browserChecksRequired = () => process.env.REQUIRE_BROWSER_CHECKS === '1';

/**
 * True where a browser must not be launched at all — set by the Dockerfile for
 * the release image build. Never true when REQUIRE_BROWSER_CHECKS=1.
 */
export const browserChecksSkipped = () =>
  process.env.SKIP_BROWSER_CHECKS === '1' && !browserChecksRequired();

/**
 * Print the skip notice for `label` if this host is opted out.
 * Callers `if (announceSkip('verify:memory')) process.exit(0);` before doing any
 * setup — no browser, no server, no port claimed.
 */
export function announceSkip(label) {
  if (!browserChecksSkipped()) return false;
  console.warn(`⚠  ${label} — SKIPPED: SKIP_BROWSER_CHECKS=1 on this host.`);
  console.warn('   The assertions run on every push and pull request in CI, where a known-good');
  console.warn('   Chromium is installed and REQUIRE_BROWSER_CHECKS=1 makes them fatal.');
  return true;
}
