const crypto = require("crypto");
const { CONTRACT_VERSION } = require("../../../packages/shared-contracts/src");

function normalizeMessages(raw) {
  if (!raw) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    throw new Error("WORKER_SAMPLE_MESSAGES must be valid JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("WORKER_SAMPLE_MESSAGES must be a JSON array");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`WORKER_SAMPLE_MESSAGES[${index}] must be an object`);
    }

    const message = {
      receiptHandle: item.receiptHandle || crypto.randomUUID(),
      attempts: Number.isInteger(item.attempts) ? item.attempts : 0,
      body: item.body,
    };

    if (!message.body) {
      message.body = JSON.stringify({
        schemaVersion: CONTRACT_VERSION,
        jobId: item.jobId || `job_local_${index + 1}`,
        idempotencyKey: item.idempotencyKey || `idemp_local_${index + 1}`,
        runType: item.runType || "trait",
        imageId: item.imageId || `image_local_${index + 1}`,
        submittedAt: new Date().toISOString(),
        priority: item.priority || "normal",
        context: item.context || {},
      });
    } else if (typeof message.body !== "string") {
      message.body = JSON.stringify(message.body);
    }

    return message;
  });
}

class LocalQueueAdapter {
  constructor(config) {
    this.config = config;
    this.messages = normalizeMessages(process.env.WORKER_SAMPLE_MESSAGES);
    this.deadLetters = [];
  }

  async poll() {
    return this.messages.shift() || null;
  }

  async ack(_message) {
    return;
  }

  async requeue(message, _delayMs) {
    this.messages.push({
      ...message,
      attempts: message.attempts + 1,
    });
  }

  async deadLetter(message, reason) {
    this.deadLetters.push({
      message,
      reason,
      movedAt: new Date().toISOString(),
      deadLetterQueueUrl: this.config.queue.dlqUrl,
    });
  }
}

module.exports = {
  LocalQueueAdapter,
};
