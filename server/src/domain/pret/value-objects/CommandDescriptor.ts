export interface CommandArgDescriptor {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean';
  examples?: string[];
}

export interface CommandDescriptor {
  name: string;
  description: string;
  examples: string[];
  args: CommandArgDescriptor[];
}

export function createCommandDescriptor(
  name: string,
  description: string,
  examples: string[],
  args: CommandArgDescriptor[] = []
): CommandDescriptor {
  return { name, description, examples, args };
}
