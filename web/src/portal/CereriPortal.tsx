import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, Clock4, LifeBuoy, Lock, MessagesSquare, Send, Zap } from 'lucide-react';
import {
  Badge, Button, Card, ErrorBlock, Field, Input, LoadingBlock, Modal, Textarea, useToast,
} from '../components/ui';
import { formatDate, formatDateTime } from '../lib/format';
import { cn } from '../lib/cn';
import { trimiteCerere, trimiteMesaj, usePortalDiscutie, type PortalCerere, type PortalMe } from './api';

/** Cele două feluri de cerere, cu timpul de răspuns promis */
const FELURI = {
  NORMAL: {
    titlu: 'Intervenție normală',
    timp: 'răspuns în 24 de ore de lucru',
    chip: 'bg-slate-100 text-slate-600',
    Icon: Clock4,
  },
  URGENT: {
    titlu: 'Intervenție rapidă',
    timp: 'răspuns în 12 ore de lucru',
    chip: 'bg-amber-100 text-amber-800',
    Icon: Zap,
  },
} as const;

/**
 * Cât text încape într-o cerere sau într-un mesaj. Limita e mare dinadins:
 * clienții trimit uneori liste lungi, iar un text tăiat pe tăcute de browser
 * e mai rău decât un mesaj că e prea lung.
 */
const LIMITA_TEXT = 20000;

/** Discuțiile deschise de noi n-au termen promis — le arătăm ca atare */
const DESCHISA_DE_NOI = {
  titlu: 'Deschisă de noi',
  timp: '',
  chip: 'bg-violet-100 text-violet-700',
  Icon: MessagesSquare,
} as const;

/** Ce etichetă poartă o discuție: felul cererii sau „deschisă de noi” */
function felDiscutie(discutie: { kind: string; openedBy: string }) {
  if (discutie.openedBy === 'ADMIN') return DESCHISA_DE_NOI;
  return FELURI[discutie.kind as keyof typeof FELURI] ?? FELURI.NORMAL;
}

/** Cererile de intervenție trimise din portal, cu discuția pe fiecare */
export function CereriPortal({ me }: { me: PortalMe }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [deschis, setDeschis] = useState(false);
  const [discutie, setDiscutie] = useState<string | null>(null);
  const [titlu, setTitlu] = useState('');
  const [detalii, setDetalii] = useState('');
  const [fel, setFel] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [error, setError] = useState('');
  const [seTrimite, setSeTrimite] = useState(false);

  async function trimite() {
    setError('');
    setSeTrimite(true);
    try {
      const cerere = await trimiteCerere({ title: titlu.trim(), details: detalii.trim(), kind: fel });
      await queryClient.invalidateQueries({ queryKey: ['portal'] });
      setDeschis(false);
      setTitlu('');
      setDetalii('');
      setFel('NORMAL');
      toast(
        cerere.dueAt
          ? `Cerere trimisă. Îți răspundem până pe ${formatDateTime(cerere.dueAt)}`
          : 'Cererea a fost trimisă',
      );
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
            <p className="text-sm font-bold text-slate-800">Cereri și discuții</p>
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
              ? 'Nicio discuție deocamdată. Apasă butonul de sus când ai nevoie de ceva.'
              : 'Nicio discuție deocamdată.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {me.requests.map((cerere) => (
              <li key={cerere.id}>
                <RandCerere cerere={cerere} onDeschide={() => setDiscutie(cerere.id)} />
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
          <Field label="Cât de repede ai nevoie?">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(['NORMAL', 'URGENT'] as const).map((valoare) => {
                const { titlu: numeFel, timp, Icon } = FELURI[valoare];
                const ales = fel === valoare;
                return (
                  <button
                    key={valoare}
                    type="button"
                    onClick={() => setFel(valoare)}
                    className={cn(
                      'flex items-start gap-3 rounded-2xl border p-3 text-left transition',
                      ales
                        ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200'
                        : 'border-slate-200 hover:border-slate-300',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                        ales ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-slate-800">{numeFel}</span>
                      <span className="block text-xs text-slate-500">{timp}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          <p className="rounded-2xl bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
            Orele de lucru sunt zilele lucrătoare, în programul nostru — weekendul și serile nu intră la socoteală.
          </p>

          <Field label="Pe scurt *">
            <Input
              autoFocus
              value={titlu}
              onChange={(e) => setTitlu(e.target.value)}
              maxLength={120}
              placeholder="Ex. Nu se trimit emailurile de comandă"
            />
          </Field>
          <Field
            label="Detalii"
            hint={
              detalii.length > LIMITA_TEXT - 1000
                ? `Au mai rămas ${LIMITA_TEXT - detalii.length} caractere`
                : 'Opțional — orice ne ajută să înțelegem mai repede'
            }
          >
            <Textarea
              value={detalii}
              onChange={(e) => setDetalii(e.target.value)}
              maxLength={LIMITA_TEXT}
              placeholder="De când se întâmplă, ce ai încercat, un exemplu…"
              className="min-h-[140px]"
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

      {discutie && <Discutie cerereId={discutie} onClose={() => setDiscutie(null)} />}
    </>
  );
}

function RandCerere({ cerere, onDeschide }: { cerere: PortalCerere; onDeschide: () => void }) {
  const fel = felDiscutie(cerere);

  return (
    <button
      onClick={onDeschide}
      className="w-full rounded-2xl border border-slate-200 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-slate-800">{cerere.title}</span>
        <span className="flex items-center gap-1.5">
          {cerere.unread > 0 && (
            <Badge className="bg-indigo-600 text-white">{cerere.unread} nou</Badge>
          )}
          <Badge className={cerere.done ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}>
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
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge className={fel.chip}>
          <fel.Icon className="h-3.5 w-3.5" /> {fel.titlu}
        </Badge>
        {cerere.dueAt && !cerere.done && (
          <span className="text-xs text-slate-500">răspuns până pe {formatDateTime(cerere.dueAt)}</span>
        )}
        {cerere.messages > 0 && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <MessagesSquare className="h-3.5 w-3.5" /> {cerere.messages}
          </span>
        )}
        {cerere.chatClosed && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Lock className="h-3.5 w-3.5" /> discuție închisă
          </span>
        )}
      </div>

      {cerere.details && <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{cerere.details}</p>}
      <p className="mt-1 text-xs text-slate-400">
        {cerere.openedBy === 'ADMIN' ? 'Deschisă' : 'Trimisă'} {formatDateTime(cerere.createdAt)}
        {cerere.done && cerere.doneAt && ` · rezolvată pe ${formatDate(cerere.doneAt)}`}
      </p>
    </button>
  );
}

/** Discuția pe marginea unei cereri */
function Discutie({ cerereId, onClose }: { cerereId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = usePortalDiscutie(cerereId);
  const [mesaj, setMesaj] = useState('');
  const [nume, setNume] = useState('');
  const [error, setError] = useState('');
  const [seTrimite, setSeTrimite] = useState(false);

  async function trimite() {
    setError('');
    setSeTrimite(true);
    try {
      await trimiteMesaj(cerereId, { body: mesaj.trim(), authorName: nume.trim() });
      setMesaj('');
      await queryClient.invalidateQueries({ queryKey: ['portal'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite mesajul');
    } finally {
      setSeTrimite(false);
    }
  }

  const fel = data ? felDiscutie(data) : FELURI.NORMAL;

  /*
   * Textul cu care s-a deschis discuția intră ca primul mesaj, de la cine a
   * deschis-o, ca să se citească tot ca o conversație.
   */
  const toateMesajele = data
    ? [
        ...(data.details.trim()
          ? [
              {
                id: 'cerere',
                author: data.openedBy,
                authorName: '',
                body: data.details,
                createdAt: data.createdAt,
              },
            ]
          : []),
        ...data.messages,
      ]
    : [];

  return (
    <Modal open onClose={onClose} size="lg" title={data?.title ?? 'Discuție'} subtitle="Discuția pe marginea acestei cereri">
      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={fel.chip}>
              <fel.Icon className="h-3.5 w-3.5" /> {fel.titlu}
            </Badge>
            {data.dueAt && !data.done && (
              <span className="text-xs text-slate-500">răspuns până pe {formatDateTime(data.dueAt)}</span>
            )}
          </div>

          <ul className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-1">
            {toateMesajele.map((m) => (
              <li
                key={m.id}
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
                  m.author === 'CLIENT'
                    ? 'ml-auto bg-indigo-600 text-white'
                    : 'mr-auto bg-slate-100 text-slate-700',
                )}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                <p className={cn('mt-1 text-[11px]', m.author === 'CLIENT' ? 'text-indigo-200' : 'text-slate-400')}>
                  {m.author === 'CLIENT' ? m.authorName || 'Tu' : 'Andaxi'} · {formatDateTime(m.createdAt)}
                </p>
              </li>
            ))}
          </ul>

          {data.chatClosed ? (
            <p className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              <Lock className="h-4 w-4" /> Discuția a fost închisă. Dacă mai ai nevoie de ceva, trimite o cerere nouă.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Textarea
                value={mesaj}
                onChange={(e) => setMesaj(e.target.value)}
                placeholder="Scrie un mesaj…"
                maxLength={LIMITA_TEXT}
                className="min-h-[80px]"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={nume}
                  onChange={(e) => setNume(e.target.value)}
                  placeholder="Numele tău (opțional)"
                  className="max-w-[14rem]"
                />
                <Button
                  onClick={trimite}
                  loading={seTrimite}
                  disabled={mesaj.trim().length === 0}
                  icon={<Send className="h-4 w-4" />}
                >
                  Trimite
                </Button>
              </div>
              {error && <ErrorBlock message={error} />}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
