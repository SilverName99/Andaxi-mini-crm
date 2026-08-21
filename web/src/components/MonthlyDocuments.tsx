import { useRef, useState, type ChangeEvent } from 'react';
import { Download, FileText, Paperclip, Trash2 } from 'lucide-react';
import { api, uploadFile } from '../lib/api';
import { useCrudMutation, useMonthlyDocuments } from '../lib/queries';
import { Button, ErrorBlock, useToast } from './ui';
import { formatFileSize } from '../lib/format';
import type { MonthlyDocument } from '../lib/types';

const TIPURI_ACCEPTATE = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp';

/**
 * Documentele unei luni de lucru: raportul cu toate modificarile, trimis
 * clientului odata cu factura. Sunt legate de luna, nu de o interventie anume.
 */
export function MonthlyDocuments({
  clientId,
  month,
  documents,
}: {
  clientId: string;
  month: string;
  /** Daca lista e deja incarcata de parinte (fisa lunara), o folosim pe aceea */
  documents?: MonthlyDocument[];
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const { data: aduse = [] } = useMonthlyDocuments(documents ? '' : clientId, month);
  const lista = documents ?? aduse;

  const incarca = useCrudMutation((file: File) =>
    uploadFile<MonthlyDocument>(`/monthly-documents?clientId=${clientId}&month=${month}`, file),
  );
  const sterge = useCrudMutation((id: string) => api.del(`/monthly-documents/${id}`));

  async function laAlegereFisier(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      await incarca.mutateAsync(file);
      toast('Document atașat lunii');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca fișierul');
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Documentele lunii{lista.length > 0 ? ` (${lista.length})` : ''}
        </p>
        <input ref={input} type="file" accept={TIPURI_ACCEPTATE} className="hidden" onChange={laAlegereFisier} />
        <Button
          size="sm"
          variant="secondary"
          icon={<Paperclip className="h-3.5 w-3.5" />}
          loading={incarca.isPending}
          onClick={() => input.current?.click()}
        >
          Adaugă document
        </Button>
      </div>

      {lista.length === 0 ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-slate-200 py-6 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40"
        >
          <Paperclip className="h-5 w-5 text-slate-300" />
          <span className="text-sm text-slate-400">Atașează raportul lunii (PDF, Word…)</span>
        </button>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((document) => (
            <li key={document.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{document.fileName}</p>
                <p className="text-xs text-slate-400">{formatFileSize(document.size)}</p>
              </div>
              <a
                href={`/api/monthly-documents/${document.id}`}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                title="Descarcă"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                onClick={async () => {
                  await sterge.mutateAsync(document.id);
                  toast('Document șters');
                }}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                title="Șterge documentul"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <div className="mt-3"><ErrorBlock message={error} /></div>}
    </div>
  );
}
