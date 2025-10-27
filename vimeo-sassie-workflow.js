// vimeo-salesforce-sassie-workflow.js
require("dotenv").config();
const SalesforceAuthJWT = require("./cloud/salesforce-auth-jwt");
const VimeoSalesforceIntegration = require("./vimeo-to-salesforce");
const extractSassieIds = require("./extract-sassie-ids");
const fs = require("fs").promises;

/**
 * Complete workflow: Vimeo → Salesforce → Extract SASSIE IDs
 */
async function runCompleteWorkflow(vimeoExportFile, options = {}) {
  const {
    workOrderIdentifier = "work_order_name",
    batchSize = 5,
    delayMs = 100,
    dryRun = false,
    exportDir = "./exports",
  } = options;

  try {
    console.log("=".repeat(70));
    console.log("🔄 COMPLETE WORKFLOW: VIMEO → SALESFORCE → SASSIE");
    console.log("=".repeat(70));

    // STEP 1: Authenticate with Salesforce
    console.log("\n📝 Step 1: Authenticating with Salesforce...");
    const auth = new SalesforceAuthJWT({
      clientId: process.env.SF_CLIENT_ID,
      username: process.env.SF_USERNAME,
      privateKeyPath: process.env.SF_PRIVATE_KEY_PATH,
      loginUrl:
        process.env.SF_LOGIN_URL ||
        "https://realitybasedgroup.my.salesforce.com",
    });

    await auth.authenticate();
    console.log("✅ Authentication successful!");

    // STEP 2: Run Vimeo → Salesforce sync
    console.log("\n📝 Step 2: Syncing Vimeo data to Salesforce...");
    const integration = new VimeoSalesforceIntegration(auth);

    const syncResults = await integration.processVimeoExport(vimeoExportFile, {
      workOrderIdentifier,
      batchSize,
      delayMs,
      dryRun,
      exportResults: true,
      exportDir,
    });

    if (dryRun) {
      console.log(
        "\n⚠️  DRY RUN MODE - No updates made, no SASSIE IDs to extract"
      );
      return {
        dryRun: true,
        syncResults,
      };
    }

    // STEP 3: Extract SASSIE IDs from successful updates
    console.log(
      "\n📝 Step 3: Extracting SASSIE IDs from successful updates..."
    );

    if (syncResults.salesforceResults.successful === 0) {
      console.log("⚠️  No successful updates to extract SASSIE IDs from");
      return {
        syncResults,
        sassieData: [],
      };
    }

    // Find the successful updates CSV file
    const files = await fs.readdir(exportDir);
    const successfulFile = files
      .filter((f) => f.includes("vimeo_salesforce_sync_successful"))
      .sort()
      .reverse()[0]; // Get most recent

    if (!successfulFile) {
      throw new Error("Could not find successful updates CSV file");
    }

    const successfulFilePath = `${exportDir}/${successfulFile}`;
    console.log(`   Reading: ${successfulFilePath}`);

    const sassieData = await extractSassieIds(successfulFilePath);

    // STEP 4: Display summary
    console.log("\n" + "=".repeat(70));
    console.log("📊 WORKFLOW COMPLETE - SUMMARY");
    console.log("=".repeat(70));
    console.log(`Vimeo Records Processed: ${syncResults.totalRecords}`);
    console.log(
      `Salesforce Updates - Success: ${syncResults.salesforceResults.successful}`
    );
    console.log(
      `Salesforce Updates - Failed: ${syncResults.salesforceResults.failed}`
    );
    console.log(`SASSIE IDs Extracted: ${sassieData.length}`);
    console.log("=".repeat(70));

    if (sassieData.length > 0) {
      console.log("\n✅ READY FOR NEXT STEP: Push to SASSIE");
      console.log("\nSASSIE IDs available in:");
      console.log(
        `   ${successfulFilePath.replace(".csv", "_sassie_ids.json")}`
      );

      console.log("\n📋 Sample SASSIE IDs:");
      sassieData.slice(0, 5).forEach((item, i) => {
        console.log(
          `   ${i + 1}. ${item.workOrderName} → SASSIE ID: ${item.sassieId}`
        );
      });
      if (sassieData.length > 5) {
        console.log(`   ... and ${sassieData.length - 5} more`);
      }
    }

    return {
      syncResults,
      sassieData,
      files: {
        successful: successfulFilePath,
        sassieIds: successfulFilePath.replace(".csv", "_sassie_ids.json"),
      },
    };
  } catch (error) {
    console.error("\n❌ Workflow failed:", error.message);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // CONFIGURE THIS SECTION
    const vimeoExportFile = "./vimeo-export.csv"; // ← Your Vimeo export file

    const results = await runCompleteWorkflow(vimeoExportFile, {
      workOrderIdentifier: "WO#", // ← Your CSV column with Work Order names
      batchSize: 5,
      delayMs: 100,
      dryRun: false, // ← Set to true for testing
      exportDir: "./exports",
    });

    if (!results.dryRun) {
      console.log("\n🎉 Workflow complete! Data ready for SASSIE push.");
    }
  } catch (error) {
    console.error("\n❌ Workflow failed:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { runCompleteWorkflow, extractSassieIds };
