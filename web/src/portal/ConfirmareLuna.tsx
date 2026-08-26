import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, CheckCheck } from 'lucide-react';
import { Button, Card, ErrorBlock, Field, Input, Modal, Textarea, useToast } from '../components/ui';
import { formatDateTime, formatEur, formatMinutes } from '../lib/format';
import { numeLuna } from '../lib/calendar';
import { confirmaLuna, retrageConfirmarea, type PortalApproval } from './api';

/**
 * "Am văzut orele lunii și sunt de acord." Confirmarea ajunge in CRM cu data,
 * ora si cifrele de la acel moment, ca sa se vada daca luna s-a mai schimbat.
 */
export function ConfirmareLuna({
  luna,
  confirmare,
  areOre,
  lunaInCurs,
}: {
  luna: string;
  confirmare: PortalApproval | null;
  areOre: boolean;
  lunaInCurs: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [deschis, setDeschis] = useState(false);
  const [nume, setNume] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [seTrimite, setSeTrimite] = useState(false);

  if (!areOre) return null;

  const reincarca = () => queryClient.invalidateQueries({ queryKey: ['portal'] });

  async function confirma() {
    setError('');
    setSeTrimite(true);
    try {
      await confirmaLuna(luna, { confirmedBy: nume.trim(), note: nota.trim() });
      await reincarca();
      setDeschis(false);
      setNota('');
      toast('Mulțumim! Confirmarea a fost trimisă');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite confirmarea');
    } finally {
      setSeTrimite(false);
    }
  }

  async function retrage() {
    setSeTrimite(true);
    try {
      await retrageConfirmarea(luna);
      await reincarca();
      toast('Confirmarea a fost retrasă');
    } finally {
      setSeTrimite(false);
    }
  }

  if (confirmare) {
    return (
      <Card
        className={
          confirmare.changedSince
            ? 'border-amber-300 bg-amber-50/70'
            : 'border-emerald-200 bg-emerald-50/70'
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
                confirmare.changedSince ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {confirmare.changedSince ? <AlertTriangle className="h-5 w-5" /> : <BadgeCheck className="h-5 w-5" />}
            </span>
            <div>
              <p className="font-bold text-slate-800">
                {confirmare.changedSince ? 'Luna s-a modificat după confirmare' : 'Ai confirmat luna'}
              </p>
              <p className="text-sm text-slate-600">
                {formatDateTime(confirmare.confirmedAt)}
                {confirmare.confirmedBy && ` · ${confirmare.confirmedBy}`} · la acel moment:{' '}
                {formatMinutes(confirmare.minutes)}
                {confirmare.billableEur > 0 && ` · ${formatEur(confirmare.billableEur)}`}
              </p>
              {confirmare.note && <p className="mt-1 text-sm italic text-slate-500">„{confirmare.note}"</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" loading={seTrimite} onClick={retrage}>
            Retrage confirmarea
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-slate-800">Confirmi orele din {numeLuna(luna)}?</p>
          <p className="text-sm text-slate-500">
            {lunaInCurs
              ? 'Luna e încă în curs — poți confirma și acum, dar cifrele se mai pot schimba.'
              : 'O apăsare ne spune că ai văzut lista și ești de acord cu ea, înainte de factură.'}
          </p>
        </div>
        <Button icon={<CheckCheck className="h-4 w-4" />} onClick={() => setDeschis(true)}>
          Confirm orele
        </Button>
      </Card>

      <Modal
        open={deschis}
        onClose={() => setDeschis(false)}
        title={`Confirmi ${numeLuna(luna)}?`}
        subtitle="Confirmarea se vede imediat la noi, cu data și ora"
      >
        <div className="flex flex-col gap-4">
          <Field label="Numele tău" hint="Opțional — ca să știm cine a confirmat">
            <Input value={nume} onChange={(e) => setNume(e.target.value)} placeholder="Ana Ionescu" />
          </Field>
          <Field label="Observații" hint="Opțional">
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex. totul e în regulă" />
          </Field>
          {error && <ErrorBlock message={error} />}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeschis(false)}>
            Anulează
          </Button>
          <Button onClick={confirma} loading={seTrimite} icon={<CheckCheck className="h-4 w-4" />}>
            Confirm orele
          </Button>
        </div>
      </Modal>
    </>
  );
}
