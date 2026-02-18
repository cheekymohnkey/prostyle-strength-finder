const { loadFrontendConfig } = require("./config");

function main() {
  const config = loadFrontendConfig();
  console.log(
    JSON.stringify(
      {
        message: "Frontend configuration loaded",
        app_env: config.appEnv,
        api_base_url: config.apiBaseUrl,
      },
      null,
      2
    )
  );
}

main();
