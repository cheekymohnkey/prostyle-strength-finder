const { loadFrontendConfig } = require("./config");
const {
  CONTRACT_VERSION,
  isRecommendationResult,
} = require("../../../packages/shared-contracts/src");

function main() {
  const config = loadFrontendConfig();
  const sampleRecommendationPayload = {
    sessionId: "session_epic_a_001",
    recommendations: [
      {
        rank: 1,
        combinationId: "combination_001",
        rationale: "Best fit for requested style intent",
        confidence: 0.72,
      },
    ],
  };

  console.log(
    JSON.stringify(
      {
        message: "Frontend configuration loaded",
        app_env: config.appEnv,
        api_base_url: config.apiBaseUrl,
        contract_version: CONTRACT_VERSION,
        recommendation_contract_valid: isRecommendationResult(sampleRecommendationPayload),
      },
      null,
      2
    )
  );
}

main();
