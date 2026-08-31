import { useState } from 'react';
import { Check, Copy, KeyRound, Link2, RefreshCw, ShieldOff, Share2 } from 'lucide-react';
import { api } from '../lib/api';
import { useClientPortal, useCrudMutation, useSettings } from '../lib/queries';
import { Badge, Button, Card, CardTitle, ConfirmDialog, ErrorBlock, Toggle, useToast } from './ui';
import { formatDateTime } from '../lib/format';
import type { ClientPortal } from '../lib/types';

/**
 * Linkul complet pe care il trimiti clientului. Tokenul sta dupa #, ca sa nu
 * ajunga in logurile serverului. Daca ai un domeniu separat pentru portal
 * (Setari -> Adresa portalului), linkul pleaca de acolo.
 */
function linkPortal(token: string, baza: string): string {
  const radacina = (baza || window.location.origin).replace(/\/+$/, '');
  return `${radacina}/portal#${token}`;
}

/**
 * Portalul clientului: un link secret (optional cu PIN) prin care clientul isi
 * vede orele, abonamentele si ce are de platit. Totul e doar de citit.
 */
export function PortalClient({ clientId, clientName }: { clientId: string; clientName: string }) {
  const toast = useToast();
  const { data: portal, isLoading } = useClientPortal(clientId);
  const { data: settings } = useSettings();
  const [error, setError] = useState('');
  const [copiat, setCopiat] = useState<'link' | 'pin' | null>(null);
  const [confirmRegenerare, setConfirmRegenerare] = useState(false);
  const [confirmOprire, setConfirmOprire] = useState(false);

  const porneste = useCrudMutation((body: { withPin: boolean }) =>
    api.post<ClientPortal>(`/clients/${clientId}/portal`, body),
  );
  const actualizeaza = useCrudMutation((body: Partial<ClientPortal>) =>
    api.put<ClientPortal>(`/clients/${clientId}/portal`, body),
  );
  const pinNouMutatie = useCrudMutation(() => api.post<ClientPortal>(`/clients/${clientId}/portal/pin`, {}));
  const stergePin = useCrudMutation(() => api.del(`/clients/${clientId}/portal/pin`));
  const opreste = useCrudMutation(() => api.del(`/clients/${clientId}/portal`));

  async function copiaza(text: string, ce: 'link' | 'pin') {
    try {
      await navigator.clipboard.writeText(text);
      setCopiat(ce);
      setTimeout(() => setCopiat(null), 2000);
    } catch {
      setError('Nu am putut copia — selectează textul manual.');
    }
  }

  async function ruleaza(actiune: () => Promise<unknown>, mesaj: string) {
    setError('');
    try {
      await actiune();
      toast(mesaj);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la salvare');
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardTitle
        title="Portalul clientului"
        subtitle="Un link prin care clientul își vede orele și ce are de plătit — doar de citit"
        icon={<Share2 className="h-5 w-5" />}
        action={
          portal && (
            <Badge className={portal.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}>
              {portal.enabled ? 'Activ' : 'Oprit'}
            </Badge>
          )
        }
      />

      {isLoading ? (
        <p className="text-sm text-slate-400">Se încarcă…</p>
      ) : !portal ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            {clientName} nu are încă acces. Generează un link pe care i-l trimiți pe email sau WhatsApp; îl poți
            opri sau schimba oricând.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={<Link2 className="h-4 w-4" />}
              loading={porneste.isPending}
              onClick={() => ruleaza(() => porneste.mutateAsync({ withPin: true }), 'Portal pornit')}
            >
              Generează link + PIN
            </Button>
            <Button
              variant="secondary"
              onClick={() => ruleaza(() => porneste.mutateAsync({ withPin: false }), 'Portal pornit')}
            >
              Doar link, fără PIN
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="label-base">Link pentru client</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-2xl bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
                {linkPortal(portal.token, settings?.portalBaseUrl ?? '')}
              </code>
              <Button
                variant="secondary"
                icon={copiat === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                onClick={() => copiaza(linkPortal(portal.token, settings?.portalBaseUrl ?? ''), 'link')}
              >
                {copiat === 'link' ? 'Copiat' : 'Copiază'}
              </Button>
            </div>
          </div>

          {portal.pin ? (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                PIN-ul clientului
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <span className="text-2xl font-extrabold tracking-[0.3em] text-indigo-700">{portal.pin}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={copiat === 'pin' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  onClick={() => copiaza(portal.pin!, 'pin')}
                >
                  {copiat === 'pin' ? 'Copiat' : 'Copiază'}
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Trimite-l separat de link (telefon, SMS) — altfel PIN-ul nu mai protejează nimic.
              </p>
            </div>
          ) : (
            portal.hasPin && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">PIN activ</p>
                <p className="mt-1 text-sm text-slate-600">
                  A fost generat înainte ca PIN-urile să fie păstrate, așa că nu ți-l mai pot arăta.
                  Generează altul mai jos și de atunci încolo îl vezi oricând aici.
                </p>
              </div>
            )
          )}

          <div className="flex flex-col gap-3">
            <Toggle
              checked={portal.enabled}
              onChange={(value) =>
                ruleaza(() => actualizeaza.mutateAsync({ enabled: value }), value ? 'Portal activat' : 'Portal oprit')
              }
              label="Acces activ"
              hint="Oprit, linkul nu mai deschide nimic, dar rămâne valabil când îl repornești"
            />
            <Toggle
              checked={portal.showMoney}
              onChange={(value) =>
                ruleaza(
                  () => actualizeaza.mutateAsync({ showMoney: value }),
                  value ? 'Clientul vede sumele' : 'Clientul vede doar orele',
                )
              }
              label="Arată sumele"
              hint="Dezactivat, clientul vede doar orele lucrate și cele incluse, fără valori în euro"
            />
            <Toggle
              checked={portal.allowRequests}
              onChange={(value) =>
                ruleaza(
                  () => actualizeaza.mutateAsync({ allowRequests: value }),
                  value ? 'Clientul poate trimite cereri' : 'Cererile din portal sunt oprite',
                )
              }
              label="Permite cereri de intervenție"
              hint="Cererile trimise de client apar în Task-uri, marcate „din portal”"
            />
            {portal.showMoney && (
              <Toggle
                checked={portal.showVat}
                onChange={(value) => ruleaza(() => actualizeaza.mutateAsync({ showVat: value }), 'Setare salvată')}
                label="Arată și TVA-ul"
                hint="Sumele rămân fără TVA; se adaugă doar un rând cu TVA-ul și totalul"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <Button
              size="sm"
              variant="secondary"
              icon={<KeyRound className="h-4 w-4" />}
              loading={pinNouMutatie.isPending}
              onClick={() => ruleaza(() => pinNouMutatie.mutateAsync(undefined), 'PIN nou generat')}
            >
              {portal.hasPin ? 'Generează alt PIN' : 'Adaugă PIN'}
            </Button>
            {portal.hasPin && (
              <Button
                size="sm"
                variant="ghost"
                loading={stergePin.isPending}
                onClick={() => ruleaza(() => stergePin.mutateAsync(undefined), 'PIN eliminat')}
              >
                Scoate PIN-ul
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => setConfirmRegenerare(true)}
            >
              Link nou
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<ShieldOff className="h-4 w-4" />}
              className="text-red-600 hover:bg-red-50"
              onClick={() => setConfirmOprire(true)}
            >
              Retrage accesul
            </Button>
          </div>

          <p className="text-xs text-slate-400">
            {portal.hasPin ? 'Protejat cu PIN. ' : 'Fără PIN — cine are linkul, intră. '}
            {portal.lastSeenAt ? `Ultima vizită: ${formatDateTime(portal.lastSeenAt)}.` : 'Clientul nu a intrat încă.'}
          </p>
        </div>
      )}

      {error && <div className="mt-4"><ErrorBlock message={error} /></div>}

      <ConfirmDialog
        open={confirmRegenerare}
        title="Generezi un link nou?"
        message="Linkul de acum se invalidează imediat, deci clientul va avea nevoie de cel nou."
        confirmLabel="Generează"
        onCancel={() => setConfirmRegenerare(false)}
        onConfirm={async () => {
          setConfirmRegenerare(false);
          await ruleaza(() => porneste.mutateAsync({ withPin: portal?.hasPin ?? false }), 'Link nou generat');
        }}
      />
      <ConfirmDialog
        open={confirmOprire}
        title="Retragi accesul?"
        message="Linkul dispare definitiv. Poți genera oricând altul, dar va fi un link nou."
        confirmLabel="Retrage"
        onCancel={() => setConfirmOprire(false)}
        onConfirm={async () => {
          setConfirmOprire(false);
          await ruleaza(() => opreste.mutateAsync(undefined), 'Acces retras');
        }}
      />
    </Card>
  );
}
