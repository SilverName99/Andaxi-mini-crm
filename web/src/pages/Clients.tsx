import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Globe, Mail, MapPin, Phone, Pencil, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useClients, useCrudMutation } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal,
  Segmented, Select, Textarea, useToast,
} from '../components/ui';
import { ACCENT, ACCENT_COLORS, formatEur } from '../lib/format';
import { CLIENT_STATUS, CYCLE, options } from '../lib/labels';
import { cn } from '../lib/cn';
import type { AccentColor, Client, ClientStatus } from '../lib/types';

const EMPTY: Partial<Client> = {
  name: '', company: '', cui: '', regCom: '', email: '', phone: '', contact: '', website: '',
  address: '', city: '', county: '', country: 'Romania', status: 'ACTIVE', color: 'violet', notes: '',
};

export function ClientForm({
  open, onClose, client,
}: {
  open: boolean;
  onClose: () => void;
  client?: Client | null;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Client>>(client ?? EMPTY);
  const [error, setError] = useState('');

  const mutation = useCrudMutation(async (data: Partial<Client>) =>
    client ? api.put(`/clients/${client.id}`, data) : api.post('/clients', data),
  );

  const set = (key: keyof Client, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    setError('');
    if (!form.name?.trim()) {
      setError('Numele clientului este obligatoriu');
      return;
    }
    try {
      await mutation.mutateAsync(form);
      toast(client ? 'Client actualizat' : 'Client adăugat');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la salvare');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={client ? 'Editează clientul' : 'Client nou'}
      subtitle="Datele de identificare și contact"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nume client *" className="sm:col-span-1">
          <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Mihai Popescu" />
        </Field>
        <Field label="Firmă">
          <Input value={form.company ?? ''} onChange={(e) => set('company', e.target.value)} placeholder="Terra Construct SRL" />
        </Field>
        <Field label="CUI">
          <Input value={form.cui ?? ''} onChange={(e) => set('cui', e.target.value)} placeholder="RO12345678" />
        </Field>
        <Field label="Reg. comerțului">
          <Input value={form.regCom ?? ''} onChange={(e) => set('regCom', e.target.value)} placeholder="J12/345/2020" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="contact@firma.ro" />
        </Field>
        <Field label="Telefon">
          <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="0740 000 000" />
        </Field>
        <Field label="Persoană de contact">
          <Input value={form.contact ?? ''} onChange={(e) => set('contact', e.target.value)} />
        </Field>
        <Field label="Website">
          <Input value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} placeholder="firma.ro" />
        </Field>
        <Field label="Adresă" className="sm:col-span-2">
          <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Oraș">
          <Input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Județ">
          <Input value={form.county ?? ''} onChange={(e) => set('county', e.target.value)} />
        </Field>
        <Field label="Status">
          <Select
            value={form.status ?? 'ACTIVE'}
            onChange={(e) => set('status', e.target.value)}
            options={options(CLIENT_STATUS)}
          />
        </Field>
        <Field label="Culoare">
          <div className="flex flex-wrap gap-2 pt-1">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => set('color', color)}
                aria-label={color}
                className={cn(
                  'h-8 w-8 rounded-xl bg-gradient-to-br transition',
                  ACCENT[color].gradient,
                  form.color === color ? 'ring-4 ring-offset-1 ' + ACCENT[color].ring : 'opacity-70 hover:opacity-100',
                )}
              />
            ))}
          </div>
        </Field>
        <Field label="Notițe" className="sm:col-span-2">
          <Textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Detalii utile despre client…" />
        </Field>
      </div>

      {error && <div className="mt-4"><ErrorBlock message={error} /></div>}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Anulează</Button>
        <Button onClick={submit} loading={mutation.isPending}>{client ? 'Salvează' : 'Adaugă client'}</Button>
      </div>
    </Modal>
  );
}

export function Clients() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | 'ALL'>('ALL');
  const [editing, setEditing] = useState<Client | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const toast = useToast();

  const { data: clients = [], isLoading, error } = useClients();
  const remove = useCrudMutation((id: string) => api.del(`/clients/${id}`));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients.filter((client) => {
      const matchesStatus = status === 'ALL' || client.status === status;
      const matchesTerm =
        !term ||
        [client.name, client.company, client.email, client.cui, client.city]
          .join(' ')
          .toLowerCase()
          .includes(term);
      return matchesStatus && matchesTerm;
    });
  }, [clients, search, status]);

  function monthlyValue(client: Client): number {
    return (client.subscriptions ?? []).reduce(
      (sum, sub) => sum + sub.amountEur / (CYCLE[sub.cycle]?.months ?? 1),
      0,
    );
  }

  return (
    <div className="animate-fade-up">
      <PageHeader title="Clienți" subtitle={`${clients.length} clienți înregistrați`}>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>
          Client nou
        </Button>
      </PageHeader>

      <Card className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută după nume, firmă, CUI…"
            className="pl-10"
          />
        </div>
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: 'Toți', count: clients.length },
            { value: 'ACTIVE', label: 'Activi', count: clients.filter((c) => c.status === 'ACTIVE').length },
            { value: 'PROSPECT', label: 'Prospecți', count: clients.filter((c) => c.status === 'PROSPECT').length },
            { value: 'INACTIVE', label: 'Inactivi', count: clients.filter((c) => c.status === 'INACTIVE').length },
          ]}
        />
      </Card>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error instanceof Error ? error.message : 'Eroare la încărcare'} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="h-6 w-6" />}
          title={clients.length ? 'Niciun rezultat' : 'Niciun client încă'}
          message={clients.length ? 'Încearcă alt termen de căutare sau alt filtru.' : 'Adaugă primul client ca să începi să urmărești abonamentele și orele.'}
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Client nou</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((client) => (
            <Card key={client.id} className="group flex flex-col justify-between transition hover:-translate-y-0.5 hover:shadow-soft">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/clienti/${client.id}`} className="flex min-w-0 items-center gap-3">
                    <Avatar name={client.company || client.name} color={client.color as AccentColor} />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-stone-900 group-hover:text-orange-700">
                        {client.company || client.name}
                      </p>
                      {client.company && <p className="truncate text-xs text-stone-500">{client.name}</p>}
                    </div>
                  </Link>
                  <Badge className={CLIENT_STATUS[client.status].chip}>{CLIENT_STATUS[client.status].text}</Badge>
                </div>

                <div className="mt-4 flex flex-col gap-1.5 text-xs text-stone-500">
                  {client.email && (
                    <span className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 shrink-0" /> {client.email}</span>
                  )}
                  {client.phone && (
                    <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0" /> {client.phone}</span>
                  )}
                  {client.city && (
                    <span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0" /> {client.city}</span>
                  )}
                  {client.website && (
                    <span className="flex items-center gap-2 truncate"><Globe className="h-3.5 w-3.5 shrink-0" /> {client.website}</span>
                  )}
                  {client.cui && (
                    <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 shrink-0" /> {client.cui}</span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
                <div>
                  <p className="text-xs text-stone-400">Recurent lunar</p>
                  <p className="text-sm font-extrabold text-stone-900">{formatEur(monthlyValue(client))}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(client)}
                    className="rounded-xl p-2 text-stone-400 transition hover:bg-orange-50 hover:text-orange-600"
                    aria-label="Editează"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleting(client)}
                    className="rounded-xl p-2 text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Șterge"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing !== undefined && (
        <ClientForm open onClose={() => setEditing(undefined)} client={editing} />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Ștergi clientul?"
        message={`Se șterg definitiv și abonamentele, orele și pozițiile de facturat ale clientului „${deleting?.company || deleting?.name}".`}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast('Client șters');
          setDeleting(null);
        }}
      />
    </div>
  );
}
