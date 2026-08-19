import { useMemo, useState } from 'react';
import { CalendarDays, Check, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useClients, useCrudMutation, useTasks } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, Segmented,
  Select, Textarea, useToast,
} from '../components/ui';
import { formatDate, todayIso } from '../lib/format';
import { PRIORITY, options } from '../lib/labels';
import { cn } from '../lib/cn';
import type { Task } from '../lib/types';

function TaskForm({ open, onClose, task }: { open: boolean; onClose: () => void; task?: Task | null }) {
  const toast = useToast();
  const { data: clients = [] } = useClients();
  const [form, setForm] = useState<Partial<Task>>(
    task ?? { title: '', details: '', dueDate: todayIso(), priority: 'MEDIUM', clientId: null, done: false },
  );
  const [error, setError] = useState('');
  const mutation = useCrudMutation((data: Partial<Task>) =>
    task ? api.put(`/tasks/${task.id}`, data) : api.post('/tasks', data),
  );

  const set = (key: keyof Task, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal open={open} onClose={onClose} title={task ? 'Editează task-ul' : 'Task nou'}>
      <div className="flex flex-col gap-4">
        <Field label="Titlu *">
          <Input value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="De trimis oferta pentru…" />
        </Field>
        <Field label="Detalii">
          <Textarea value={form.details ?? ''} onChange={(e) => set('details', e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Client">
            <Select
              value={form.clientId ?? ''}
              onChange={(e) => set('clientId', e.target.value || null)}
              options={[{ value: '', label: '— fără client —' }, ...clients.map((c) => ({ value: c.id, label: c.company || c.name }))]}
            />
          </Field>
          <Field label="Termen">
            <Input type="date" value={form.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} />
          </Field>
        </div>
        <Field label="Prioritate">
          <Select value={form.priority ?? 'MEDIUM'} onChange={(e) => set('priority', e.target.value)} options={options(PRIORITY)} />
        </Field>
      </div>

      {error && <div className="mt-4"><ErrorBlock message={error} /></div>}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Anulează</Button>
        <Button
          loading={mutation.isPending}
          onClick={async () => {
            setError('');
            if (!form.title?.trim()) return setError('Titlul este obligatoriu');
            try {
              await mutation.mutateAsync(form);
              toast(task ? 'Task actualizat' : 'Task adăugat');
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Eroare la salvare');
            }
          }}
        >
          {task ? 'Salvează' : 'Adaugă task'}
        </Button>
      </div>
    </Modal>
  );
}

export function Tasks() {
  const [filter, setFilter] = useState<'OPEN' | 'DONE' | 'ALL'>('OPEN');
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const toast = useToast();

  const { data: tasks = [], isLoading, error } = useTasks();
  const update = useCrudMutation((input: { id: string; data: Partial<Task> }) => api.put(`/tasks/${input.id}`, input.data));
  const remove = useCrudMutation((id: string) => api.del(`/tasks/${id}`));

  const filtered = useMemo(
    () => tasks.filter((t) => (filter === 'ALL' ? true : filter === 'DONE' ? t.done : !t.done)),
    [tasks, filter],
  );
  const today = todayIso();

  return (
    <div className="animate-fade-up">
      <PageHeader title="Task-uri" subtitle="Lucruri de făcut, cu sau fără legătură cu un client">
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Task nou</Button>
      </PageHeader>

      <Card className="mb-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'OPEN', label: 'De făcut', count: tasks.filter((t) => !t.done).length },
            { value: 'DONE', label: 'Finalizate', count: tasks.filter((t) => t.done).length },
            { value: 'ALL', label: 'Toate', count: tasks.length },
          ]}
        />
      </Card>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error instanceof Error ? error.message : 'Eroare la încărcare'} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-6 w-6" />}
          title="Nimic pe listă"
          message="Adaugă un task ca să nu-ți scape nimic."
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Task nou</Button>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((task) => {
            const late = !task.done && task.dueDate && task.dueDate < today;
            return (
              <Card key={task.id} className="flex items-start gap-3 p-4">
                <button
                  onClick={() => update.mutate({ id: task.id, data: { done: !task.done } })}
                  className={cn(
                    'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition',
                    task.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-violet-400',
                  )}
                  aria-label={task.done ? 'Marchează nefinalizat' : 'Marchează finalizat'}
                >
                  {task.done && <Check className="h-4 w-4" strokeWidth={3} />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('text-sm font-bold', task.done ? 'text-slate-400 line-through' : 'text-slate-800')}>
                      {task.title}
                    </p>
                    <Badge className={PRIORITY[task.priority].chip}>{PRIORITY[task.priority].text}</Badge>
                    {task.client && <Badge>{task.client.company || task.client.name}</Badge>}
                  </div>
                  {task.details && <p className="mt-1 text-sm text-slate-500">{task.details}</p>}
                  {task.dueDate && (
                    <p className={cn('mt-1 flex items-center gap-1.5 text-xs font-medium', late ? 'text-rose-600' : 'text-slate-400')}>
                      <CalendarDays className="h-3.5 w-3.5" /> {formatDate(task.dueDate)}
                      {late && ' · depășit'}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(task)} className="rounded-xl p-2 text-slate-400 transition hover:bg-violet-50 hover:text-violet-600" aria-label="Editează">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleting(task)} className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label="Șterge">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing !== undefined && <TaskForm open onClose={() => setEditing(undefined)} task={editing} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Ștergi task-ul?"
        message={`„${deleting?.title}" va fi șters definitiv.`}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast('Task șters');
          setDeleting(null);
        }}
      />
    </div>
  );
}
