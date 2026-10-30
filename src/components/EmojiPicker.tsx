export const EMOJIS = ["🎁", "🎂", "🎄", "🧸", "🎮", "📚", "🎨", "⚽", "🦖", "🦄", "🚀", "💍", "🏕️", "🍳", "🎧", "🌸"];

export function EmojiPicker({ value }: { value?: string }) {
  return (
    <div>
      <p className="small fw-600 mb-6">Pick an icon</p>
      <div className="row gap-6">
        {EMOJIS.map((e, i) => (
          <label key={e} className="inline" style={{ fontSize: "1.6rem", gap: 2 }}>
            <input type="radio" name="emoji" value={e} defaultChecked={value ? value === e : i === 0} />
            {e}
          </label>
        ))}
      </div>
    </div>
  );
}
