import type { PhysicsConfig } from "@/types";
const fields = [
  ["riderMassKg", "Rider mass (kg)", 30, 200, 1],
  ["bikeMassKg", "Bike mass (kg)", 3, 40, 1],
  ["cda", "Drag area CdA (m²)", 0.1, 1, 0.01],
  ["crr", "Rolling resistance Crr", 0, 0.05, 0.001],
  ["airDensity", "Air density (kg/m³)", 0.5, 1.5, 0.01],
  ["drivetrainEfficiency", "Drivetrain efficiency", 0.8, 1, 0.01],
  ["windEast", "Wind toward east (m/s)", -20, 20, 1],
  ["windNorth", "Wind toward north (m/s)", -20, 20, 1],
  ["lateralAcceleration", "Corner lateral acceleration (m/s²)", 0.5, 4, 0.1],
  ["grip", "Assumed grip coefficient", 0.1, 1, 0.1],
  ["brakingDeceleration", "Brake force / mass (m/s²)", 1, 6, 0.1],
] as const;
export default function PhysicsSettings({
  value,
  onChange,
}: {
  value: PhysicsConfig;
  onChange: (config: PhysicsConfig) => void;
}) {
  return (
    <details>
      <summary>Rider, weather & dynamics assumptions</summary>
      <p>
        Still-air baseline, asphalt, no drafting or rotating inertia. Automatic
        corner braking is a training model, not outdoor safety advice. Gradients
        do not control trainer resistance.
      </p>
      {fields.map(([key, label, min, max, step]) => (
        <label key={key}>
          {label}{" "}
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value[key]}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n))
                onChange({ ...value, [key]: Math.max(min, Math.min(max, n)) });
            }}
          />
        </label>
      ))}
      <label>
        Power measurement{" "}
        <select
          value={value.powerLocation}
          onChange={(e) =>
            onChange({
              ...value,
              powerLocation: e.target.value as "crank" | "wheel",
            })
          }
        >
          <option value="crank">Crank</option>
          <option value="wheel">Wheel</option>
        </select>
      </label>
      <p>
        Automatic braking enabled. Speed ceiling 108 km/h; propulsion capped at
        900 N.
      </p>
    </details>
  );
}
