const EventEmitter = require("events");

/**
 * EventBus Service Abstraction
 *
 * Decouples the critical credit accounting transactions from secondary
 * asynchronous workflows (analytics aggregation, webhooks, alerting, logging).
 *
 * Default implementation: In-process asynchronous EventEmitter.
 * Future extension: Can be swapped with Kafka / AWS Kinesis / RabbitMQ
 * without modifying domain service logic.
 */
class CreditEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Publish an immutable credit event to the event bus
   * @param {Object} event - CreditConsumptionEvent document or plain object
   */
  publish(event) {
    const eventType = event.eventType || "CREDIT_EVENT";
    // Fire asynchronously to avoid blocking the caller's execution thread
    setImmediate(() => {
      try {
        this.emit(eventType, event);
        this.emit("CREDIT_EVENT_ALL", event);
        console.log(`[EventBus] Published ${eventType} (ID: ${event.id || event.eventId}, Account: ${event.creditAccountId})`);
      } catch (err) {
        console.error(`[EventBus] Error in event listener for ${eventType}:`, err.message);
      }
    });
  }

  /**
   * Subscribe a handler to a specific credit event type
   * @param {string} eventType - Event type or 'CREDIT_EVENT_ALL'
   * @param {Function} handler - Async or sync event handler
   */
  subscribe(eventType, handler) {
    this.on(eventType, async (event) => {
      try {
        await handler(event);
      } catch (err) {
        console.error(`[EventBus] Handler failure for ${eventType}:`, err.message);
      }
    });
  }
}

// Singleton event bus instance
const eventBus = new CreditEventBus();

module.exports = eventBus;
