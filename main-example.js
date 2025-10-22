// main-example.js
require("dotenv").config();
const SalesforceUpdater = require("./salesforce-updater");
const CSVExporter = require("./csv-exporter");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");

/**
 * Main orchestrator class for Salesforce updates
 */
class SalesforceUpdateOrchestrator {
  constructor() {
    this.secretManager = new SecretManagerServiceClient();
    this.updater = null;
  }

  /**
   * Load Salesforce credentials from Google Cloud Secret Manager
   * @param {string} projectId - Google Cloud project ID
   * @param {string} secretName - Name of the secret containing SF credentials
   * @returns {Promise<Object>} Salesforce configuration
   */
  async loadCredentialsFromSecrets(projectId, secretName) {
    try {
      const [version] = await this.secretManager.accessSecretVersion({
        name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
      });

      const secretValue = version.payload.data.toString();
      const credentials = JSON.parse(secretValue);

      console.log(
        "🔐 Loaded Salesforce credentials from Google Cloud Secret Manager"
      );
      return credentials;
    } catch (error) {
      console.error("Failed to load credentials from Secret Manager:", error);
      throw error;
    }
  }

  /**
   * Initialize the Salesforce updater
   * @param {Object} config - Salesforce configuration
   */
  async initialize(config) {
    this.updater = new SalesforceUpdater(config);
    await this.updater.initialize();
  }

  /**
   * Execute the complete update workflow
   * @param {Object|Array} updates - Update data (key-value pairs or array)
   * @param {string} objectType - Salesforce object type (if using key-value pairs)
   * @param {Object} options - Processing and export options
   * @returns {Promise<Object>} Complete workflow results
   */
  async executeUpdateWorkflow(updates, objectType = null, options = {}) {
    const { batchSize = 5, delayMs = 100, exportOptions = {} } = options;

    try {
      console.log("🚀 Starting Salesforce update workflow...");

      // Process updates
      let results;
      if (Array.isArray(updates)) {
        // Array of update objects
        results = await this.updater.processUpdates(updates, {
          batchSize,
          delayMs,
        });
      } else if (typeof updates === "object" && objectType) {
        // Key-value pairs
        results = await this.updater.processKeyValueUpdates(
          objectType,
          updates,
          { batchSize, delayMs }
        );
      } else {
        throw new Error(
          "Invalid update data format. Provide either an array of update objects or key-value pairs with objectType."
        );
      }

      // Export results to CSV
      const exportResults = await CSVExporter.exportUpdateResults(
        results,
        exportOptions
      );

      const workflowResults = {
        updateResults: results,
        exportResults: exportResults,
        workflow: {
          startTime: new Date().toISOString(),
          totalDuration: "calculated_by_caller",
          success: true,
        },
      };

      console.log("🎉 Workflow completed successfully!");
      console.log(
        `📊 Summary: ${results.successful} successful, ${results.failed} failed (${results.successRate})`
      );
      console.log(`📁 Files exported: ${exportResults.files.length}`);

      return workflowResults;
    } catch (error) {
      console.error("❌ Workflow failed:", error);
      throw error;
    }
  }
}

/**
 * Example usage function
 */
async function exampleUsage() {
  try {
    // Configuration - in production, load from Google Cloud Secret Manager
    const config = {
      clientId: process.env.SF_CLIENT_ID,
      clientSecret: process.env.SF_CLIENT_SECRET,
      username: process.env.SF_USERNAME,
      password: process.env.SF_PASSWORD,
      securityToken: process.env.SF_SECURITY_TOKEN,
      loginUrl: process.env.SF_LOGIN_URL || "https://login.salesforce.com",
    };

    // Or load from Google Cloud Secret Manager:
    // const orchestrator = new SalesforceUpdateOrchestrator();
    // const config = await orchestrator.loadCredentialsFromSecrets('your-project-id', 'salesforce-creds');

    const orchestrator = new SalesforceUpdateOrchestrator();
    await orchestrator.initialize(config);

    // Example 1: Key-value pairs approach
    console.log("\n=== Example 1: Key-Value Pairs ===");
    const keyValueUpdates = {
      "0031234567890ABC": {
        Name: "Updated Account Name 1",
        Phone: "555-0001",
        BillingCity: "San Francisco",
      },
      "0031234567890DEF": {
        Name: "Updated Account Name 2",
        Phone: "555-0002",
        BillingCity: "New York",
      },
    };

    await orchestrator.executeUpdateWorkflow(keyValueUpdates, "Account", {
      batchSize: 3,
      delayMs: 200,
      exportOptions: {
        outputDir: "./exports/accounts",
        baseFilename: "account_updates",
      },
    });

    // Example 2: Array approach with mixed object types
    console.log("\n=== Example 2: Mixed Object Array ===");
    const arrayUpdates = [
      {
        objectType: "Contact",
        recordId: "0031234567890GHI",
        updateData: {
          FirstName: "John",
          LastName: "Updated",
          Email: "john.updated@example.com",
        },
        metadata: { source: "data_migration", batch: "batch_1" },
      },
      {
        objectType: "Opportunity",
        recordId: "0061234567890JKL",
        updateData: {
          Name: "Updated Opportunity",
          StageName: "Closed Won",
          CloseDate: "2025-12-31",
        },
        metadata: { source: "crm_sync", priority: "high" },
      },
    ];

    await orchestrator.executeUpdateWorkflow(arrayUpdates, null, {
      batchSize: 2,
      delayMs: 150,
      exportOptions: {
        outputDir: "./exports/mixed",
        baseFilename: "mixed_updates",
        separateFiles: false, // Single file for all results
      },
    });

    console.log("✅ All examples completed successfully!");
  } catch (error) {
    console.error("❌ Example execution failed:", error);
    process.exit(1);
  }
}

// Export the orchestrator for use in other modules
module.exports = SalesforceUpdateOrchestrator;

// Run example if this file is executed directly
if (require.main === module) {
  exampleUsage();
}
