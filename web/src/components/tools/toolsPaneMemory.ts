import type { Tool } from '../../state/tabs';

let rememberedTool: Tool = 'landing';

export const getRememberedTool = (): Tool => rememberedTool;

export function rememberTool(tool: Tool): void {
  rememberedTool = tool;
}

export function forgetToolsPane(): void {
  rememberedTool = 'landing';
}
