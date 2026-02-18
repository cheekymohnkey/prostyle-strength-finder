const { loadConfig } = require("./config");
const {
  CONTRACT_VERSION,
  createApiErrorResponse,
} = require("../../../packages/shared-contracts/src");

function main() {
  const config = loadConfig();
  const apiErrorShape = createApiErrorResponse({
    code: "NOT_IMPLEMENTED",
    message: "Endpoint scaffold only",
    requestId: "req_epic_a",
  });

  // Boot verification only for Epic A scope.
  console.log(
    JSON.stringify(
      {
        message: "API configuration loaded",
        service: config.observability.serviceName,
        app_env: config.runtime.appEnv,
        port: config.runtime.port,
        contract_version: CONTRACT_VERSION,
        api_error_shape: apiErrorShape,
      },
      null,
      2
    )
  );
}

main();
