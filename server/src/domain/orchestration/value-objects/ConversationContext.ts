export interface ConversationContextProps {
  conversationId: string;
  tenantId: string;
  currentPackageId?: string;
  packageName?: string;
  s3Path?: string;
  updatedAt: Date;
}

export class ConversationContext {
  private readonly _conversationId: string;
  private readonly _tenantId: string;
  private _currentPackageId?: string;
  private _packageName?: string;
  private _s3Path?: string;
  private _updatedAt: Date;

  private constructor(props: ConversationContextProps) {
    this._conversationId = props.conversationId;
    this._tenantId = props.tenantId;
    this._currentPackageId = props.currentPackageId;
    this._packageName = props.packageName;
    this._s3Path = props.s3Path;
    this._updatedAt = props.updatedAt;
  }

  static create(conversationId: string, tenantId: string): ConversationContext {
    return new ConversationContext({
      conversationId,
      tenantId,
      updatedAt: new Date(),
    });
  }

  static fromProps(props: ConversationContextProps): ConversationContext {
    return new ConversationContext(props);
  }

  get conversationId(): string {
    return this._conversationId;
  }

  get tenantId(): string {
    return this._tenantId;
  }

  get currentPackageId(): string | undefined {
    return this._currentPackageId;
  }

  get packageName(): string | undefined {
    return this._packageName;
  }

  get s3Path(): string | undefined {
    return this._s3Path;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  setPackageContext(packageId: string, packageName: string, s3Path: string): void {
    this._currentPackageId = packageId;
    this._packageName = packageName;
    this._s3Path = s3Path;
    this._updatedAt = new Date();
  }

  clearPackageContext(): void {
    this._currentPackageId = undefined;
    this._packageName = undefined;
    this._s3Path = undefined;
    this._updatedAt = new Date();
  }

  hasPackageContext(): boolean {
    return !!this._currentPackageId;
  }
}
