import type { Task } from './types';

/**
 * Cand o discutie cu clientul asteapta ceva de la tine:
 * - clientul a scris ceva ce inca n-ai citit, sau
 * - e o cerere venita din portal si inca nu i-ai raspuns deloc.
 * Discutiile deschise de tine nu te suna inapoi pana nu raspunde clientul.
 */
export function asteaptaRaspuns(task: Task): boolean {
  if (task.done) return false;
  const mesaje = task.messages ?? [];
  if (mesaje.some((m) => m.author === 'CLIENT' && !m.readByAdmin)) return true;
  return !!task.fromPortal && !mesaje.some((m) => m.author === 'ADMIN');
}

/** Cate cereri de la clienti asteapta un raspuns */
export function numaraCereri(tasks: Task[]): number {
  return tasks.filter(asteaptaRaspuns).length;
}
