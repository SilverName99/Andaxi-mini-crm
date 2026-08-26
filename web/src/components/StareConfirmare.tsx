import { AlertTriangle, BadgeCheck } from 'lucide-react';
import { Badge } from './ui';
import { formatDateTime, formatMinutes } from '../lib/format';
import type { MonthlyApproval } from '../lib/types';

/**
 * Confirmarea lunii, daca exista una. Butonul din portal e scos deocamdata, deci
 * eticheta apare doar la lunile confirmate inainte — nu scriem "neconfirmat" la
 * fiecare luna, cand clientul nici nu are de unde confirma.
 */
export function StareConfirmare({ approval }: { approval: MonthlyApproval | null }) {
  if (!approval) return null;

  const cine = approval.confirmedBy ? ` de ${approval.confirmedBy}` : '';
  const cand = formatDateTime(approval.confirmedAt);

  if (approval.changedSince) {
    return (
      <Badge className="bg-amber-100 text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" />
        Confirmat{cine} pe {cand}, dar s-a modificat după (atunci: {formatMinutes(approval.minutes)})
      </Badge>
    );
  }

  return (
    <Badge className="bg-emerald-100 text-emerald-700">
      <BadgeCheck className="h-3.5 w-3.5" /> Confirmat de client{cine} pe {cand}
    </Badge>
  );
}
