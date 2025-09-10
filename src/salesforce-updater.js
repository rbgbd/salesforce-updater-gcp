// salesforce-updater.js
const axios = require('axios');
const SalesforceAuth = require('./salesforce-auth');

class SalesforceUpdater {
  constructor(authConfig) {
    this.auth = new SalesforceAuth(authConfig);
    this.successfulUpdates = [];
    this.failedUpdates = [];
    this.apiVersion = 'v58.0';
  }

  /**
   * Initialize authentication
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.auth.authenticate();
    console.log('🚀 Salesforce Updater initialized successfully');
  }

  /**
   * Update a single Salesforce record
   * @param {string} objectType - Salesforce object type (e.g., 'Account', 'Contact')
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
        headers: this.auth.getAuthHeaders()
      });

      const result = {
        success: true,
        recordId,
        objectType,
        updateData,
        metadata,
        timestamp: new Date().toISOString(),
        status: response.status
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
        status: error.response?.status || 'UNKNOWN'
      };

      this.failedUpdates.push(failureResult);
      console.error(`❌ Failed to update ${objectType} record ${recordId}:`, error.response?.data || error.message);
      
      return failureResult;
    }
  }

  /**
   * Process a list of record updates
   * @param {Array} updateList - Array of update objects with structure:
   *   [{ objectType, recordId, updateData, metadata? }, ...]
   * @param {Object} options - Processing options
   * @param {number} options.batchSize - Number of concurrent updates (default: 5)
   * @param {number} options.delayMs - Delay between batches in milliseconds (default: 100)
   * @returns {Promise<Object>} Processing results
   */
  async processUpdates(updateList, options = {}) {
    const { batchSize = 5, delayMs = 100 } = options;
    
    console.log(`🔄 Processing ${updateList.length} record updates in batches of ${batchSize}`);
    
    // Reset tracking arrays
    this.successfulUpdates = [];
    this.failedUpdates = [];

    // Process in batches to avoid rate limits
    for (let i = 0; i < updateList.length; i += batchSize) {
      const batch = updateList.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(updateList.length / batchSize);
      
      console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} records)`);
      
      // Process batch concurrently
      const batchPromises = batch.map(update => 
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
      successRate: ((this.successfulUpdates.length / updateList.length) * 100).toFixed(2) + '%'
    };

    console.log(`🏁 Update processing complete: ${results.successful} successful, ${results.failed} failed (${results.successRate} success rate)`);
    
    return results;
  }

  /**
   * Process key-value pairs for record updates
   * @param {string} objectType - Salesforce object type
   * @param {Object} keyValuePairs - Object where keys are record IDs and values are update data
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing results
   */
  async processKeyValueUpdates(objectType, keyValuePairs, options = {}) {
    const updateList = Object.entries(keyValuePairs).map(([recordId, updateData]) => ({
      objectType,
      recordId,
      updateData,
      metadata: { source: 'keyValuePairs' }
    }));

    return await this.processUpdates(updateList, options);
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
      successRate: this.successfulUpdates.length > 0 || this.failedUpdates.length > 0 
        ? ((this.successfulUpdates.length / (this.successfulUpdates.length + this.failedUpdates.length)) * 100).toFixed(2) + '%'
        : '0%',
      lastProcessed: this.successfulUpdates.length > 0 || this.failedUpdates.length > 0
        ? Math.max(
            ...[...this.successfulUpdates, ...this.failedUpdates].map(u => new Date(u.timestamp))
          )
        : null
    };
  }

  /**
   * Clear tracking data
   */
  clearHistory() {
    this.successfulUpdates = [];
    this.failedUpdates = [];
    console.log('📝 Update history cleared');
  }

  /**
   * Helper method to add delay
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SalesforceUpdater;