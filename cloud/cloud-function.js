// cloud-function.js - Google Cloud Function implementation
const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const SalesforceUpdateOrchestrator = require('./main-example');
const path = require('path');
const fs = require('fs').promises;

// Initialize Google Cloud Storage
const storage = new Storage();

/**
 * Google Cloud Function for handling Salesforce updates
 * HTTP triggered function that accepts update requests
 */
functions.http('salesforceUpdateHandler', async (req, res) => {
  // Set CORS headers for web requests
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).send();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'This function only accepts POST requests'
    });
  }

  const startTime = new Date();
  
  try {
    console.log('🚀 Salesforce update request received');
    
    // Validate request body
    const { updates, objectType, options = {}, config } = req.body;
    
    if (!updates || (!Array.isArray(updates) && typeof updates !== 'object')) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Request must include "updates" as array or object'
      });
    }

    // Configuration options
    const {
      projectId = process.env.GOOGLE_CLOUD_PROJECT,
      secretName = 'salesforce-credentials',
      bucketName = process.env.STORAGE_BUCKET,
      useSecretManager = !config,
      ...processingOptions
    } = options;

    // Initialize orchestrator
    const orchestrator = new SalesforceUpdateOrchestrator();
    
    // Load configuration
    let sfConfig;
    if (useSecretManager) {
      sfConfig = await orchestrator.loadCredentialsFromSecrets(projectId, secretName);
    } else if (config) {
      sfConfig = config;
    } else {
      // Fallback to environment variables
      sfConfig = {
        clientId: process.env.SF_CLIENT_ID,
        clientSecret: process.env.SF_CLIENT_SECRET,
        username: process.env.SF_USERNAME,
        password: process.env.SF_PASSWORD,
        securityToken: process.env.SF_SECURITY_TOKEN,
        loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
      };
    }

    // Validate configuration
    const requiredFields = ['clientId', 'clientSecret', 'username', 'password', 'securityToken'];
    const missingFields = requiredFields.filter(field => !sfConfig[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Configuration incomplete',
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Initialize and execute workflow
    await orchestrator.initialize(sfConfig);
    
    const workflowResults = await orchestrator.executeUpdateWorkflow(
      updates, 
      objectType, 
      {
        ...processingOptions,
        exportOptions: {
          outputDir: '/tmp/exports', // Cloud Functions temp directory
          baseFilename: `cf_update_${Date.now()}`,
          ...processingOptions.exportOptions
        }
      }
    );

    // Upload CSV files to Google Cloud Storage if bucket is provided
    let storageResults = null;
    if (bucketName && workflowResults.exportResults.files.length > 0) {
      console.log(`📤 Uploading ${workflowResults.exportResults.files.length} files to Cloud Storage...`);
      
      storageResults = await uploadFilesToStorage(
        bucketName, 
        workflowResults.exportResults.files,
        `salesforce-updates/${new Date().toISOString().slice(0, 10)}/`
      );
    }

    // Calculate duration
    const endTime = new Date();
    const duration = endTime - startTime;

    // Prepare response
    const response = {
      success: true,
      timestamp: endTime.toISOString(),
      duration: `${duration}ms`,
      summary: {
        totalProcessed: workflowResults.updateResults.totalProcessed,
        successful: workflowResults.updateResults.successful,
        failed: workflowResults.updateResults.failed,
        successRate: workflowResults.updateResults.successRate
      },
      files: workflowResults.exportResults.files.map(f => ({
        type: f.type,
        localPath: f.path,
        records: f.records
      })),
      storage: storageResults,
      details: {
        successfulUpdates: workflowResults.updateResults.successfulUpdates,
        failedUpdates: workflowResults.updateResults.failedUpdates
      }
    };

    console.log(`✅ Function completed successfully in ${duration}ms`);
    res.status(200).json(response);

  } catch (error) {
    console.error('❌ Function execution failed:', error);
    
    const endTime = new Date();
    const duration = endTime - startTime;
    
    res.status(500).json({
      success: false,
      timestamp: endTime.toISOString(),
      duration: `${duration}ms`,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Upload generated CSV files to Google Cloud Storage
 * @param {string} bucketName - GCS bucket name
 * @param {Array} files - Array of file objects from CSV export
 * @param {string} prefix - Storage path prefix
 * @returns {Promise<Array>} Upload results
 */
async function uploadFilesToStorage(bucketName, files, prefix = '') {
  const bucket = storage.bucket(bucketName);
  const uploadResults = [];

  for (const file of files) {
    try {
      const fileName = path.basename(file.path);
      const destination = `${prefix}${fileName}`;
      
      // Upload file
      await bucket.upload(file.path, {
        destination: destination,
        metadata: {
          contentType: 'text/csv',
          metadata: {
            type: file.type,
            records: file.records.toString(),
            timestamp: new Date().toISOString()
          }
        }
      });

      // Generate signed URL for download (valid for 1 hour)
      const [url] = await bucket.file(destination).getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000 // 1 hour
      });

      uploadResults.push({
        type: file.type,
        fileName: fileName,
        gcsPath: `gs://${bucketName}/${destination}`,
        downloadUrl: url,
        records: file.records
      });

      console.log(`📤 Uploaded ${fileName} to Cloud Storage`);

    } catch (error) {
      console.error(`Failed to upload ${file.path}:`, error);
      uploadResults.push({
        type: file.type,
        fileName: path.basename(file.path),
        error: error.message,
        records: file.records
      });
    }
  }

  return uploadResults;
}

/**
 * Pub/Sub triggered function for scheduled updates
 */
functions.cloudEvent('scheduledSalesforceUpdate', async (cloudEvent) => {
  console.log('🕒 Scheduled Salesforce update triggered');
  console.log('Event data:', JSON.stringify(cloudEvent.data));

  try {
    // Decode Pub/Sub message
    const message = cloudEvent.data.message;
    const data = message.data ? JSON.parse(Buffer.from(message.data, 'base64').toString()) : {};
    
    // Process scheduled update
    const orchestrator = new SalesforceUpdateOrchestrator();
    
    // Load config from Secret Manager
    const sfConfig = await orchestrator.loadCredentialsFromSecrets(
      process.env.GOOGLE_CLOUD_PROJECT,
      data.secretName || 'salesforce-credentials'
    );

    await orchestrator.initialize(sfConfig);
    
    // Execute updates based on message data
    const results = await orchestrator.executeUpdateWorkflow(
      data.updates,
      data.objectType,
      data.options || {}
    );

    console.log(`✅ Scheduled update completed: ${results.updateResults.successful} successful, ${results.updateResults.failed} failed`);

  } catch (error) {
    console.error('❌ Scheduled update failed:', error);
    throw error; // This will cause the Pub/Sub message to be retried
  }
});

// Export functions for testing
module.exports = {
  uploadFilesToStorage
};