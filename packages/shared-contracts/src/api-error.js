function createApiErrorResponse(input) {
  const error = {
    code: input.code || "UNKNOWN_ERROR",
    message: input.message || "An unexpected error occurred",
    requestId: input.requestId || null,
    details: input.details || null,
  };

  if (typeof error.code !== "string" || typeof error.message !== "string") {
    throw new Error("API error response requires string code and message");
  }

  return error;
}

module.exports = {
  createApiErrorResponse,
};
