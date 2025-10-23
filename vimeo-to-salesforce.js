// vimeo-to-salesforce.js
require("dotenv").config();
const fs = require("fs").promises;
const SalesforceAuthJWT = require("./cloud/salesforce-auth-jwt");
const SalesforceUpdater = require("./salesforce-updater-enhanced");
const CSVExporter = require("./cloud/csv-exporter");

/**
 * Process Vimeo export and update Salesforce Work Orders
 */
class VimeoSalesforceIntegration {
  constructor(auth) {
    this.updater = new SalesforceUpdater(auth);
    this.fieldMapping = this.getDefaultFieldMapping();
  }

  /**
   * Define how Vimeo fields map to Salesforce fields
   * CUSTOMIZE THIS based on your actual field names
   */
  getDefaultFieldMapping() {
    return {
      // Vimeo field → Salesforce field
      embedUrl: "Video_Link_Vimeo__c",
      reviewPage: "Vimeo_Downloadable_Link__c",
      created: "Date_Delivered__c",
    };
  }

  /**
   * Set custom field mapping
   * @param {Object} mapping - Custom field mapping object
   */
  setFieldMapping(mapping) {
    this.fieldMapping = { ...this.fieldMapping, ...mapping };
  }

  /**
   * Read Vimeo data from CSV file
   * @param {string} filePath - Path to CSV file
   * @returns {Promise<Array>} Array of parsed records
   */
  async readCSV(filePath) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.trim().split("\n");

      if (lines.length < 2) {
        throw new Error("CSV file is empty or has no data rows");
      }

      // Parse header
      const headers = lines[0]
        .split(",")
        .map((h) => h.trim().replace(/^"|"$/g, ""));

      // Parse data rows
      const records = [];
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        const record = {};

        headers.forEach((header, index) => {
          record[header] = values[index] || "";
        });

        records.push(record);
      }

      console.log(`📄 Loaded ${records.length} records from CSV`);
      return records;
    } catch (error) {
      console.error("❌ Failed to read CSV:", error.message);
      throw error;
    }
  }

  /**
   * Parse a CSV line handling quoted values
   * @param {string} line - CSV line
   * @returns {Array} Array of values
   */
  parseCSVLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  /**
   * Read Vimeo data from JSON file
   * @param {string} filePath - Path to JSON file
   * @returns {Promise<Array>} Array of records
   */
  async readJSON(filePath) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(content);

      // Handle both array format and {data: [...]} format
      const records = Array.isArray(data) ? data : data.data || [];

      console.log(`📄 Loaded ${records.length} records from JSON`);
      return records;
    } catch (error) {
      console.error("❌ Failed to read JSON:", error.message);
      throw error;
    }
  }

  /**
   * Transform Vimeo record to Salesforce update format
   * @param {Object} vimeoRecord - Vimeo data record
   * @param {string} workOrderIdentifier - Field name in Vimeo data that contains Work Order name
   * @returns {Object} Transformed record for Salesforce update
   */
  transformRecord(vimeoRecord, workOrderIdentifier = "work_order_name") {
    const workOrderName = vimeoRecord[workOrderIdentifier];

    if (!workOrderName) {
      throw new Error(
        `Work Order identifier '${workOrderIdentifier}' not found in Vimeo record`
      );
    }

    // Build update data using field mapping
    const updateData = {};

    // Get today's date in YYYY-MM-DD format (Salesforce date format)
    const today = new Date();
    const todayFormatted = `${today.getFullYear()}-${(today.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${today.getDate().toString().padStart(2, "0")}`;

    for (const [vimeoField, salesforceField] of Object.entries(
      this.fieldMapping
    )) {
      if (
        vimeoRecord[vimeoField] !== undefined &&
        vimeoRecord[vimeoField] !== ""
      ) {
        let value = vimeoRecord[vimeoField];

        // If this is a date field in Salesforce, use today's date instead
        if (salesforceField.toLowerCase().includes("date")) {
          value = todayFormatted;
        }

        updateData[salesforceField] = value;
      }
    }

    return {
      workOrderNumber: workOrderName,
      updateData: updateData,
      metadata: {
        source: "vimeo_export",
        processedAt: new Date().toISOString(),
        originalRecord: vimeoRecord,
      },
    };
  }

  /**
   * Process Vimeo export file and update Salesforce
   * @param {string} filePath - Path to Vimeo export file (CSV or JSON)
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing results
   */
  async processVimeoExport(filePath, options = {}) {
    const {
      workOrderIdentifier = "work_order_name",
      batchSize = 5,
      delayMs = 100,
      dryRun = false,
      exportResults = true,
      exportDir = "./exports",
    } = options;

    try {
      console.log("=".repeat(70));
      console.log("📹 VIMEO TO SALESFORCE INTEGRATION");
      console.log("=".repeat(70));

      // 1. Read Vimeo data
      console.log(`\n📂 Reading file: ${filePath}`);

      let vimeoRecords;
      if (filePath.endsWith(".json")) {
        vimeoRecords = await this.readJSON(filePath);
      } else if (filePath.endsWith(".csv")) {
        vimeoRecords = await this.readCSV(filePath);
      } else {
        throw new Error("Unsupported file format. Use .csv or .json");
      }

      console.log(`✅ Loaded ${vimeoRecords.length} Vimeo records`);

      // 2. Transform records
      console.log("\n🔄 Transforming records...");

      const updates = [];
      const transformErrors = [];

      for (const [index, record] of vimeoRecords.entries()) {
        try {
          const transformed = this.transformRecord(record, workOrderIdentifier);
          updates.push(transformed);
        } catch (error) {
          transformErrors.push({
            index,
            record,
            error: error.message,
          });
        }
      }

      console.log(`✅ Transformed ${updates.length} records`);

      if (transformErrors.length > 0) {
        console.log(
          `⚠️  ${transformErrors.length} records failed transformation:`
        );
        transformErrors.forEach((err) => {
          console.log(`   Row ${err.index + 1}: ${err.error}`);
        });
      }

      if (updates.length === 0) {
        console.log("\n❌ No valid records to process");
        return {
          totalRecords: vimeoRecords.length,
          transformed: 0,
          transformErrors: transformErrors.length,
          processed: 0,
        };
      }

      // 3. Dry run - show what would be updated
      if (dryRun) {
        console.log("\n🔍 DRY RUN - No updates will be made");
        console.log("Sample transformed records:");
        updates.slice(0, 3).forEach((update, i) => {
          console.log(`\n${i + 1}. Work Order: ${update.workOrderNumber}`);
          console.log(
            "   Updates:",
            JSON.stringify(update.updateData, null, 2)
          );
        });

        return {
          dryRun: true,
          totalRecords: vimeoRecords.length,
          transformed: updates.length,
          transformErrors: transformErrors.length,
          sampleUpdates: updates.slice(0, 5),
        };
      }

      // 4. Process updates
      console.log("\n📤 Processing Salesforce updates...");
      const results = await this.updater.processWorkOrderUpdates(updates, {
        batchSize,
        delayMs,
      });

      // 5. Export results to CSV
      if (exportResults) {
        console.log("\n📊 Exporting results...");
        const exportResult = await CSVExporter.exportUpdateResults(results, {
          outputDir: exportDir,
          baseFilename: "vimeo_salesforce_sync",
          separateFiles: true,
          includeTimestamp: true,
        });

        console.log(`✅ Results exported to ${exportDir}`);
      }

      // 6. Final summary
      console.log("\n" + "=".repeat(70));
      console.log("📊 PROCESSING SUMMARY");
      console.log("=".repeat(70));
      console.log(`Total Vimeo Records: ${vimeoRecords.length}`);
      console.log(`Successfully Transformed: ${updates.length}`);
      console.log(`Transform Errors: ${transformErrors.length}`);
      console.log(`Salesforce Updates - Success: ${results.successful}`);
      console.log(`Salesforce Updates - Failed: ${results.failed}`);
      console.log(`Success Rate: ${results.successRate}`);
      console.log("=".repeat(70));

      return {
        totalRecords: vimeoRecords.length,
        transformed: updates.length,
        transformErrors: transformErrors.length,
        salesforceResults: results,
        summary: {
          success: results.successful,
          failed: results.failed,
          successRate: results.successRate,
        },
      };
    } catch (error) {
      console.error("\n❌ Processing failed:", error.message);
      throw error;
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    // 1. Authenticate with Salesforce
    console.log("🔐 Authenticating with Salesforce...");
    const auth = new SalesforceAuthJWT({
      clientId: process.env.SF_CLIENT_ID,
      username: process.env.SF_USERNAME,
      privateKeyPath: process.env.SF_PRIVATE_KEY_PATH,
      loginUrl:
        process.env.SF_LOGIN_URL ||
        "https://realitybasedgroup.my.salesforce.com",
    });

    await auth.authenticate();
    console.log("✅ Authentication successful!\n");

    // 2. Initialize integration
    const integration = new VimeoSalesforceIntegration(auth);

    // 3. Customize field mapping if needed
    // integration.setFieldMapping({
    //   'custom_vimeo_field': 'Custom_Salesforce_Field__c'
    // });

    // 4. Process Vimeo export
    // REPLACE './vimeo-export.csv' with your actual file path
    const results = await integration.processVimeoExport("./vimeo-export.csv", {
      workOrderIdentifier: "WO#", // Field in CSV that contains Work Order name
      batchSize: 5,
      delayMs: 100,
      dryRun: false, // Set to true to test without making updates
      exportResults: true,
      exportDir: "./exports",
    });

    console.log("\n✅ Integration complete!");
  } catch (error) {
    console.error("\n❌ Integration failed:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = VimeoSalesforceIntegration;
