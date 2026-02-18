const { loadConfig } = require("./config");

function main() {
  const config = loadConfig();
  // Boot verification only for Epic A scope.
  console.log(
    JSON.stringify(
      {
        message: "API configuration loaded",
        service: config.observability.serviceName,
        app_env: config.runtime.appEnv,
        port: config.runtime.port,
      },
      null,
      2
    )
  );
}

main();
