export class NarrateUploadResultCommand {
  constructor(
    public readonly success: boolean,
    public readonly packageName: string,
    public readonly packageId: string,
    public readonly error?: string,
    public readonly validationErrors?: string[]
  ) {}
}
