import { X } from 'lucide-react';
import { Select } from './ui';
import { etichete, laEticheta, optiuniLucrare } from '../lib/lucrari';
import type { Subscription } from '../lib/types';

/**
 * Câmpul „Lucrare / proiect": o intervenție poate intra pe mai multe lucrări
 * deodată. Alegi din listă, iar cele alese rămân ca etichete pe care le poți
 * scoate. Ordinea contează: orele plătite se scad din abonamente în ordinea în
 * care le-ai ales aici.
 */
export function SelectorLucrari({
  value,
  onChange,
  abonamente = [],
  etichete: etichetePropuse = [],
}: {
  value: string;
  onChange: (value: string) => void;
  abonamente?: Subscription[];
  etichete?: string[];
}) {
  const alese = etichete(value);
  const optiuni = optiuniLucrare(abonamente, etichetePropuse, value).filter(
    (o) => o.value && !alese.includes(o.value),
  );

  return (
    <div className="flex flex-col gap-2">
      {alese.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {alese.map((lucrare) => (
            <span
              key={lucrare}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-1 pl-3 pr-1.5 text-xs font-semibold text-indigo-700"
            >
              {lucrare}
              <button
                type="button"
                onClick={() => onChange(laEticheta(alese.filter((l) => l !== lucrare)))}
                className="grid h-4 w-4 place-items-center rounded-full text-indigo-400 transition hover:bg-indigo-200 hover:text-indigo-700"
                aria-label={`Scoate ${lucrare}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Select
        value=""
        onChange={(e) => e.target.value && onChange(laEticheta([...alese, e.target.value]))}
        options={[
          { value: '', label: alese.length ? '+ mai adaugă o lucrare' : '— fără lucrare —' },
          ...optiuni,
        ]}
      />
    </div>
  );
}
