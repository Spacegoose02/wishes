export const THEMES = [
  { id: "system", label: "Auto", colors: ["#fdfaf4", "#15161a", "#ff7a59"] },
  { id: "light", label: "Sunny", colors: ["#fdfaf4", "#ff7a59", "#ffb547"] },
  { id: "dark", label: "Night", colors: ["#15161a", "#ff8a6b", "#ffc163"] },
  { id: "candy", label: "Candy", colors: ["#fff3fb", "#d946ef", "#38bdf8"] },
  { id: "forest", label: "Forest", colors: ["#f2f6ef", "#2f855a", "#b7791f"] },
  { id: "ocean", label: "Ocean", colors: ["#0f1d2e", "#38bdf8", "#2dd4bf"] },
  { id: "arcade", label: "Arcade", colors: ["#0d0b1a", "#ff3df0", "#3dffb8"] },
];

export function ThemePicker({ value }: { value: string }) {
  return (
    <div className="theme-pick">
      {THEMES.map((t) => (
        <label key={t.id}>
          <input type="radio" name="theme" value={t.id} defaultChecked={value === t.id} />
          <span className="swatches">{t.colors.map((c) => <span key={c} style={{ background: c }} />)}</span>
          {t.label}
        </label>
      ))}
    </div>
  );
}
