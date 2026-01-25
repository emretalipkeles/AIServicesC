export interface IDocumentHashService {
  computeHash(buffer: Buffer): string;
}
