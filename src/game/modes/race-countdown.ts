export type CountdownLabel = 1 | 2 | 3 | "START" | null;

/** Advances on visible frames only. The returned time belongs to the race. */
export class RaceCountdown {
  private elapsedSeconds = 0;

  get started() {
    return this.elapsedSeconds >= 3;
  }
  get label(): CountdownLabel {
    if (this.elapsedSeconds >= 3.8) return null;
    if (this.started) return "START";
    return (Math.floor(this.elapsedSeconds) + 1) as 1 | 2 | 3;
  }
  advance(deltaSeconds: number) {
    const dt = Math.min(0.25, Math.max(0, deltaSeconds));
    const waiting = Math.max(0, 3 - this.elapsedSeconds);
    this.elapsedSeconds += dt;
    return Math.max(0, dt - waiting);
  }
}
