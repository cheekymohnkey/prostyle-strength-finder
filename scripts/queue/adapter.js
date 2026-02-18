const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { parseDatabaseUrl, runSql } = require("../db/lib");

function nowIso() {
  return new Date().toISOString();
}

function quote(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function queueModeFromConfig(config) {
  if (config.queue.adapterMode) {
    return config.queue.adapterMode;
  }
  return config.runtime.appEnv === "local" ? "sqlite" : "sqs";
}

class SqliteQueueAdapter {
  constructor(config) {
    this.primaryQueueUrl = config.queue.queueUrl;
    this.deadLetterQueueUrl = config.queue.dlqUrl;
    this.dbPath = parseDatabaseUrl(config.database.databaseUrl);
  }

  mode() {
    return "sqlite";
  }

  enqueue(input) {
    const messageId = input.messageId || crypto.randomUUID();
    const createdAt = nowIso();
    runSql(
      this.dbPath,
      `INSERT INTO queue_messages (
         message_id, queue_url, body, status, receive_count, available_at, created_at, updated_at
       ) VALUES (
         ${quote(messageId)},
         ${quote(this.primaryQueueUrl)},
         ${quote(input.body)},
         'queued',
         0,
         ${quote(createdAt)},
         ${quote(createdAt)},
         ${quote(createdAt)}
       );`
    );
    return {
      messageId,
      queueUrl: this.primaryQueueUrl,
    };
  }

  poll() {
    const rowsRaw = runSql(
      this.dbPath,
      `SELECT id, message_id, body, receive_count
       FROM queue_messages
       WHERE queue_url = ${quote(this.primaryQueueUrl)}
         AND status = 'queued'
         AND available_at <= ${quote(nowIso())}
       ORDER BY id ASC
       LIMIT 1;`,
      { json: true }
    );

    if (!rowsRaw) {
      return null;
    }
    const rows = JSON.parse(rowsRaw);
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const receiptHandle = crypto.randomUUID();
    const updatedAt = nowIso();
    runSql(
      this.dbPath,
      `UPDATE queue_messages
       SET status = 'in_progress',
           receipt_handle = ${quote(receiptHandle)},
           receive_count = receive_count + 1,
           updated_at = ${quote(updatedAt)}
       WHERE id = ${Number(row.id)};`
    );

    return {
      messageId: row.message_id,
      receiptHandle,
      body: row.body,
      attempts: Number(row.receive_count) + 1,
    };
  }

  ack(message) {
    runSql(
      this.dbPath,
      `DELETE FROM queue_messages
       WHERE queue_url = ${quote(this.primaryQueueUrl)}
         AND receipt_handle = ${quote(message.receiptHandle)};`
    );
  }

  requeue(message, delayMs) {
    const delaySeconds = Math.max(0, Math.ceil(delayMs / 1000));
    runSql(
      this.dbPath,
      `UPDATE queue_messages
       SET status = 'queued',
           receipt_handle = NULL,
           available_at = datetime('now', '+${delaySeconds} seconds'),
           updated_at = ${quote(nowIso())}
       WHERE queue_url = ${quote(this.primaryQueueUrl)}
         AND receipt_handle = ${quote(message.receiptHandle)};`
    );
  }

  deadLetter(message, reason) {
    const createdAt = nowIso();
    runSql(
      this.dbPath,
      `INSERT INTO queue_messages (
         message_id, queue_url, body, status, receive_count, available_at, last_error, created_at, updated_at
       ) VALUES (
         ${quote(crypto.randomUUID())},
         ${quote(this.deadLetterQueueUrl)},
         ${quote(message.body)},
         'queued',
         ${Number(message.attempts || 1)},
         ${quote(createdAt)},
         ${quote(reason || null)},
         ${quote(createdAt)},
         ${quote(createdAt)}
       );`
    );

    this.ack(message);
  }

  healthcheck() {
    return {
      mode: this.mode(),
      queueUrl: this.primaryQueueUrl,
      deadLetterQueueUrl: this.deadLetterQueueUrl,
      dbPath: this.dbPath,
    };
  }
}

class SqsCliQueueAdapter {
  constructor(config) {
    this.primaryQueueUrl = config.queue.queueUrl;
    this.deadLetterQueueUrl = config.queue.dlqUrl;
    this.region = config.storage.region;
  }

  mode() {
    return "sqs";
  }

  runAws(args) {
    const result = spawnSync(
      "aws",
      ["sqs", ...args, "--output", "json", "--region", this.region],
      { encoding: "utf8" }
    );

    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || "aws sqs command failed").trim());
    }

    return result.stdout ? JSON.parse(result.stdout) : {};
  }

  enqueue(input) {
    const output = this.runAws([
      "send-message",
      "--queue-url",
      this.primaryQueueUrl,
      "--message-body",
      input.body,
    ]);

    return {
      messageId: output.MessageId,
      queueUrl: this.primaryQueueUrl,
    };
  }

  poll() {
    const output = this.runAws([
      "receive-message",
      "--queue-url",
      this.primaryQueueUrl,
      "--max-number-of-messages",
      "1",
      "--wait-time-seconds",
      "1",
      "--attribute-names",
      "All",
    ]);

    const message = output.Messages && output.Messages[0];
    if (!message) {
      return null;
    }

    return {
      messageId: message.MessageId,
      receiptHandle: message.ReceiptHandle,
      body: message.Body,
      attempts: Number(message.Attributes?.ApproximateReceiveCount || 1),
    };
  }

  ack(message) {
    this.runAws([
      "delete-message",
      "--queue-url",
      this.primaryQueueUrl,
      "--receipt-handle",
      message.receiptHandle,
    ]);
  }

  requeue(message, delayMs) {
    const visibilityTimeout = Math.max(0, Math.ceil(delayMs / 1000));
    this.runAws([
      "change-message-visibility",
      "--queue-url",
      this.primaryQueueUrl,
      "--receipt-handle",
      message.receiptHandle,
      "--visibility-timeout",
      String(visibilityTimeout),
    ]);
  }

  deadLetter(message, reason) {
    this.runAws([
      "send-message",
      "--queue-url",
      this.deadLetterQueueUrl,
      "--message-body",
      JSON.stringify({
        originalBody: message.body,
        deadLetteredAt: nowIso(),
        reason: reason || "processing error",
      }),
    ]);
    this.ack(message);
  }

  healthcheck() {
    this.runAws([
      "get-queue-attributes",
      "--queue-url",
      this.primaryQueueUrl,
      "--attribute-names",
      "ApproximateNumberOfMessages",
    ]);

    return {
      mode: this.mode(),
      queueUrl: this.primaryQueueUrl,
      deadLetterQueueUrl: this.deadLetterQueueUrl,
      region: this.region,
    };
  }
}

function createQueueAdapter(config) {
  const mode = queueModeFromConfig(config);
  if (mode === "sqlite") {
    return new SqliteQueueAdapter(config);
  }
  if (mode === "sqs") {
    return new SqsCliQueueAdapter(config);
  }

  throw new Error(`Unsupported queue adapter mode: ${mode}`);
}

module.exports = {
  createQueueAdapter,
};
