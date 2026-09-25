// Where bridged records go. Kafka in the stack; "log" for running the bridge
// on a laptop against a local fleet-server with no broker.
import { Kafka, type Producer } from "kafkajs";

export type Record = { topic: string; key: string; value: unknown };

export interface Sink {
  send(rec: Record): Promise<void>;
  close(): Promise<void>;
}

export class LogSink implements Sink {
  async send(rec: Record) {
    console.log(`[sink:log] ${rec.topic} key=${rec.key} ${JSON.stringify(rec.value)}`);
  }
  async close() {}
}

export class KafkaSink implements Sink {
  private producer: Producer;
  constructor(brokers: string[], clientId: string) {
    this.producer = new Kafka({ clientId, brokers }).producer({ allowAutoTopicCreation: true });
  }
  async connect() {
    await this.producer.connect();
  }
  async send(rec: Record) {
    await this.producer.send({
      topic: rec.topic,
      messages: [{ key: rec.key, value: JSON.stringify(rec.value) }],
    });
  }
  async close() {
    await this.producer.disconnect();
  }
}
