import type { PretObjectTypeName } from './ObjectType';

export interface ValidationError {
  readonly path: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

export class YamlOutput {
  private constructor(
    private readonly _objectType: PretObjectTypeName,
    private readonly _objectName: string,
    private readonly _content: string,
    private readonly _isValid: boolean,
    private readonly _errors: ValidationError[]
  ) {}

  static create(
    objectType: PretObjectTypeName,
    objectName: string,
    content: string
  ): YamlOutput {
    return new YamlOutput(objectType, objectName, content, false, []);
  }

  static validated(
    objectType: PretObjectTypeName,
    objectName: string,
    content: string,
    errors: ValidationError[]
  ): YamlOutput {
    const isValid = errors.filter(e => e.severity === 'error').length === 0;
    return new YamlOutput(objectType, objectName, content, isValid, errors);
  }

  get objectType(): PretObjectTypeName {
    return this._objectType;
  }

  get objectName(): string {
    return this._objectName;
  }

  get content(): string {
    return this._content;
  }

  get isValid(): boolean {
    return this._isValid;
  }

  get errors(): readonly ValidationError[] {
    return this._errors;
  }

  get warnings(): ValidationError[] {
    return this._errors.filter(e => e.severity === 'warning');
  }

  get criticalErrors(): ValidationError[] {
    return this._errors.filter(e => e.severity === 'error');
  }

  hasErrors(): boolean {
    return this.criticalErrors.length > 0;
  }

  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  getFileName(): string {
    const sanitizedName = this._objectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${sanitizedName}.yaml`;
  }

  toMarkdown(): string {
    let md = `### ${this._objectType}: ${this._objectName}\n\n`;
    
    if (this.hasErrors()) {
      md += `**Validation Errors:**\n`;
      for (const error of this.criticalErrors) {
        md += `- \`${error.path}\`: ${error.message}\n`;
      }
      md += '\n';
    }

    if (this.hasWarnings()) {
      md += `**Warnings:**\n`;
      for (const warning of this.warnings) {
        md += `- \`${warning.path}\`: ${warning.message}\n`;
      }
      md += '\n';
    }

    md += '```yaml\n';
    md += this._content;
    md += '\n```\n';

    return md;
  }
}
