import { createHash } from 'crypto';
import type { IDocumentHashService } from '../../domain/delay-analysis/interfaces/IDocumentHashService';

export class SHA256DocumentHashService implements IDocumentHashService {
  computeHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
