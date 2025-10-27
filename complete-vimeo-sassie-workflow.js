// complete-vimeo-sassie-workflow.js
require("dotenv").config();
const SalesforceAuthJWT = require("./cloud/salesforce-auth-jwt");
const VimeoSalesforceIntegration = require("./vimeo-to-salesforce");
const extractSassieIds = require("./extract-sassie-ids");
const SassieUploader = require("./sassie-uploader");
const fs = require("fs").promises;

/**
 * Complete workflow: Vimeo → Salesforce → Extract SASSIE IDs → Upload to SASSIE
 */
async function runCompleteWorkflow(vimeoExportFile, options = {}) {
  const {
    workOrderIdentifier = "work_order_name",
    batchSize = 5,
    delayMs = 100,
    dryRun = false,
    exportDir = "./exports",
    uploadToSassie = true,
    sassieConfig = {},
  } = options;

  try {
    console.log("=".repeat(70));
    console.log("🔄 COMPLETE WORKFLOW: VIMEO → SALESFORCE → SASSIE");
    console.log("=".repeat(70));

    // =================================================================
    // STEP 1: Authenticate with Salesforce
    // =================================================================
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

    // =================================================================
    // STEP 2: Run Vimeo → Salesforce sync
    // =================================================================
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

    // =================================================================
    // STEP 3: Extract SASSIE IDs from successful updates
    // =================================================================
    console.log(
      "\n📝 Step 3: Extracting SASSIE IDs from successful updates..."
    );

    if (syncResults.salesforceResults.successful === 0) {
      console.log("⚠️  No successful updates to extract SASSIE IDs from");
      return {
        syncResults,
        sassieData: [],
        sassieUploadResults: null,
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

    // =================================================================
    // STEP 4: Upload to SASSIE
    // =================================================================
    let sassieUploadResults = null;

    if (uploadToSassie && sassieData.length > 0) {
      console.log("\n📝 Step 4: Uploading data to SASSIE...");

      try {
        const uploader = new SassieUploader(sassieConfig);

        // Test connection first
        console.log("\n🔍 Testing SASSIE API connection...");
        const connectionTest = await uploader.testConnection();

        if (!connectionTest) {
          console.log(
            "⚠️  SASSIE API connection test failed - skipping upload"
          );
          console.log("   Check your SASSIE_API_KEY and SASSIE_API_URL in .env");
        } else {
          // Upload the data
          sassieUploadResults = await uploader.uploadBatch(sassieData, {
            batchSize: 3, // Smaller batch size for SASSIE
            delayMs: 500, // More conservative delay
            useBase64: sassieConfig.useBase64 || false,
          });

          // Save results
          const resultsFile = `${exportDir}/sassie_upload_results_${
            new Date().toISOString().split("T")[0]
          }.json`;
          await fs.writeFile(
            resultsFile,
            JSON.stringify(sassieUploadResults, null, 2),
            "utf8"
          );
          console.log(`\n💾 Upload results saved to: ${resultsFile}`);
        }
      } catch (error) {
        console.error("\n❌ SASSIE upload error:", error.message);
        console.log(
          "   Continuing workflow - SASSIE data is still available for manual upload"
        );
      }
    } else if (!uploadToSassie) {
      console.log(
        "\n⏭️  Step 4: Skipping SASSIE upload (uploadToSassie = false)"
      );
    }

    // =================================================================
    // STEP 5: Display final summary
    // =================================================================
    console.log("\n" + "=".repeat(70));
    console.log("📊 WORKFLOW COMPLETE - FINAL SUMMARY");
    console.log("=".repeat(70));
    console.log(`Vimeo Records Processed: ${syncResults.totalRecords}`);
    console.log(
      `Salesforce Updates - Success: ${syncResults.salesforceResults.successful}`
    );
    console.log(
      `Salesforce Updates - Failed: ${syncResults.salesforceResults.failed}`
    );
    console.log(`SASSIE IDs Extracted: ${sassieData.length}`);
    
    if (sassieUploadResults) {
      console.log(
        `SASSIE Uploads - Success: ${sassieUploadResults.successful.length}`
      );
      console.log(
        `SASSIE Uploads - Failed: ${sassieUploadResults.failed.length}`
      );
    }
    
    console.log("=".repeat(70));

    if (sassieData.length > 0) {
      console.log("\n📁 Generated Files:");
      console.log(
        `   ✅ Successful updates: ${successfulFilePath}`
      );
      console.log(
        `   ✅ SASSIE IDs (JSON): ${successfulFilePath.replace(
          ".csv",
          "_sassie_ids.json"
        )}`
      );
      if (sassieUploadResults) {
        console.log(
          `   ✅ SASSIE upload results: ${exportDir}/sassie_upload_results_${
            new Date().toISOString().split("T")[0]
          }.json`
        );
      }
    }

    console.log("\n🎉 Workflow complete!");

    return {
      syncResults,
      sassieData,
      sassieUploadResults,
      files: {
        successful: successfulFilePath,
        sassieIds: successfulFilePath.replace(".csv", "_sassie_ids.json"),
        uploadResults: sassieUploadResults
          ? `${exportDir}/sassie_upload_results_${
              new Date().toISOString().split("T")[0]
            }.json`
          : null,
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
      uploadToSassie: true, // ← Set to false to skip SASSIE upload
      sassieConfig: {
        // Optional: override env vars
        // apiKey: 'your-api-key',
        // apiUrl: 'https://api.sassie.com',
        useBase64: false, // ← Set to true if SASSIE requires base64 CSV
      },
    });

    console.log("\n✅ All steps completed successfully!");
    
    if (results.sassieUploadResults) {
      const successRate =
        (results.sassieUploadResults.successful.length /
          results.sassieData.length) *
        100;
      console.log(
        `📈 SASSIE Upload Success Rate: ${successRate.toFixed(2)}%`
      );
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

module.exports = { runCompleteWorkflow };
