import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

/** Wrapper pentru handlere async, ca erorile sa ajunga in middleware-ul de erori */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Date invalide',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const prismaCode = (err as { code?: string }).code;
  if (prismaCode === 'P2025') {
    res.status(404).json({ error: 'Inregistrarea nu a fost gasita' });
    return;
  }
  if (prismaCode === 'P2002') {
    res.status(409).json({ error: 'Exista deja o inregistrare cu aceste date' });
    return;
  }
  console.error('[eroare]', err);
  res.status(500).json({ error: 'Eroare interna de server' });
}
