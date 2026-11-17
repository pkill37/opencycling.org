import type { RaceStanding } from "@/game/modes/local-race";
import styles from "./RaceLeaderboard.module.css";

const finishTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

export default function RaceLeaderboard({
  standings,
}: {
  standings: RaceStanding[];
}) {
  const player = standings.find((rider) => rider.isPlayer);
  return (
    <table className={styles.board} aria-label="Local race leaderboard">
      <caption>
        LOCAL RACE{" "}
        <span>
          {player?.rank ?? "—"} / {standings.length}
        </span>
      </caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Rider</th>
          <th scope="col">Gap / status</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((rider) => (
          <tr
            key={rider.id}
            className={
              rider.eliminatedAtSeconds !== undefined
                ? styles.eaten
                : rider.isPlayer
                  ? styles.player
                  : undefined
            }
          >
            <td>{rider.rank}</td>
            <th scope="row">
              <span
                className={styles.dot}
                style={{ background: rider.color }}
                aria-hidden="true"
              />
              {rider.name}
              {!rider.isPlayer && <small>AI</small>}
            </th>
            <td
              title={
                rider.eliminatedAtSeconds !== undefined
                  ? "Eaten by zombies"
                  : rider.finishTimeSeconds !== undefined
                    ? "Finish time"
                    : "Distance behind leader"
              }
            >
              {rider.eliminatedAtSeconds !== undefined
                ? "EATEN"
                : rider.finishTimeSeconds !== undefined
                  ? `✓ ${finishTime(rider.finishTimeSeconds)}`
                  : rider.rank === 1
                    ? "—"
                    : `+${Math.round(rider.gapMeters)} m`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
