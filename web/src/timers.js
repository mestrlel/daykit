export function focusElapsed(run, now = Date.now()) {
  const seconds = Math.max(0, Math.floor(run.acc + (run.since ? (now - run.since) / 1000 : 0)))
  return run.target ? Math.min(run.target, seconds) : seconds
}
