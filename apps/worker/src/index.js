const { loadConfig } = require("./config");

function main() {
  const config = loadConfig();
  // Boot verification only for Epic A scope.
  console.log(
    JSON.stringify(
      {
        message: "Worker configuration loaded",
        service: config.observability.serviceName,
        app_env: config.runtime.appEnv,
        queue_url: config.queue.queueUrl,
      },
      null,
      2
    )
  );
}

main();
