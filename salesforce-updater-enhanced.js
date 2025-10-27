// salesforce-updater-enhanced.js
const axios = require("axios");
const SalesforceAuthJWT = require("./cloud/salesforce-auth-jwt");

class SalesforceUpdater {
  constructor(authInstance) {
    // Accept an already-authenticated instance
    this.auth = authInstance;
    this.successfulUpdates = [];
    this.failedUpdates = [];
    this.apiVersion = "v58.0";
  }

  /**
   * Query Salesforce records using SOQL
   * @param {string} soqlQuery - SOQL query string
   * @returns {Promise<Array>} Query results
   */
  async query(soqlQuery) {
    try {
      await this.auth.ensureAuthenticated();

      const queryUrl = `${this.auth.instanceUrl}/services/data/${this.apiVersion}/query`;

      const response = await axios.get(queryUrl, {
        headers: this.auth.getAuthHeaders(),
        params: { q: soqlQuery },
      });

      console.log(`📊 Query returned ${response.data.totalSize} records`);
      return response.data.records;
    } catch (error) {
      console.error("❌ Query failed:", error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Look up a Work Order by Work Order Number (Name field)
   * @param {string} workOrderNumber - The Work Order Number field value (stored in Name field)
   * @returns {Promise<Object|null>} Work Order record or null if not found
   */
  async lookupWorkOrderByNumber(workOrderNumber) {
    try {
      // Escape single quotes in the work order number for SOQL
      const escapedNumber = workOrderNumber.replace(/'/g, "\\'");

      const soql = `SELECT Id, Name, SASSIE_ID__c, Related_Project__r.SASSIE_Survey_ID__c, Related_Project__r.Video_QID__c, Related_Project__r.Download_Video_QID__c  FROM Work_Order__c WHERE Name = '${escapedNumber}' LIMIT 1`;

      console.log(`🔍 Looking up Work Order: ${workOrderNumber}`);
      const results = await this.query(soql);

      if (results.length === 0) {
        console.log(`⚠️  Work Order not found: ${workOrderNumber}`);
        return null;
      }

      console.log(`✅ Found Work Order: ${results[0].Id} (${results[0].Name})`);
      return results[0];
    } catch (error) {
      console.error(
        `❌ Failed to lookup Work Order ${workOrderNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Update a Work Order by Work Order Number (looks up the record first)
   * @param {string} workOrderNumber - The Work Order Number to find
   * @param {Object} updateData - Object containing fields to update
   * @param {Object} metadata - Additional metadata to track with the update
   * @returns {Promise<Object>} Update result
   */
  async updateWorkOrderByNumber(workOrderNumber, updateData, metadata = {}) {
    try {
      // First, look up the Work Order
      const workOrder = await this.lookupWorkOrderByNumber(workOrderNumber);

      if (!workOrder) {
        const failureResult = {
          success: false,
          workOrderNumber,
          recordId: null,
          objectType: "Work_Order__c",
          updateData,
          metadata,
          timestamp: new Date().toISOString(),
          error: "Work Order not found",
          status: "NOT_FOUND",
        };

        this.failedUpdates.push(failureResult);
        return failureResult;
      }

      // Now update the record using the found ID
      return await this.updateRecord(
        "Work_Order__c",
        workOrder.Id,
        updateData,
        {
          ...metadata,
          workOrderNumber,
          workOrderName: workOrder.Name,
          sassieId: workOrder.SASSIE_ID__c,
          sassieSurveyName: workOrder.Related_Project__r?.SASSIE_Survey_Name__c,
          sassieSurveyId: Related_Project__r?.SASSIE_Survey_ID__c,
          sassieVideoQID: Related_Project__r?.Video_QID__c,
          sassieDownloadQID: Related_Project__r?.Download_Video_QID__c,
        }
      );
    } catch (error) {
      const failureResult = {
        success: false,
        workOrderNumber,
        recordId: null,
        objectType: "Work_Order__c",
        updateData,
        metadata,
        timestamp: new Date().toISOString(),
        error: error.response?.data || error.message,
        status: error.response?.status || "ERROR",
      };

      this.failedUpdates.push(failureResult);
      console.error(
        `❌ Failed to update Work Order ${workOrderNumber}:`,
        error.message
      );
      return failureResult;
    }
  }

  /**
   * Update a single Salesforce record by ID
   * @param {string} objectType - Salesforce object type (e.g., 'Account', 'Work_Order__c')
   * @param {string} recordId - Salesforce record ID
   * @param {Object} updateData - Object containing fields to update
   * @param {Object} metadata - Additional metadata to track with the update
   * @returns {Promise<Object>} Update result
   */
  async updateRecord(objectType, recordId, updateData, metadata = {}) {
    try {
      await this.auth.ensureAuthenticated();

      const updateUrl = `${this.auth.instanceUrl}/services/data/${this.apiVersion}/sobjects/${objectType}/${recordId}`;

      const response = await axios.patch(updateUrl, updateData, {
        headers: this.auth.getAuthHeaders(),
      });

      const result = {
        success: true,
        recordId,
        objectType,
        updateData,
        metadata,
        timestamp: new Date().toISOString(),
        status: response.status,
      };

      this.successfulUpdates.push(result);
      console.log(`✅ Updated ${objectType} record: ${recordId}`);

      return result;
    } catch (error) {
      const failureResult = {
        success: false,
        recordId,
        objectType,
        updateData,
        metadata,
        timestamp: new Date().toISOString(),
        error: error.response?.data || error.message,
        status: error.response?.status || "UNKNOWN",
      };

      this.failedUpdates.push(failureResult);
      console.error(
        `❌ Failed to update ${objectType} record ${recordId}:`,
        error.response?.data || error.message
      );

      return failureResult;
    }
  }

  /**
   * Process a batch of Work Order updates using Work Order Numbers
   * @param {Array} updateList - Array of objects with structure:
   *   [{ workOrderNumber, updateData, metadata? }, ...]
   * @param {Object} options - Processing options
   * @param {number} options.batchSize - Number of concurrent updates (default: 5)
   * @param {number} options.delayMs - Delay between batches in milliseconds (default: 100)
   * @returns {Promise<Object>} Processing results
   */
  async processWorkOrderUpdates(updateList, options = {}) {
    const { batchSize = 5, delayMs = 100 } = options;

    console.log(
      `🔄 Processing ${updateList.length} Work Order updates in batches of ${batchSize}`
    );

    // Reset tracking arrays
    this.successfulUpdates = [];
    this.failedUpdates = [];

    // Process in batches to avoid rate limits
    for (let i = 0; i < updateList.length; i += batchSize) {
      const batch = updateList.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(updateList.length / batchSize);

      console.log(
        `📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} records)`
      );

      // Process batch concurrently
      const batchPromises = batch.map((update) =>
        this.updateWorkOrderByNumber(
          update.workOrderNumber,
          update.updateData,
          update.metadata
        )
      );

      await Promise.all(batchPromises);

      // Add delay between batches to respect rate limits
      if (i + batchSize < updateList.length && delayMs > 0) {
        await this.delay(delayMs);
      }
    }

    const results = {
      totalProcessed: updateList.length,
      successful: this.successfulUpdates.length,
      failed: this.failedUpdates.length,
      successfulUpdates: this.successfulUpdates,
      failedUpdates: this.failedUpdates,
      successRate:
        ((this.successfulUpdates.length / updateList.length) * 100).toFixed(2) +
        "%",
    };

    console.log(
      `🏁 Update processing complete: ${results.successful} successful, ${results.failed} failed (${results.successRate} success rate)`
    );

    return results;
  }

  /**
   * Process a list of record updates (original method for direct ID updates)
   * @param {Array} updateList - Array of update objects with structure:
   *   [{ objectType, recordId, updateData, metadata? }, ...]
   * @param {Object} options - Processing options
   * @param {number} options.batchSize - Number of concurrent updates (default: 5)
   * @param {number} options.delayMs - Delay between batches in milliseconds (default: 100)
   * @returns {Promise<Object>} Processing results
   */
  async processUpdates(updateList, options = {}) {
    const { batchSize = 5, delayMs = 100 } = options;

    console.log(
      `🔄 Processing ${updateList.length} record updates in batches of ${batchSize}`
    );

    // Reset tracking arrays
    this.successfulUpdates = [];
    this.failedUpdates = [];

    // Process in batches to avoid rate limits
    for (let i = 0; i < updateList.length; i += batchSize) {
      const batch = updateList.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(updateList.length / batchSize);

      console.log(
        `📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} records)`
      );

      // Process batch concurrently
      const batchPromises = batch.map((update) =>
        this.updateRecord(
          update.objectType,
          update.recordId,
          update.updateData,
          update.metadata
        )
      );

      await Promise.all(batchPromises);

      // Add delay between batches to respect rate limits
      if (i + batchSize < updateList.length && delayMs > 0) {
        await this.delay(delayMs);
      }
    }

    const results = {
      totalProcessed: updateList.length,
      successful: this.successfulUpdates.length,
      failed: this.failedUpdates.length,
      successfulUpdates: this.successfulUpdates,
      failedUpdates: this.failedUpdates,
      successRate:
        ((this.successfulUpdates.length / updateList.length) * 100).toFixed(2) +
        "%",
    };

    console.log(
      `🏁 Update processing complete: ${results.successful} successful, ${results.failed} failed (${results.successRate} success rate)`
    );

    return results;
  }

  /**
   * Get processing statistics
   * @returns {Object} Current processing statistics
   */
  getStats() {
    return {
      totalProcessed: this.successfulUpdates.length + this.failedUpdates.length,
      successful: this.successfulUpdates.length,
      failed: this.failedUpdates.length,
      successRate:
        this.successfulUpdates.length > 0 || this.failedUpdates.length > 0
          ? (
              (this.successfulUpdates.length /
                (this.successfulUpdates.length + this.failedUpdates.length)) *
              100
            ).toFixed(2) + "%"
          : "0%",
      lastProcessed:
        this.successfulUpdates.length > 0 || this.failedUpdates.length > 0
          ? Math.max(
              ...[...this.successfulUpdates, ...this.failedUpdates].map(
                (u) => new Date(u.timestamp)
              )
            )
          : null,
    };
  }

  /**
   * Clear tracking data
   */
  clearHistory() {
    this.successfulUpdates = [];
    this.failedUpdates = [];
    console.log("📝 Update history cleared");
  }

  /**
   * Helper method to add delay
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = SalesforceUpdater;
