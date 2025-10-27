// sassie-uploader.js
require("dotenv").config();
const axios = require("axios");

/**
 * Upload data to SASSIE survey via Cint/SASSIE API
 */
class SassieUploader {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.SASSIE_API_KEY;
    this.apiUrl = config.apiUrl || process.env.SASSIE_API_URL || "https://www.cint.com/survey-api";
    this.accountCode = config.accountCode || process.env.SASSIE_ACCOUNT_CODE;
    
    if (!this.apiKey) {
      throw new Error("SASSIE_API_KEY is required");
    }
  }

  /**
   * Create base64 encoded authentication string
   * @param {string} username - SASSIE username or API key
   * @param {string} password - SASSIE password (can be empty for some APIs)
   * @returns {string} Base64 encoded auth string
   */
  createAuthHeader(username = this.apiKey, password = "") {
    const credentials = `${username}:${password}`;
    return `Basic ${Buffer.from(credentials).toString("base64")}`;
  }

  /**
   * Upload a single SASSIE ID record
   * @param {Object} record - Record with sassieId and associated data
   * @param {number} record.sassieId - SASSIE Survey ID
   * @param {number} record.sassieSurveyId - Survey ID from Project
   * @param {number} record.sassieVideoQID - Video QID
   * @param {number} record.sassieDownloadQID - Download Video QID
   * @param {string} record.workOrderName - Work Order Name
   * @returns {Promise<Object>} Upload result
   */
  async uploadRecord(record) {
    try {
      console.log(`📤 Uploading record for SASSIE ID: ${record.sassieId}`);

      // Prepare the data payload
      // CUSTOMIZE this based on your SASSIE API requirements
      const payload = {
        surveyId: record.sassieSurveyId || record.sassieId,
        respondentId: record.sassieId,
        data: {
          workOrder: record.workOrderName,
          workOrderNumber: record.workOrderNumber,
          videoQID: record.sassieVideoQID,
          downloadQID: record.sassieDownloadQID,
          timestamp: new Date().toISOString(),
        },
      };

      // Option 1: JSON payload (most common)
      const response = await axios.post(
        `${this.apiUrl}/dataLoad`, // Adjust endpoint as needed
        payload,
        {
          headers: {
            Authorization: this.createAuthHeader(),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          timeout: 30000,
        }
      );

      console.log(`✅ Successfully uploaded SASSIE ID: ${record.sassieId}`);
      
      return {
        success: true,
        sassieId: record.sassieId,
        workOrderName: record.workOrderName,
        response: response.data,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      console.error(`❌ Failed to upload SASSIE ID: ${record.sassieId}`);
      console.error(`   Error: ${error.message}`);

      return {
        success: false,
        sassieId: record.sassieId,
        workOrderName: record.workOrderName,
        error: error.response?.data || error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Upload data using base64-encoded format (alternative method)
   * Some SASSIE APIs require base64 encoded CSV or JSON
   * @param {Object} record - Record to upload
   * @returns {Promise<Object>} Upload result
   */
  async uploadRecordBase64(record) {
    try {
      console.log(`📤 Uploading record (base64) for SASSIE ID: ${record.sassieId}`);

      // Create CSV-style data
      const csvData = [
        "respondent_id,work_order,video_qid,download_qid",
        `${record.sassieId},${record.workOrderName},${record.sassieVideoQID},${record.sassieDownloadQID}`
      ].join("\n");

      // Encode to base64
      const base64Data = Buffer.from(csvData).toString("base64");

      const payload = {
        surveyId: record.sassieSurveyId || record.sassieId,
        format: "csv",
        data: base64Data,
      };

      const response = await axios.post(
        `${this.apiUrl}/dataLoad`,
        payload,
        {
          headers: {
            Authorization: this.createAuthHeader(),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          timeout: 30000,
        }
      );

      console.log(`✅ Successfully uploaded (base64) SASSIE ID: ${record.sassieId}`);

      return {
        success: true,
        sassieId: record.sassieId,
        workOrderName: record.workOrderName,
        response: response.data,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      console.error(`❌ Failed to upload (base64) SASSIE ID: ${record.sassieId}`);
      console.error(`   Error: ${error.message}`);

      return {
        success: false,
        sassieId: record.sassieId,
        workOrderName: record.workOrderName,
        error: error.response?.data || error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Upload multiple records in batch
   * @param {Array} records - Array of SASSIE records
   * @param {Object} options - Upload options
   * @param {number} options.batchSize - Number of concurrent uploads
   * @param {number} options.delayMs - Delay between batches
   * @param {boolean} options.useBase64 - Use base64 encoding method
   * @returns {Promise<Object>} Batch upload results
   */
  async uploadBatch(records, options = {}) {
    const { batchSize = 3, delayMs = 500, useBase64 = false } = options;

    console.log("=".repeat(70));
    console.log("📤 UPLOADING TO SASSIE");
    console.log("=".repeat(70));
    console.log(`Total Records: ${records.length}`);
    console.log(`Batch Size: ${batchSize}`);
    console.log(`Method: ${useBase64 ? "Base64 CSV" : "JSON"}`);
    console.log("=".repeat(70));

    const results = {
      successful: [],
      failed: [],
    };

    // Process in batches
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(records.length / batchSize);

      console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} records)`);

      // Upload batch concurrently
      const uploadMethod = useBase64 ? this.uploadRecordBase64.bind(this) : this.uploadRecord.bind(this);
      const batchPromises = batch.map((record) => uploadMethod(record));

      const batchResults = await Promise.all(batchPromises);

      // Categorize results
      batchResults.forEach((result) => {
        if (result.success) {
          results.successful.push(result);
        } else {
          results.failed.push(result);
        }
      });

      // Add delay between batches
      if (i + batchSize < records.length && delayMs > 0) {
        console.log(`⏳ Waiting ${delayMs}ms before next batch...`);
        await this.delay(delayMs);
      }
    }

    // Display summary
    console.log("\n" + "=".repeat(70));
    console.log("📊 UPLOAD COMPLETE");
    console.log("=".repeat(70));
    console.log(`Total Processed: ${records.length}`);
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Success Rate: ${((results.successful.length / records.length) * 100).toFixed(2)}%`);
    console.log("=".repeat(70));

    return results;
  }

  /**
   * Delay helper
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test SASSIE API connection
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    try {
      console.log("🔍 Testing SASSIE API connection...");
      
      // Adjust endpoint based on your SASSIE API
      const response = await axios.get(`${this.apiUrl}/status`, {
        headers: {
          Authorization: this.createAuthHeader(),
          Accept: "application/json",
        },
        timeout: 10000,
      });

      console.log("✅ SASSIE API connection successful!");
      console.log(`   Status: ${response.data.status || "OK"}`);
      
      return true;
    } catch (error) {
      console.error("❌ SASSIE API connection failed");
      console.error(`   Error: ${error.message}`);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Data: ${JSON.stringify(error.response.data)}`);
      }
      
      return false;
    }
  }
}

module.exports = SassieUploader;
