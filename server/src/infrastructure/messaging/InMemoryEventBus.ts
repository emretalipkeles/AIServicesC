import type { DomainEvent } from '../../domain/events/DomainEvent';
import type { IEventBus, EventHandler } from '../../application/interfaces/IEventBus';

export class InMemoryEventBus implements IEventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    const eventType = event.eventType;
    const eventHandlers = this.handlers.get(eventType);
    
    if (!eventHandlers || eventHandlers.size === 0) {
      return;
    }

    const promises = Array.from(eventHandlers).map(handler => 
      handler(event).catch(error => {
        console.error(`Error handling event ${eventType}:`, error);
      })
    );

    await Promise.all(promises);
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EventHandler);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    const eventHandlers = this.handlers.get(eventType);
    if (eventHandlers) {
      eventHandlers.delete(handler);
    }
  }

  clear(): void {
    this.handlers.clear();
  }

  getSubscriberCount(eventType: string): number {
    return this.handlers.get(eventType)?.size ?? 0;
  }
}

export const eventBus = new InMemoryEventBus();
