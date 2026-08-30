import { useRef, useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Paperclip, Trash2 } from 'lucide-react';
import { api, uploadFile } from '../lib/api';
import { useCrudMutation } from '../lib/queries';
import { Button, ConfirmDialog, ErrorBlock, useToast } from './ui';
import { formatDate, formatFileSize } from '../lib/format';
import type { SubscriptionDocument } from '../lib/types';

/**
 * Actele abonamentului: contractul semnat, acte aditionale, orice tii la dosar.
 * Fisierele stau langa restul incarcarilor, in afara codului, ca sa nu dispara
 * la actualizari.
 */
export function ContractAbonament({ subscriptionId }: { subscriptionId: string }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [deSters, setDeSters] = useState<SubscriptionDocument | null>(null);

  const { data: documente = [], refetch, isLoading } = useQuery({
    queryKey: ['subscription-documents', subscriptionId],
    queryFn: () => api.get<SubscriptionDocument[]>(`/subscriptions/${subscriptionId}/documents`),
  });

  const incarca = useCrudMutation((file: File) =>
    uploadFile<SubscriptionDocument>(`/subscriptions/${subscriptionId}/documents`, file),
  );
  const sterge = useCrudMutation((id: string) => api.del(`/subscriptions/documents/${id}`));

  async function laAlegereFisier(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError('');
    try {
      await incarca.mutateAsync(file);
      await refetch();
      toast('Document încărcat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca fișierul');
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <FileText className="h-3.5 w-3.5" /> Contract și acte
        </p>
        <input
          ref={input}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,image/*"
          className="hidden"
          onChange={laAlegereFisier}
        />
        <Button
          size="sm"
          variant="secondary"
          icon={<Paperclip className="h-4 w-4" />}
          loading={incarca.isPending}
          onClick={() => input.current?.click()}
        >
          Încarcă
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Se încarcă…</p>
      ) : documente.length === 0 ? (
        <p className="text-sm text-slate-500">
          Niciun act atașat. Scanează contractul și ține-l aici, lângă abonament.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documente.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
            >
              <a
                href={`/api/subscriptions/documents/${doc.id}`}
                className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-indigo-700"
              >
                <Download className="h-4 w-4 shrink-0 text-indigo-500" />
                <span className="truncate">{doc.fileName}</span>
              </a>
              <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                {formatFileSize(doc.size)} · {formatDate(doc.createdAt.slice(0, 10))}
                <button
                  onClick={() => setDeSters(doc)}
                  className="rounded-lg p-1.5 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Șterge documentul"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-slate-400">PDF, Word, Excel, text sau imagini, maximum 10 MB.</p>
      {error && <div className="mt-3"><ErrorBlock message={error} /></div>}

      <ConfirmDialog
        open={Boolean(deSters)}
        title="Ștergi documentul?"
        message={`„${deSters?.fileName}" dispare definitiv de pe server.`}
        loading={sterge.isPending}
        onCancel={() => setDeSters(null)}
        onConfirm={async () => {
          if (!deSters) return;
          await sterge.mutateAsync(deSters.id);
          setDeSters(null);
          await refetch();
          toast('Document șters');
        }}
      />
    </div>
  );
}
