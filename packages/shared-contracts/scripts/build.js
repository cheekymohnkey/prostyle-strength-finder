const contracts = require("../src/index.js");

if (!contracts.CONTRACT_VERSION) {
  throw new Error("Missing CONTRACT_VERSION export");
}

console.log(
  JSON.stringify(
    {
      message: "Shared contracts build check passed",
      contractVersion: contracts.CONTRACT_VERSION,
      traitSchemaVersion: contracts.TRAIT_SCHEMA_VERSION,
      exports: Object.keys(contracts).length,
    },
    null,
    2
  )
);
