export interface UploadNarratorContext {
  success: boolean;
  packageName: string;
  packageId: string;
  error?: string;
  validationErrors?: string[];
}

export interface NarratorResponse {
  message: string;
  tone: 'success' | 'error' | 'warning';
}

export interface NarratorStreamChunk {
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
  tone?: 'success' | 'error' | 'warning';
}

export interface NarratorStreamOptions {
  abortSignal?: AbortSignal;
}

export interface IUploadNarrator {
  narrate(context: UploadNarratorContext): Promise<NarratorResponse>;
  
  streamNarrate(
    context: UploadNarratorContext,
    onChunk: (chunk: NarratorStreamChunk) => void,
    options?: NarratorStreamOptions
  ): Promise<void>;
}
