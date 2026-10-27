// Decorative illustrations for the home page. All are aria-hidden: the text beside them carries
// the meaning. Colours come from theme tokens so they work in light and dark mode.

export type StepArtKind = "register" | "questionnaire" | "exam" | "guidance";

/** Small scene for each "How the screening works" card. Each has its own motion (see globals.css). */
export function StepArt({ kind }: { kind: StepArtKind }) {
  return (
    <svg className={`step-art step-art-${kind}`} viewBox="0 0 160 96" aria-hidden="true" focusable="false">
      <rect className="art-bg" x="0" y="0" width="160" height="96" rx="14" />
      {kind === "register" && (
        <>
          {/* Consent form with a box that gets ticked */}
          <rect className="art-paper" x="42" y="12" width="64" height="74" rx="6" />
          <rect className="art-line" x="52" y="24" width="34" height="5" rx="2.5" />
          <rect className="art-line soft" x="52" y="35" width="44" height="4" rx="2" />
          <rect className="art-line soft" x="52" y="44" width="38" height="4" rx="2" />
          <rect className="art-box" x="52" y="58" width="16" height="16" rx="4" />
          <path className="art-tick" d="M55 66 l4 4 l7 -9" />
          <rect className="art-line soft" x="74" y="64" width="22" height="4" rx="2" />
          <g className="art-pen">
            <rect x="112" y="30" width="8" height="40" rx="3" transform="rotate(28 116 50)" />
            <path d="M104 70 l3 -9 l6 3 z" />
          </g>
        </>
      )}
      {kind === "questionnaire" && (
        <>
          {/* Phone with answer bars filling in */}
          <rect className="art-paper" x="54" y="8" width="52" height="82" rx="9" />
          <rect className="art-line" x="72" y="14" width="16" height="3" rx="1.5" />
          <circle className="art-dot" cx="64" cy="32" r="4" />
          <rect className="art-track" x="72" y="29" width="26" height="6" rx="3" />
          <rect className="art-bar b1" x="72" y="29" width="26" height="6" rx="3" />
          <circle className="art-dot" cx="64" cy="50" r="4" />
          <rect className="art-track" x="72" y="47" width="26" height="6" rx="3" />
          <rect className="art-bar b2" x="72" y="47" width="26" height="6" rx="3" />
          <circle className="art-dot" cx="64" cy="68" r="4" />
          <rect className="art-track" x="72" y="65" width="26" height="6" rx="3" />
          <rect className="art-bar b3" x="72" y="65" width="26" height="6" rx="3" />
          <g className="art-timer">
            <circle cx="124" cy="24" r="11" />
            <path d="M124 17 v7 l5 3" />
          </g>
        </>
      )}
      {kind === "exam" && (
        <>
          {/* Open mouth and throat being examined, with a magnifier that scans across it */}
          <ellipse className="art-lips" cx="80" cy="50" rx="38" ry="28" />
          <ellipse className="art-mouth" cx="80" cy="52" rx="30" ry="21" />
          <path className="art-throat" d="M68 64 q12 -30 24 0 z" />
          <path className="art-uvula" d="M77.5 38 q2.5 -2 5 0 v7 q-2.5 4 -5 0 z" />
          <g className="art-teeth">{[60, 67, 74, 81, 88, 95].map((x) => <rect key={x} x={x - 0.5} y="31" width="6" height="6.5" rx="1.6" />)}</g>
          <path className="art-tongue" d="M57 64 q23 -13 46 0 q-3 9 -23 10 q-20 -1 -23 -10 z" />
          <path className="art-tongue-line" d="M80 62 v7" />
          <g className="art-lens">
            <circle cx="0" cy="0" r="15" />
            <path d="M11 11 l12 12" />
          </g>
          <circle className="art-spark s1" cx="40" cy="22" r="2.5" />
          <circle className="art-spark s2" cx="124" cy="70" r="2" />
        </>
      )}
      {kind === "guidance" && (
        <>
          {/* A route that draws itself to a flag */}
          <path className="art-route-bg" d="M18 78 C 48 78, 40 44, 72 46 S 106 22, 128 26" />
          <path className="art-route" d="M18 78 C 48 78, 40 44, 72 46 S 106 22, 128 26" />
          <circle className="art-start" cx="18" cy="78" r="5" />
          <g className="art-flag">
            <path className="pole" d="M128 26 V 8" />
            <path className="cloth" d="M128 8 h18 l-5 6 l5 6 h-18 z" />
          </g>
          <circle className="art-spark s1" cx="72" cy="46" r="3" />
        </>
      )}
    </svg>
  );
}

/** Larger scene for "What happens next": a participant ID card with floating reassurance badges. */
export function NextStepsArt() {
  return (
    <svg className="next-art" viewBox="0 0 340 260" aria-hidden="true" focusable="false">
      <circle className="na-glow" cx="170" cy="130" r="112" />
      <circle className="na-orbit" cx="170" cy="130" r="96" />
      {/* ID card */}
      <g className="na-card">
        <rect className="na-card-bg" x="92" y="78" width="156" height="100" rx="14" />
        <rect className="na-card-band" x="92" y="78" width="156" height="24" rx="14" />
        <rect className="na-card-band" x="92" y="92" width="156" height="10" />
        <circle className="na-avatar" cx="126" cy="134" r="18" />
        <circle className="na-avatar-head" cx="126" cy="129" r="7" />
        <path className="na-avatar-body" d="M114 147 c2 -8 22 -8 24 0" />
        <rect className="na-line strong" x="152" y="118" width="70" height="8" rx="4" />
        <rect className="na-line" x="152" y="133" width="52" height="6" rx="3" />
        <rect className="na-line" x="152" y="145" width="62" height="6" rx="3" />
        <g className="na-qr">
          {[0, 1, 2].map((r) => [0, 1, 2].map((c) => ((r + c) % 2 === 0 ? <rect key={`${r}${c}`} x={206 + c * 7} y={156 + r * 7} width="5" height="5" rx="1" /> : null)))}
        </g>
      </g>
      {/* Floating badges: privacy, clinician, follow-up */}
      <g className="na-badge nb1">
        <circle cx="70" cy="70" r="24" />
        <path className="na-icon" d="M70 56 l11 4 v8 c0 8 -5 13 -11 15 c-6 -2 -11 -7 -11 -15 v-8 z" />
        <path className="na-icon-tick" d="M65 69 l4 4 l7 -8" />
      </g>
      <g className="na-badge nb2">
        <circle cx="282" cy="92" r="22" />
        <path className="na-icon" d="M272 84 h20 a4 4 0 0 1 4 4 v9 a4 4 0 0 1 -4 4 h-11 l-6 5 v-5 h-3 a4 4 0 0 1 -4 -4 v-9 a4 4 0 0 1 4 -4 z" />
      </g>
      <g className="na-badge nb3">
        <circle cx="258" cy="206" r="20" />
        <path className="na-icon" d="M250 198 v6 a8 8 0 0 0 16 0 v-6 M258 212 v6 a6 6 0 0 0 12 0 v-3" />
        <circle className="na-icon-dot" cx="270" cy="213" r="3" />
      </g>
      <circle className="na-spark k1" cx="48" cy="180" r="4" />
      <circle className="na-spark k2" cx="300" cy="40" r="3" />
      <circle className="na-spark k3" cx="150" cy="30" r="3.5" />
    </svg>
  );
}
