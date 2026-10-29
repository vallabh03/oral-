// Illustrated guide for each mouth photo: a front view of an open mouth with the area to
// photograph highlighted. Decorative (aria-hidden) — the written steps carry the instructions.
// Note: "left" means the participant's own left, which appears on the viewer's right.

export function MouthDiagram({ view }: { view: string }) {
  // "Upper mouth" covers the roof of the mouth and the upper gums.
  const active = view === "upper_mouth" ? ["palate", "upper_gums"] : [view];
  const on = (v: string | string[]) => ((Array.isArray(v) ? v : [v]).some((x) => active.includes(x)) ? "md-hl" : "");
  return (
    <svg className="mouth-diagram" viewBox="0 0 220 160" aria-hidden="true" focusable="false">
      <rect className="md-bg" width="220" height="160" rx="14" />
      {view === "concern" ? (
        <g>
          <ellipse className="md-lip" cx="110" cy="82" rx="78" ry="52" />
          <ellipse className="md-inside" cx="110" cy="82" rx="62" ry="38" />
          <circle className="md-hl" cx="130" cy="92" r="9" />
          <g className="md-lens"><circle cx="130" cy="92" r="22" /><path d="M146 108 l20 20" /></g>
        </g>
      ) : view === "tongue_under" || view === "lower_mouth" ? (
        <g>
          <ellipse className={`md-lip ${on("lips")}`} cx="110" cy="82" rx="78" ry="56" />
          <ellipse className="md-inside" cx="110" cy="84" rx="62" ry="42" />
          <path className="md-tongue" d="M76 60 Q110 34 144 60 Q140 78 110 80 Q80 78 76 60 Z" />
          <path className="md-hl" d="M80 88 Q110 78 140 88 Q136 112 110 116 Q84 112 80 88 Z" />
          <path className="md-frenum" d="M110 84 V108" />
        </g>
      ) : (
        <g>
          <ellipse className={`md-lip ${on("lips")}`} cx="110" cy="82" rx="78" ry="56" />
          <ellipse className="md-inside" cx="110" cy="84" rx="62" ry="42" />
          <path className={`md-palate ${on("palate")}`} d="M62 66 Q110 30 158 66 Q110 56 62 66 Z" />
          <path className={`md-gum ${on("upper_gums")}`} d="M58 64 Q110 44 162 64 L160 72 Q110 54 60 72 Z" />
          <g className="md-teeth">{[70, 85, 100, 115, 130, 145].map((x) => <rect key={x} x={x - 6} y="62" width="13" height="12" rx="3" />)}</g>
          <path className={`md-gum ${on("lower_gums")}`} d="M60 104 Q110 122 160 104 L158 112 Q110 130 62 112 Z" />
          <path className={`md-cheek ${on("cheek_right")}`} d="M50 70 Q42 84 50 104 L62 100 Q58 84 62 72 Z" />
          <path className={`md-cheek ${on("cheek_left")}`} d="M170 70 Q178 84 170 104 L158 100 Q162 84 158 72 Z" />
          <path className={`md-tongue ${on("tongue_top")}`} d="M80 88 Q110 76 140 88 Q146 112 110 128 Q74 112 80 88 Z" />
          <path className="md-tongue-line" d="M110 86 V118" />
        </g>
      )}
    </svg>
  );
}
