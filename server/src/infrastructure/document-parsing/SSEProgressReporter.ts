import type { Response } from 'express';
import type { 
  IProgressReporter, 
  ProgressEvent 
} from '../../domain/delay-analysis/interfaces/IProgressReporter';

export class SSEProgressReporter implements IProgressReporter {
  private isClosed = false;

  constructor(private readonly res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.on('close', () => {
      this.isClosed = true;
    });
  }

  report(event: ProgressEvent): void {
    if (this.isClosed) return;
    
    const data = JSON.stringify({
      type: 'progress',
      ...event,
    });
    
    this.res.write(`data: ${data}\n\n`);
  }

  complete(message: string, result?: unknown): void {
    if (this.isClosed) return;
    
    const data = JSON.stringify({
      type: 'complete',
      message,
      result,
    });
    
    this.res.write(`data: ${data}\n\n`);
    this.res.end();
    this.isClosed = true;
  }

  error(message: string, error?: Error): void {
    if (this.isClosed) return;
    
    const data = JSON.stringify({
      type: 'error',
      message,
      error: error?.message,
    });
    
    this.res.write(`data: ${data}\n\n`);
    this.res.end();
    this.isClosed = true;
  }
}
