import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, LifeBuoy, Send } from 'lucide-react';
import { Badge, Button, Card, ErrorBlock, Field, Input, Modal, Textarea, useToast } from '../components/ui';
import { formatDate, formatDateTime } from '../lib/format';
import { trimiteCerere, type PortalMe } from './api';

/** Cererile de intervenție trimise din portal: devin task-uri în CRM */
export function CereriPortal({ me }: { me: PortalMe }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [deschis, setDeschis] = useState(false);
  const [titlu, setTitlu] = useState('');
  const [detalii, setDetalii] = useState('');
  const [error, setError] = useState('');
  const [seTrimite, setSeTrimite] = useState(false);

  async function trimite() {
    setError('');
    setSeTrimite(true);
    try {
      await trimiteCerere({ title: titlu.trim(), details: detalii.trim() });
      await queryClient.invalidateQueries({ queryKey: ['portal'] });
      setDeschis(false);
      setTitlu('');
      setDetalii('');
      toast('Cererea a fost trimisă');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite cererea');
    } finally {
      setSeTrimite(false);
    }
  }

  return (
    <>
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-indigo-500" />
            <p className="text-sm font-bold text-slate-800">Cererile tale</p>
          </div>
          {me.flags.allowRequests && (
            <Button size="sm" icon={<Send className="h-4 w-4" />} onClick={() => setDeschis(true)}>
              Cere o intervenție
            </Button>
          )}
        </div>

        {me.requests.length === 0 ? (
          <p className="text-sm text-slate-500">
            {me.flags.allowRequests
              ? 'Nu ai trimis nicio cerere. Apasă butonul de sus când ai nevoie de ceva.'
              : 'Nu ai cereri trimise.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {me.requests.map((cerere) => (
              <li key={cerere.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">{cerere.title}</span>
                  <Badge
                    className={cerere.done ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}
                  >
                    {cerere.done ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Rezolvată
                      </>
                    ) : (
                      <>
                        <CircleDashed className="h-3.5 w-3.5" /> În lucru
                      </>
                    )}
                  </Badge>
                </div>
                {cerere.details && <p className="mt-1 text-sm text-slate-600">{cerere.details}</p>}
                <p className="mt-1 text-xs text-slate-400">
                  Trimisă {formatDateTime(cerere.createdAt)}
                  {cerere.done && cerere.doneAt && ` · rezolvată pe ${formatDate(cerere.doneAt)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={deschis}
        onClose={() => setDeschis(false)}
        title="Ce ai nevoie?"
        subtitle="Ajunge direct în lista noastră de lucru"
      >
        <div className="flex flex-col gap-4">
          <Field label="Pe scurt *">
            <Input
              autoFocus
              value={titlu}
              onChange={(e) => setTitlu(e.target.value)}
              maxLength={120}
              placeholder="Ex. Nu se trimit emailurile de comandă"
            />
          </Field>
          <Field label="Detalii" hint="Opțional — orice ne ajută să înțelegem mai repede">
            <Textarea
              value={detalii}
              onChange={(e) => setDetalii(e.target.value)}
              maxLength={2000}
              placeholder="De când se întâmplă, ce ai încercat, un exemplu…"
            />
          </Field>
          {error && <ErrorBlock message={error} />}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeschis(false)}>
            Anulează
          </Button>
          <Button onClick={trimite} loading={seTrimite} disabled={titlu.trim().length < 3} icon={<Send className="h-4 w-4" />}>
            Trimite cererea
          </Button>
        </div>
      </Modal>
    </>
  );
}
