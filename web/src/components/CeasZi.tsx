import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '../lib/cn';
import { minutesToHhMm } from '../lib/format';
import { segmenteInterval, type FereastraProgram, type SegmentCeas } from '../lib/ceas';

/** Culorile celor două regimuri, folosite și în legendă */
export const CULOARE_STANDARD = '#6366f1'; // indigo — program normal
export const CULOARE_OFF = '#c026d3'; // fucsia — în afara programului

type Marime = 'mic' | 'mediu' | 'mare';

/**
 * Ce jumătate de zi se vede: soarele ține ziua și seara (12:00–24:00), luna
 * ține noaptea și dimineața (00:00–12:00). „toata" = un cadran de 24 de ore.
 */
export type FataCeas = 'soare' | 'luna' | 'toata';

const MARIMI: Record<Marime, { px: number; grosime: number; fundal: number }> = {
  mic: { px: 26, grosime: 20, fundal: 7 },
  mediu: { px: 56, grosime: 13, fundal: 5 },
  mare: { px: 240, grosime: 12, fundal: 4 },
};

/** Fereastra de minute pe care o acoperă cadranul */
function fereastra(fata: FataCeas): { baza: number; intindere: number } {
  if (fata === 'toata') return { baza: 0, intindere: 1440 };
  return { baza: fata === 'soare' ? 720 : 0, intindere: 720 };
}

/** Punctul de pe cerc pentru un minut al zilei (ora 12 sus, ca la orice ceas) */
function punct(minut: number, raza: number, fata: FataCeas): [number, number] {
  const { baza, intindere } = fereastra(fata);
  const unghi = ((minut - baza) / intindere) * 2 * Math.PI - Math.PI / 2;
  return [50 + raza * Math.cos(unghi), 50 + raza * Math.sin(unghi)];
}

function arc(from: number, to: number, raza: number, fata: FataCeas): string {
  const { intindere } = fereastra(fata);
  const [x1, y1] = punct(from, raza, fata);
  const [x2, y2] = punct(to, raza, fata);
  const arcMare = to - from > intindere / 2 ? 1 : 0;
  return `M ${x1} ${y1} A ${raza} ${raza} 0 ${arcMare} 1 ${x2} ${y2}`;
}

/** Partea din segment care se vede pe cadranul ales */
function taieLaFata(s: SegmentCeas, fata: FataCeas): SegmentCeas | null {
  const { baza, intindere } = fereastra(fata);
  const from = Math.max(s.from, baza);
  const to = Math.min(s.to, baza + intindere);
  return to > from ? { ...s, from, to } : null;
}

/** Ora afișată pe cadran: 0 și 12 se scriu amândouă „12", ca la un ceas obișnuit */
function etichetaOra(ora: number): string {
  const h = ora % 12;
  return String(h === 0 ? 12 : h);
}

/**
 * Ceasul unei zile: fiecare interval lucrat e un arc, colorat după cum a picat
 * în programul normal sau în afara lui. Cadranul e de 12 ore, ca un ceas
 * obișnuit, cu un comutator soare/lună între prima și a doua jumătate a zilei.
 * Cu `onSelectie` devine și de desenat: tragi peste ore ca să alegi intervalul.
 */
export function CeasZi({
  segmente,
  selectie,
  onSelectie,
  program,
  date,
  marime = 'mediu',
  fata: fataFixa,
  pas = 15,
  className,
}: {
  segmente: SegmentCeas[];
  selectie?: { start: number; end: number } | null;
  onSelectie?: (interval: { start: number; end: number }) => void;
  program?: FereastraProgram;
  /** Ziua desenată — cu ea colorăm corect selecția (weekendul poate fi integral majorat) */
  date?: string;
  marime?: Marime;
  /** Impune un cadran anume; altfel cel mare are comutator, iar restul arată toată ziua */
  fata?: FataCeas;
  pas?: number;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const ancora = useRef<number | null>(null);
  const { px, grosime, fundal } = MARIMI[marime];
  const raza = 50 - grosime / 2 - 2;
  const cuComutator = marime === 'mare' && !fataFixa;

  const segmenteSelectie = useMemo(
    () =>
      selectie && selectie.end > selectie.start
        ? program && date
          ? segmenteInterval(date, selectie.start, selectie.end, program)
          : [{ from: selectie.start, to: selectie.end, standard: true }]
        : [],
    [selectie, program, date],
  );

  /** Jumătatea de zi cu care pornim: cea în care s-a lucrat mai mult, altfel cea în care începe programul */
  const fataImplicita = (): FataCeas => {
    const minutePeFata = (tinta: FataCeas) =>
      [...segmente, ...segmenteSelectie].reduce((total, s) => {
        const bucata = taieLaFata(s, tinta);
        return total + (bucata ? bucata.to - bucata.from : 0);
      }, 0);

    const cuSoare = minutePeFata('soare');
    const cuLuna = minutePeFata('luna');
    if (cuSoare > 0 || cuLuna > 0) return cuSoare >= cuLuna ? 'soare' : 'luna';
    return (program?.standardStart ?? 540) >= 720 ? 'soare' : 'luna';
  };

  const [fataAleasa, setFataAleasa] = useState<FataCeas>(fataImplicita);

  // la schimbarea zilei ne întoarcem pe jumătatea unde chiar s-a lucrat
  const ziuaAfisata = useRef(date);
  useEffect(() => {
    if (date === ziuaAfisata.current) return;
    ziuaAfisata.current = date;
    setFataAleasa(fataImplicita());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, segmente]);
  const fata: FataCeas = fataFixa ?? (cuComutator ? fataAleasa : 'toata');
  const { baza, intindere } = fereastra(fata);

  /** Minutul din dreptul punctului atins, dus în ziua reală */
  function minutulDin(event: ReactPointerEvent<SVGSVGElement>): number {
    const cadru = svgRef.current?.getBoundingClientRect();
    if (!cadru) return 0;
    const x = event.clientX - cadru.left - cadru.width / 2;
    const y = event.clientY - cadru.top - cadru.height / 2;
    let grade = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (grade < 0) grade += 360;
    const peCadran = Math.round(((grade / 360) * intindere) / pas) * pas;
    return baza + Math.min(intindere, Math.max(0, peCadran));
  }

  /**
   * Minutul ales în timpul tragerii, mereu înainte pe cadran față de punctul de
   * pornire — așa, dacă treci de ora 12, intervalul continuă în cealaltă
   * jumătate a zilei (10:00 → 14:00) în loc să sară înapoi.
   */
  function minutInainte(minut: number, start: number): number {
    let tinta = minut;
    while (tinta < start) tinta += intindere;
    while (tinta - start > intindere) tinta -= intindere;
    return Math.min(tinta, 1440);
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
    const start = ancora.current;
    const end = minutInainte(minutulDin(event), start);
    onSelectie({ start, end: Math.max(end, Math.min(1440, start + pas)) });
  }

  function laRidicare(event: ReactPointerEvent<SVGSVGElement>) {
    if (ancora.current === null) return;
    ancora.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  const vizibile = segmente.map((s) => taieLaFata(s, fata)).filter(Boolean) as SegmentCeas[];
  const selectiaVizibila = segmenteSelectie.map((s) => taieLaFata(s, fata)).filter(Boolean) as SegmentCeas[];
  const bandaProgram = program
    ? taieLaFata({ from: program.standardStart, to: program.standardEnd, standard: true }, fata)
    : null;

  /** Cealaltă jumătate are și ea ceva de arătat? Punem un punct pe iconiță */
  const areInCealalta = (tinta: FataCeas) =>
    [...segmente, ...segmenteSelectie].some((s) => taieLaFata(s, tinta) !== null);

  const ceas = (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      width={px}
      height={px}
      className={cn(onSelectie && 'cursor-crosshair touch-none select-none', className)}
      onPointerDown={laApasare}
      onPointerMove={laMiscare}
      onPointerUp={laRidicare}
      onPointerCancel={laRidicare}
      role={onSelectie ? 'slider' : 'img'}
      aria-label="Orele lucrate în această zi"
    >
      <circle cx="50" cy="50" r={raza} fill="none" stroke="#e2e8f0" strokeWidth={fundal} />

      {/* fereastra programului normal, ca reper discret */}
      {bandaProgram && marime !== 'mic' && (
        <path
          d={arc(bandaProgram.from, bandaProgram.to, raza, fata)}
          fill="none"
          stroke="#c7d2fe"
          strokeWidth={fundal}
          strokeLinecap="butt"
        />
      )}

      {vizibile.map((s, index) => (
        <path
          key={`ora-${s.from}-${index}`}
          d={arc(s.from, s.to, raza, fata)}
          fill="none"
          stroke={s.standard ? CULOARE_STANDARD : CULOARE_OFF}
          strokeWidth={grosime}
          strokeLinecap="butt"
          opacity={selectiaVizibila.length > 0 ? 0.35 : 1}
        />
      ))}

      {selectiaVizibila.map((s, index) => (
        <path
          key={`selectie-${s.from}-${index}`}
          d={arc(s.from, s.to, raza, fata)}
          fill="none"
          stroke={s.standard ? CULOARE_STANDARD : CULOARE_OFF}
          strokeWidth={grosime}
          strokeLinecap="butt"
        />
      ))}

      {marime === 'mare' && (
        <>
          {Array.from({ length: fata === 'toata' ? 24 : 12 }, (_, index) => {
            const minut = baza + index * (intindere / (fata === 'toata' ? 24 : 12));
            const principala = fata === 'toata' ? index % 3 === 0 : true;
            const [x1, y1] = punct(minut, raza - grosime / 2 - 1, fata);
            const [x2, y2] = punct(minut, raza - grosime / 2 - (principala ? 4 : 2), fata);
            return (
              <line
                key={minut}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={principala ? '#94a3b8' : '#cbd5e1'}
                strokeWidth={principala ? 0.8 : 0.5}
              />
            );
          })}
          {Array.from({ length: 12 }, (_, index) => {
            const ora = index * (fata === 'toata' ? 2 : 1);
            const minut = baza + ora * 60 * (fata === 'toata' ? 1 : 1);
            const [x, y] = punct(minut, raza - grosime / 2 - 12, fata);
            return (
              <text
                key={`eticheta-${ora}`}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="6"
                fontWeight="700"
                fill="#94a3b8"
              >
                {fata === 'toata' ? ora : etichetaOra(index)}
              </text>
            );
          })}
        </>
      )}
    </svg>
  );

  if (!cuComutator) return ceas;

  return (
    <div className="flex flex-col items-center gap-3">
      {ceas}
      <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1">
        {(
          [
            { valoare: 'luna' as const, Icon: Moon, titlu: 'Noaptea și dimineața (00:00 – 12:00)' },
            { valoare: 'soare' as const, Icon: Sun, titlu: 'Ziua și seara (12:00 – 24:00)' },
          ]
        ).map(({ valoare, Icon, titlu }) => (
          <button
            key={valoare}
            type="button"
            onClick={() => setFataAleasa(valoare)}
            title={titlu}
            aria-label={titlu}
            aria-pressed={fata === valoare}
            className={cn(
              'relative grid h-9 w-12 place-items-center rounded-xl transition',
              fata === valoare ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600',
            )}
          >
            <Icon className="h-4 w-4" />
            {fata !== valoare && areInCealalta(valoare) && (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-indigo-500" />
            )}
          </button>
        ))}
      </div>
    </div>
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
