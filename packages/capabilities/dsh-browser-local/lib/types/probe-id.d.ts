import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
export type OutputKind = undefined extends ToolDefinition['output'] ? 'optional' : 'required';
export declare const kind: OutputKind;
//# sourceMappingURL=probe-id.d.ts.map