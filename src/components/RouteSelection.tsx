import { bundledRoutes } from "@/game/route/bundled";
import styles from "./RouteSelection.module.css";

export default function RouteSelection({
  selected,
  loading,
  onSelect,
}: {
  selected: string;
  loading: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <div className={styles.routes} aria-label="Choose a course">
      {bundledRoutes.map((course, i) => (
        <button
          key={course.key}
          className={styles.course}
          aria-label={`Select ${course.title}`}
          aria-pressed={selected === course.id}
          disabled={loading}
          onClick={() => onSelect(course.key)}
          style={{ "--course-color": course.color } as React.CSSProperties}
        >
          <span className={styles.chapter}>
            0{i + 1} <span>{course.kicker}</span>
          </span>
          <svg viewBox="0 0 240 160" aria-hidden="true">
            <path
              d="M0 40H240 M0 80H240 M0 120H240 M60 0V160 M120 0V160 M180 0V160"
              stroke="currentColor"
              opacity=".08"
              fill="none"
            />
            <path
              d={course.path}
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span className={styles.title}>
            {course.title}
            <span aria-hidden="true">{selected === course.id ? "●" : "↗"}</span>
          </span>
          <span className={styles.description}>{course.description}</span>
          <span className={styles.stats}>
            <span>
              {course.distance} <small>km</small>
            </span>
            <span>
              +{course.gain} <small>m</small>
            </span>
          </span>
          <span className={styles.note}>{course.note}</span>
        </button>
      ))}
    </div>
  );
}
