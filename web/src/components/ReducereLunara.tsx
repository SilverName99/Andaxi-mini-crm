import { useEffect, useState } from 'react';
import { Percent, Tag } from 'lucide-react';
import { api } from '../lib/api';
import { useCrudMutation, useMonthlyDiscount } from '../lib/queries';
import { Button, ErrorBlock, Field, Input, Modal, Segmented, useToast } from './ui';
import { formatEur } from '../lib/format';
import { numeLuna } from '../lib/calendar';
import type { MonthlyDiscount } from '../lib/types';

/** Cat se scade dintr-o suma, dupa tipul reducerii */
export function calculeazaReducere(suma: number, discount: MonthlyDiscount | null | undefined): number {
  if (!discount || discount.value <= 0 || suma <= 0) return 0;
  const brut = discount.type === 'PERCENT' ? (suma * discount.value) / 100 : discount.value;
  return Math.min(Math.round(brut * 100) / 100, suma);
}

/**
 * Butonul si fereastra de reducere pe luna: fie procent, fie suma fixa.
 * Reducerea se scade din orele lunii, inaintea TVA-ului.
 */
export function ReducereLunara({
  clientId,
  month,
  billableEur,
}: {
  clientId: string;
  month: string;
  /** Suma de facturat pe luna, ca sa putem arata rezultatul */
  billableEur: number;
}) {
  const toast = useToast();
  const { data: discount } = useMonthlyDiscount(clientId, month);
  const [deschis, setDeschis] = useState(false);
  const [type, setType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // cand se schimba luna sau se incarca reducerea, pornim de la ce e salvat
  useEffect(() => {
    setType(discount?.type ?? 'PERCENT');
    setValue(discount ? String(discount.value) : '');
    setNote(discount?.note ?? '');
  }, [discount, month]);

  const salveaza = useCrudMutation((payload: { type: string; value: number; note: string }) =>
    api.put(`/monthly-discount?clientId=${clientId}&month=${month}`, payload),
  );

  const valoare = Number(value.replace(',', '.')) || 0;
  const previzualizare = calculeazaReducere(billableEur, { type, value: valoare } as MonthlyDiscount);

  return (
    <>
      <Button
        size="sm"
        variant={discount ? 'primary' : 'secondary'}
        icon={<Tag className="h-3.5 w-3.5" />}
        onClick={() => setDeschis(true)}
      >
        {discount
          ? `Reducere ${discount.type === 'PERCENT' ? `${discount.value}%` : formatEur(discount.value)}`
          : 'Reducere lunară'}
      </Button>

      <Modal
        open={deschis}
        onClose={() => setDeschis(false)}
        title="Reducere pe lună"
        subtitle={`Se scade din orele lunii ${numeLuna(month)}, înainte de TVA`}
      >
        <div className="flex flex-col gap-4">
          <Field label="Tipul reducerii">
            <Segmented
              value={type}
              onChange={setType}
              options={[
                { value: 'PERCENT', label: 'Procent' },
                { value: 'AMOUNT', label: 'Sumă fixă' },
              ]}
            />
          </Field>

          <Field
            label={type === 'PERCENT' ? 'Procent (%)' : 'Sumă (EUR)'}
            hint="Lasă gol sau 0 ca să elimini reducerea"
          >
            <div className="relative">
              <Percent className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
              <Input
                type="number"
                min={0}
                step={type === 'PERCENT' ? '1' : '0.01'}
                className="pl-10"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={type === 'PERCENT' ? '10' : '100'}
              />
            </div>
          </Field>

          <Field label="Motiv (opțional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. client fidel" />
          </Field>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between gap-4 py-1 text-slate-600">
              <span>De facturat în lună</span>
              <span className="font-semibold">{formatEur(billableEur)}</span>
            </div>
            <div className="flex justify-between gap-4 py-1 text-emerald-700">
              <span>Reducere</span>
              <span className="font-semibold">−{formatEur(previzualizare)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base">
              <span className="font-bold text-slate-800">Rămâne de facturat</span>
              <span className="font-extrabold text-indigo-700">{formatEur(billableEur - previzualizare)}</span>
            </div>
          </div>

          {error && <ErrorBlock message={error} />}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeschis(false)}>Anulează</Button>
          <Button
            loading={salveaza.isPending}
            onClick={async () => {
              setError('');
              try {
                await salveaza.mutateAsync({ type, value: valoare, note });
                toast(valoare > 0 ? 'Reducere salvată' : 'Reducere eliminată');
                setDeschis(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Eroare la salvare');
              }
            }}
          >
            Salvează
          </Button>
        </div>
      </Modal>
    </>
  );
}
