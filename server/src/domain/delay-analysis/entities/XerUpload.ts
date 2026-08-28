export interface XerUploadProps {
  id: string;
  projectId: string;
  tenantId: string;
  filename: string;
  contentType: string;
  detectedVersion: string | null;
  fileData: Buffer;
  parseError: string | null;
  createdAt: Date;
}

export class XerUpload {
  readonly id: string;
  readonly projectId: string;
  readonly tenantId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly detectedVersion: string | null;
  readonly fileData: Buffer;
  readonly parseError: string | null;
  readonly createdAt: Date;

  constructor(props: XerUploadProps) {
    if (!props.filename.toLowerCase().endsWith(".xer")) {
      throw new Error("XER upload filename must have a .xer extension");
    }
    this.id = props.id;
    this.projectId = props.projectId;
    this.tenantId = props.tenantId;
    this.filename = props.filename;
    this.contentType = props.contentType;
    this.detectedVersion = props.detectedVersion;
    this.fileData = props.fileData;
    this.parseError = props.parseError;
    this.createdAt = props.createdAt;
  }
}
