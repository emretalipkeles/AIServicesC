export type PackageSessionStatus = 
  | 'uploading'
  | 'extracting' 
  | 'ready'
  | 'error';

export interface PretPackageSessionProps {
  readonly id: string;
  readonly tenantId: string;
  readonly packageId: string;
  readonly packageName: string;
  readonly s3Path: string;
  readonly status: PackageSessionStatus;
  readonly errorMessage?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class PretPackageSession {
  private _status: PackageSessionStatus;
  private _errorMessage?: string;
  private _updatedAt: Date;
  private _s3Path: string;

  private constructor(
    private readonly _id: string,
    private readonly _tenantId: string,
    private readonly _packageId: string,
    private readonly _packageName: string,
    s3Path: string,
    status: PackageSessionStatus,
    private readonly _createdAt: Date,
    errorMessage?: string
  ) {
    this._s3Path = s3Path;
    this._status = status;
    this._errorMessage = errorMessage;
    this._updatedAt = new Date();
  }

  static create(
    tenantId: string,
    packageId: string,
    packageName: string,
    s3Path: string
  ): PretPackageSession {
    const id = `pps_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    return new PretPackageSession(
      id,
      tenantId,
      packageId,
      packageName,
      s3Path,
      'uploading',
      new Date()
    );
  }

  static fromProps(props: PretPackageSessionProps): PretPackageSession {
    const session = new PretPackageSession(
      props.id,
      props.tenantId,
      props.packageId,
      props.packageName,
      props.s3Path,
      props.status,
      props.createdAt,
      props.errorMessage
    );
    session._updatedAt = props.updatedAt;
    return session;
  }

  get id(): string {
    return this._id;
  }

  get tenantId(): string {
    return this._tenantId;
  }

  get packageId(): string {
    return this._packageId;
  }

  get packageName(): string {
    return this._packageName;
  }

  get s3Path(): string {
    return this._s3Path;
  }

  get status(): PackageSessionStatus {
    return this._status;
  }

  get errorMessage(): string | undefined {
    return this._errorMessage;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  setS3Path(path: string): void {
    this._s3Path = path;
    this._updatedAt = new Date();
  }

  markExtracting(): void {
    this._status = 'extracting';
    this._updatedAt = new Date();
  }

  markReady(): void {
    this._status = 'ready';
    this._errorMessage = undefined;
    this._updatedAt = new Date();
  }

  markError(message: string): void {
    this._status = 'error';
    this._errorMessage = message;
    this._updatedAt = new Date();
  }

  isReady(): boolean {
    return this._status === 'ready';
  }

  toProps(): PretPackageSessionProps {
    return {
      id: this._id,
      tenantId: this._tenantId,
      packageId: this._packageId,
      packageName: this._packageName,
      s3Path: this._s3Path,
      status: this._status,
      errorMessage: this._errorMessage,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
