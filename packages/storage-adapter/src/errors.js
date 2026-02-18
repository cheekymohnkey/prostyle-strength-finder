class StorageAdapterError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "StorageAdapterError";
    this.code = code;
    this.details = details || null;
  }
}

module.exports = {
  StorageAdapterError,
};
