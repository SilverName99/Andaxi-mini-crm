import { useRef, useState, type ChangeEvent } from 'react';
import { Download, FileUp, Upload } from 'lucide-react';
import { useCrudMutation } from '../lib/queries';
import { ApiError } from '../lib/api';
import { Badge, Button, ErrorBlock, Modal, useToast } from './ui';
import { formatDate, formatEur, formatMinutes } from '../lib/format';

interface RandImport {
  linie: number;
  date: string;
  description: string;
  projectTag: string;
  minutes: number;
  amountEur: number;
  error: string;
}

interface Previzualizare {
  rows: RandImport[];
  valid: number;
  invalid: number;
}

/** Trimite fisierul ca text brut catre endpoint-ul de import */
async function trimiteFisier(clientId: string, file: File, dryRun: boolean): Promise<Previzualizare> {
  const response = await fetch(`/api/worklogs/import?clientId=${clientId}${dryRun ? '&dryRun=1' : ''}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'text/csv' },
    body: await file.text(),
  });

  if (!response.ok) {
    let message = `Eroare ${response.status}`;
    try {
      message = (await response.json()).error ?? message;
    } catch {
      /* raspuns fara JSON */
    }
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as Previzualizare;
}

/**
 * Import de ore dintr-un fisier CSV, cu previzualizare: se vede exact ce se va
 * crea si ce linii au probleme, inainte ca ceva sa fie scris in baza de date.
 */
export function ImportOre({ clientId, clientName }: { clientId: string; clientName: string }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [fisier, setFisier] = useState<File | null>(null);
  const [previzualizare, setPrevizualizare] = useState<Previzualizare | null>(null);
  const [error, setError] = useState('');

  const verifica = useCrudMutation((file: File) => trimiteFisier(clientId, file, true));
  const importa = useCrudMutation((file: File) => trimiteFisier(clientId, file, false));

  async function laAlegereFisier(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError('');
    try {
      const rezultat = await verifica.mutateAsync(file);
      setFisier(file);
      setPrevizualizare(rezultat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut citi fișierul');
    }
  }

  function inchide() {
    setPrevizualizare(null);
    setFisier(null);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Import din fișier</p>
        <a
          href="/api/worklogs/import/template"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 transition hover:underline"
        >
          <Download className="h-3.5 w-3.5" /> Descarcă șablonul
        </a>
      </div>

      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={laAlegereFisier} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-slate-200 py-6 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40"
      >
        <FileUp className="h-5 w-5 text-slate-300" />
        <span className="text-sm text-slate-500">
          {verifica.isPending ? 'Se citește fișierul…' : 'Încarcă un CSV cu orele lunii'}
        </span>
        <span className="text-xs text-slate-400">Data · Ore · Descriere · Etichetă · Categorie · Tarif</span>
      </button>

      {error && <div className="mt-3"><ErrorBlock message={error} /></div>}

      {previzualizare && (
        <Modal
          open
          onClose={inchide}
          size="lg"
          title="Verifică înainte de import"
          subtitle={`${clientName} · ${previzualizare.valid} linii valide${
            previzualizare.invalid > 0 ? `, ${previzualizare.invalid} cu probleme` : ''
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Linia</th>
                  <th className="py-2 pr-3 font-semibold">Data</th>
                  <th className="py-2 pr-3 font-semibold">Lucrare</th>
                  <th className="py-2 pr-3 text-right font-semibold">Ore</th>
                  <th className="py-2 text-right font-semibold">Valoare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previzualizare.rows.map((rand) => (
                  <tr key={rand.linie} className={rand.error ? 'bg-red-50/60' : undefined}>
                    <td className="py-2 pr-3 text-slate-400">{rand.linie}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                      {rand.date ? formatDate(rand.date) : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      <p className="text-slate-800">{rand.description || '—'}</p>
                      {rand.projectTag && (
                        <Badge className="mt-1 bg-indigo-50 text-indigo-600">{rand.projectTag}</Badge>
                      )}
                      {rand.error && <p className="mt-1 text-xs font-semibold text-red-600">{rand.error}</p>}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-600">
                      {rand.minutes ? formatMinutes(rand.minutes) : '—'}
                    </td>
                    <td className="py-2 text-right font-semibold text-slate-900">
                      {rand.error ? '—' : formatEur(rand.amountEur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previzualizare.invalid > 0 && (
            <p className="mt-4 text-sm text-slate-500">
              Liniile cu probleme sunt sărite; restul se importă. Le poți corecta în fișier și încărca din nou.
            </p>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={inchide}>Anulează</Button>
            <Button
              icon={<Upload className="h-4 w-4" />}
              loading={importa.isPending}
              disabled={previzualizare.valid === 0}
              onClick={async () => {
                if (!fisier) return;
                await importa.mutateAsync(fisier);
                toast(`${previzualizare.valid} intervenții importate`);
                inchide();
              }}
            >
              Importă {previzualizare.valid} intervenții
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
