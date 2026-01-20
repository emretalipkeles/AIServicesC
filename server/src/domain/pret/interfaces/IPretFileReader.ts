export interface FileChunk {
  readonly content: string;
  readonly chunkIndex: number;
  readonly isLast: boolean;
  readonly bytesRead: number;
  readonly totalBytes?: number;
}

export interface FileReadResult {
  readonly success: boolean;
  readonly fullContent?: string;
  readonly summary?: string;
  readonly memberCount?: number;
  readonly hasCalculations?: boolean;
  readonly error?: string;
  readonly isLargeFile: boolean;
  readonly totalBytes: number;
}

export interface FileReadOptions {
  readonly chunkSizeBytes?: number;
  readonly maxFullContentBytes?: number;
  readonly onChunk?: (chunk: FileChunk) => void;
}

export interface IPretFileReader {
  readFile(
    tenantId: string,
    packageId: string,
    filePath: string,
    options?: FileReadOptions
  ): Promise<FileReadResult>;

  readFileChunked(
    tenantId: string,
    packageId: string,
    filePath: string,
    onChunk: (chunk: FileChunk) => void,
    options?: FileReadOptions
  ): Promise<FileReadResult>;

  getFileSize(
    tenantId: string,
    packageId: string,
    filePath: string
  ): Promise<number | null>;
}
