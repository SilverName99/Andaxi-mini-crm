import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '../lib/cn';
import { minutesToHhMm } from '../lib/format';
import { segmenteInterval, type FereastraProgram, type SegmentCeas } from '../lib/ceas';

/** Culorile celor doua regimuri, folosite si in legendă */
export const CULOARE_STANDARD = '#6366f1'; // indigo — program normal
export const CULOARE_OFF = '#c026d3'; // fuchsia — în afara programului

type Marime = 'mic' | 'mediu' | 'mare';

const MARIMI: Record<Marime, { px: number; grosime: number; fundal: number }> = {
  mic: { px: 26, grosime: 20, fundal: 7 },
  mediu: { px: 56, grosime: 13, fundal: 5 },
  mare: { px: 240, grosime: 12, fundal: 4 },
};

/** Punctul de pe cerc pentru un minut al zilei (miezul nopții sus, ora crește în sensul acelor) */
function punct(minut: number, raza: number): [number, number] {
  const unghi = (minut / 1440) * 2 * Math.PI - Math.PI / 2;
  return [50 + raza * Math.cos(unghi), 50 + raza * Math.sin(unghi)];
}

function arc(from: number, to: number, raza: number): string {
  const [x1, y1] = punct(from, raza);
  const [x2, y2] = punct(to, raza);
  const arcMare = to - from > 720 ? 1 : 0;
  return `M ${x1} ${y1} A ${raza} ${raza} 0 ${arcMare} 1 ${x2} ${y2}`;
}

/**
 * Ceas de 24 de ore: fiecare interval lucrat e un arc, colorat după cum a picat
 * în programul normal sau în afara lui. Cu `onSelectie` devine și de desenat:
 * tragi cu degetul/mouse-ul peste ore ca să alegi intervalul.
 */
export function Ceas24({
  segmente,
  selectie,
  onSelectie,
  program,
  date,
  marime = 'mediu',
  pas = 15,
  className,
}: {
  segmente: SegmentCeas[];
  /** Intervalul aflat în lucru, desenat peste celelalte */
  selectie?: { start: number; end: number } | null;
  onSelectie?: (interval: { start: number; end: number }) => void;
  program?: FereastraProgram;
  /** Ziua desenată — cu ea colorăm corect selecția (weekendul poate fi integral majorat) */
  date?: string;
  marime?: Marime;
  /** La cât se rotunjește minutul ales, în minute */
  pas?: number;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const ancora = useRef<number | null>(null);
  const { px, grosime, fundal } = MARIMI[marime];
  const raza = 50 - grosime / 2 - 2;
  const interactiv = Boolean(onSelectie);

  /** Minutul din dreptul punctului atins */
  function minutulDin(event: ReactPointerEvent<SVGSVGElement>): number {
    const cadru = svgRef.current?.getBoundingClientRect();
    if (!cadru) return 0;
    const x = event.clientX - cadru.left - cadru.width / 2;
    const y = event.clientY - cadru.top - cadru.height / 2;
    let grade = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (grade < 0) grade += 360;
    const minut = Math.round(((grade / 360) * 1440) / pas) * pas;
    return Math.min(1440, Math.max(0, minut));
  }

  function laApasare(event: ReactPointerEvent<SVGSVGElement>) {
    if (!onSelectie) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const minut = minutulDin(event);
    ancora.current = minut;
    onSelectie({ start: minut, end: Math.min(1440, minut + pas) });
  }

  function laMiscare(event: ReactPointerEvent<SVGSVGElement>) {
    if (!onSelectie || ancora.current === null) return;
    const minut = minutulDin(event);
    const start = Math.min(ancora.current, minut);
    const end = Math.max(ancora.current, minut);
    onSelectie({ start, end: Math.max(end, start + pas) });
  }

  function laRidicare(event: ReactPointerEvent<SVGSVGElement>) {
    if (ancora.current === null) return;
    ancora.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  const orePrincipale = [0, 3, 6, 9, 12, 15, 18, 21];

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      width={px}
      height={px}
      className={cn(interactiv && 'cursor-crosshair touch-none select-none', className)}
      onPointerDown={laApasare}
      onPointerMove={laMiscare}
      onPointerUp={laRidicare}
      onPointerCancel={laRidicare}
      role={interactiv ? 'slider' : 'img'}
      aria-label="Orele lucrate în această zi"
    >
      {/* inelul gol al zilei */}
      <circle cx="50" cy="50" r={raza} fill="none" stroke="#e2e8f0" strokeWidth={fundal} />

      {/* fereastra programului normal, ca reper discret */}
      {program && marime !== 'mic' && program.standardEnd > program.standardStart && (
        <path
          d={arc(program.standardStart, program.standardEnd, raza)}
          fill="none"
          stroke="#c7d2fe"
          strokeWidth={fundal}
          strokeLinecap="butt"
        />
      )}

      {segmente.map((s, index) => (
        <path
          key={`${s.from}-${s.to}-${index}`}
          d={arc(s.from, s.to, raza)}
          fill="none"
          stroke={s.standard ? CULOARE_STANDARD : CULOARE_OFF}
          strokeWidth={grosime}
          strokeLinecap="butt"
          opacity={selectie ? 0.35 : 1}
        />
      ))}

      {/* selecția se colorează cu aceleași reguli: se vede din desen cât iese din program */}
      {selectie &&
        selectie.end > selectie.start &&
        (program && date
          ? segmenteInterval(date, selectie.start, selectie.end, program)
          : [{ from: selectie.start, to: selectie.end, standard: true }]
        ).map((s, index) => (
          <path
            key={`selectie-${s.from}-${index}`}
            d={arc(s.from, s.to, raza)}
            fill="none"
            stroke={s.standard ? CULOARE_STANDARD : CULOARE_OFF}
            strokeWidth={grosime}
            strokeLinecap="butt"
          />
        ))}

      {marime === 'mare' && (
        <>
          {Array.from({ length: 24 }, (_, ora) => {
            const principala = orePrincipale.includes(ora);
            const [x1, y1] = punct(ora * 60, raza - grosime / 2 - 1);
            const [x2, y2] = punct(ora * 60, raza - grosime / 2 - (principala ? 4 : 2));
            return (
              <line
                key={ora}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={principala ? '#94a3b8' : '#cbd5e1'}
                strokeWidth={principala ? 0.8 : 0.5}
              />
            );
          })}
          {orePrincipale.map((ora) => {
            const [x, y] = punct(ora * 60, raza - grosime / 2 - 12);
            return (
              <text
                key={ora}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="5.5"
                fontWeight="700"
                fill="#94a3b8"
              >
                {ora}
              </text>
            );
          })}
        </>
      )}
    </svg>
  );
}

/** Legenda celor două culori, pentru ecranele unde ceasul apare mare */
export function LegendaCeas({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500', className)}>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: CULOARE_STANDARD }} /> program normal
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: CULOARE_OFF }} /> în afara programului
      </span>
    </div>
  );
}

/** Eticheta scurtă a unui interval, pentru sub ceas */
export function etichetaInterval(start: number, end: number): string {
  return `${minutesToHhMm(start)}–${minutesToHhMm(end % 1440)}`;
}
