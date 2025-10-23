// cloud/index.js
const functions = require("@google-cloud/functions-framework");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const { Storage } = require("@google-cloud/storage");
const SalesforceAuthJWT = require("./salesforce-auth-jwt");
const SalesforceUpdater = require("./salesforce-updater");
const CSVExporter = require("./csv-exporter");
const path = require("path");

const secretManager = new SecretManagerServiceClient();
const storage = new Storage();

/**
 * Get private key from Secret Manager
 */
async function getPrivateKey() {
  const [version] = await secretManager.accessSecretVersion({
    name: `projects/${process.env.GOOGLE_CLOUD_PROJECT}/secrets/salesforce-private-key/versions/latest`,
  });
  return version.payload.data.toString("utf8");
}

/**
 * Main HTTP Cloud Function for Salesforce updates
 */
functions.http("salesforceUpdater", async (req, res) => {
  // CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).send();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      message: "This function only accepts POST requests",
    });
  }

  const startTime = new Date();

  try {
    console.log("🚀 Salesforce update request received");

    const { updates, objectType, options = {} } = req.body;

    if (!updates) {
      return res.status(400).json({
        error: "Invalid request",
        message: 'Request must include "updates" array or object',
      });
    }

    // Get private key from Secret Manager
    console.log("📥 Loading private key from Secret Manager...");
    const privateKey = await getPrivateKey();

    // Authenticate with JWT (no user interaction!)
    console.log("🔐 Authenticating with Salesforce...");
    const auth = new SalesforceAuthJWT({
      clientId: process.env.SF_CLIENT_ID,
      username: process.env.SF_USERNAME,
      privateKey: privateKey,
      loginUrl: process.env.SF_LOGIN_URL,
    });

    await auth.authenticate();

    // Initialize updater
    const updater = new SalesforceUpdater(auth);

    // Process updates
    console.log("📝 Processing updates...");
    let results;
    if (Array.isArray(updates)) {
      results = await updater.processUpdates(updates, options);
    } else if (objectType) {
      results = await updater.processKeyValueUpdates(
        objectType,
        updates,
        options
      );
    } else {
      throw new Error("Invalid update format");
    }

    // Export to CSV if requested
    let exportResults = null;
    if (options.exportToCsv !== false) {
      exportResults = await CSVExporter.exportUpdateResults(results, {
        outputDir: "/tmp/exports",
        baseFilename: `update_${Date.now()}`,
      });

      // Upload to Cloud Storage if bucket specified
      if (process.env.STORAGE_BUCKET && exportResults.files.length > 0) {
        console.log("📤 Uploading files to Cloud Storage...");
        const bucket = storage.bucket(process.env.STORAGE_BUCKET);

        for (const file of exportResults.files) {
          const destination = `salesforce-updates/${
            new Date().toISOString().split("T")[0]
          }/${path.basename(file.path)}`;
          await bucket.upload(file.path, { destination });
          console.log(`✅ Uploaded ${destination}`);
        }
      }
    }

    const endTime = new Date();
    const duration = endTime - startTime;

    console.log(`✅ Update completed in ${duration}ms`);

    res.status(200).json({
      success: true,
      timestamp: endTime.toISOString(),
      duration: `${duration}ms`,
      summary: {
        totalProcessed: results.totalProcessed,
        successful: results.successful,
        failed: results.failed,
        successRate: results.successRate,
      },
      files: exportResults?.files.map((f) => ({
        type: f.type,
        records: f.records,
      })),
    });
  } catch (error) {
    console.error("❌ Function execution failed:", error);

    const endTime = new Date();
    const duration = endTime - startTime;

    res.status(500).json({
      success: false,
      timestamp: endTime.toISOString(),
      duration: `${duration}ms`,
      error: error.message,
    });
  }
});

/**
 * Pub/Sub triggered function for scheduled updates
 */
functions.cloudEvent("scheduledSalesforceUpdate", async (cloudEvent) => {
  console.log("🕒 Scheduled update triggered");

  try {
    const message = cloudEvent.data.message;
    const data = message?.data
      ? JSON.parse(Buffer.from(message.data, "base64").toString())
      : {};

    // Get private key
    const privateKey = await getPrivateKey();

    // Authenticate
    const auth = new SalesforceAuthJWT({
      clientId: process.env.SF_CLIENT_ID,
      username: process.env.SF_USERNAME,
      privateKey: privateKey,
      loginUrl: process.env.SF_LOGIN_URL,
    });

    await auth.authenticate();

    // Process updates
    const updater = new SalesforceUpdater(auth);
    const results = await updater.processUpdates(data.updates || []);

    console.log(
      `✅ Scheduled update completed: ${results.successful} successful, ${results.failed} failed`
    );
  } catch (error) {
    console.error("❌ Scheduled update failed:", error);
    throw error;
  }
});
