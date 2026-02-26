export type EventHandler<T> = (event: T) => void;

export class TypedEventEmitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<EventHandler<unknown>>>();

  on<Key extends keyof Events>(
    eventName: Key,
    handler: EventHandler<Events[Key]>,
  ): () => void {
    const handlers = this.listeners.get(eventName) ?? new Set<EventHandler<unknown>>();
    handlers.add(handler as EventHandler<unknown>);
    this.listeners.set(eventName, handlers);

    return () => this.off(eventName, handler);
  }

  off<Key extends keyof Events>(
    eventName: Key,
    handler: EventHandler<Events[Key]>,
  ): void {
    const handlers = this.listeners.get(eventName);
    if (!handlers) {
      return;
    }

    handlers.delete(handler as EventHandler<unknown>);
    if (handlers.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  protected emit<Key extends keyof Events>(eventName: Key, payload: Events[Key]): void {
    const handlers = this.listeners.get(eventName);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(payload);
    }
  }
}
