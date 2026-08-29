import { useState } from 'react';
import { Lock, LockOpen, Send, Zap, Clock4 } from 'lucide-react';
import { api } from '../lib/api';
import { useCrudMutation, useTaskThread } from '../lib/queries';
import { Badge, Button, ErrorBlock, LoadingBlock, Modal, Textarea, useToast } from './ui';
import { formatDateTime } from '../lib/format';
import { cn } from '../lib/cn';

const FELURI: Record<string, { titlu: string; ore: string; chip: string }> = {
  NORMAL: { titlu: 'Intervenție normală', ore: '24 de ore de lucru', chip: 'bg-slate-100 text-slate-600' },
  URGENT: { titlu: 'Intervenție rapidă', ore: '12 ore de lucru', chip: 'bg-amber-100 text-amber-800' },
};

/**
 * Discutia cu clientul pe marginea unei cereri din portal. O poti inchide cand
 * s-a rezolvat — clientul nu mai poate scrie pe ea, dar o vede in continuare.
 */
export function DiscutieCerere({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const toast = useToast();
  const { data, isLoading } = useTaskThread(taskId);
  const [mesaj, setMesaj] = useState('');
  const [error, setError] = useState('');

  const trimite = useCrudMutation((body: string) => api.post(`/tasks/${taskId}/messages`, { body }));
  const schimbaStarea = useCrudMutation((chatClosed: boolean) => api.put(`/tasks/${taskId}`, { chatClosed }));

  async function trimiteMesaj() {
    setError('');
    try {
      await trimite.mutateAsync(mesaj.trim());
      setMesaj('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite mesajul');
    }
  }

  const fel = data?.kind ? FELURI[data.kind] : null;
  const intarziat = data?.dueAt ? new Date(data.dueAt) < new Date() && !data.done : false;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={data?.title ?? 'Cerere din portal'}
      subtitle={data?.client ? data.client.company || data.client.name : undefined}
    >
      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {fel && (
                <Badge className={fel.chip}>
                  {data.kind === 'URGENT' ? <Zap className="h-3.5 w-3.5" /> : <Clock4 className="h-3.5 w-3.5" />}
                  {fel.titlu} · {fel.ore}
                </Badge>
              )}
              {data.dueAt && (
                <Badge className={intarziat ? 'bg-red-100 text-red-700' : 'bg-indigo-50 text-indigo-700'}>
                  {intarziat ? 'termen depășit' : 'termen'}: {formatDateTime(data.dueAt)}
                </Badge>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{data.details || '—'}</p>
            <p className="mt-1 text-xs text-slate-400">Trimisă {formatDateTime(data.createdAt)}</p>
          </div>

          {data.messages.length > 0 && (
            <ul className="flex max-h-[22rem] flex-col gap-2 overflow-y-auto pr-1">
              {data.messages.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
                    m.author === 'ADMIN'
                      ? 'ml-auto bg-indigo-600 text-white'
                      : 'mr-auto bg-slate-100 text-slate-700',
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={cn('mt-1 text-[11px]', m.author === 'ADMIN' ? 'text-indigo-200' : 'text-slate-400')}>
                    {m.author === 'ADMIN' ? 'Tu' : m.authorName || 'Clientul'} · {formatDateTime(m.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {data.chatClosed ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Lock className="h-4 w-4" /> Discuția e închisă — clientul nu mai poate scrie.
              </p>
              <Button
                size="sm"
                variant="secondary"
                icon={<LockOpen className="h-4 w-4" />}
                loading={schimbaStarea.isPending}
                onClick={async () => {
                  await schimbaStarea.mutateAsync(false);
                  toast('Discuție redeschisă');
                }}
              >
                Redeschide
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Textarea
                value={mesaj}
                onChange={(e) => setMesaj(e.target.value)}
                placeholder="Răspunde clientului…"
                className="min-h-[80px]"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Lock className="h-4 w-4" />}
                  loading={schimbaStarea.isPending}
                  onClick={async () => {
                    await schimbaStarea.mutateAsync(true);
                    toast('Discuție închisă');
                  }}
                >
                  Închide discuția
                </Button>
                <Button
                  onClick={trimiteMesaj}
                  loading={trimite.isPending}
                  disabled={mesaj.trim().length === 0}
                  icon={<Send className="h-4 w-4" />}
                >
                  Trimite
                </Button>
              </div>
              {error && <ErrorBlock message={error} />}
              <p className="text-xs text-slate-400">
                {data.client ? 'Clientul primește răspunsul pe email și în portal.' : 'Răspunsul apare în portal.'}
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
