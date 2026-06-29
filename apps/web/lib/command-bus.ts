/** Lightweight command bus for palette actions that need shell-specific handlers. */

export type CommandBusEvent =
  | { type: 'reception:openNewRequest' }
  | { type: 'reception:openRoom'; roomId: string }
  | { type: 'palette:open' };

type Listener = (event: CommandBusEvent) => void;

const listeners = new Set<Listener>();

export function subscribeCommandBus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitCommandBus(event: CommandBusEvent) {
  for (const listener of listeners) listener(event);
}
