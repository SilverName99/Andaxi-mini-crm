import { AlertTriangle, BadgeCheck, Clock3 } from 'lucide-react';
import { Badge } from './ui';
import { formatDateTime, formatMinutes } from '../lib/format';
import type { MonthlyApproval } from '../lib/types';

/**
 * Ce a facut clientul cu luna asta in portalul lui: a confirmat-o, a
 * confirmat-o si intre timp s-a schimbat, sau inca nu s-a uitat peste ea.
 */
export function StareConfirmare({
  approval,
  areOre,
}: {
  approval: MonthlyApproval | null;
  areOre: boolean;
}) {
  if (!areOre) return null;

  // pe hartie n-are rost sa scrie "neconfirmat" — fisa ajunge chiar la client
  if (!approval) {
    return (
      <Badge className="no-print bg-slate-100 text-slate-500">
        <Clock3 className="h-3.5 w-3.5" /> Neconfirmat de client
      </Badge>
    );
  }

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
