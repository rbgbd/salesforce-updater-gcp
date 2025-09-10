// csv-exporter.js
const fs = require('fs').promises;
const path = require('path');

class CSVExporter {
  /**
   * Convert array of objects to CSV string
   * @param {Array} data - Array of objects to convert
   * @param {Array} columns - Optional array of column names to include
   * @returns {string} CSV formatted string
   */
  static arrayToCSV(data, columns = null) {
    if (!data || data.length === 0) {
      return '';
    }

    // Get columns from first object if not provided
    const headers = columns || Object.keys(data[0]);
    
    // Create CSV header row
    const csvHeader = headers.map(header => CSVExporter.escapeCSVValue(header)).join(',');
    
    // Create CSV data rows
    const csvRows = data.map(row => {
      return headers.map(header => {
        let value = row[header];
        
        // Handle nested objects by stringifying them
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        
        // Handle null/undefined values
        if (value === null || value === undefined) {
          value = '';
        }
        
        return CSVExporter.escapeCSVValue(String(value));
      }).join(',');
    });
    
    return [csvHeader, ...csvRows].join('\n');
  }

  /**
   * Escape CSV values (handle commas, quotes, newlines)
   * @param {string} value - Value to escape
   * @returns {string} Escaped CSV value
   */
  static escapeCSVValue(value) {
    // If value contains comma, quote, or newline, wrap in quotes and escape existing quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Export Salesforce update results to CSV files
   * @param {Object} updateResults - Results from SalesforceUpdater.processUpdates()
   * @param {Object} options - Export options
   * @param {string} options.outputDir - Directory to save CSV files (default: './exports')
   * @param {string} options.baseFilename - Base filename (default: 'salesforce_updates')
   * @param {boolean} options.separateFiles - Create separate files for success/failure (default: true)
   * @param {boolean} options.includeTimestamp - Include timestamp in filename (default: true)
   * @returns {Promise<Object>} Export results with file paths
   */
  static async exportUpdateResults(updateResults, options = {}) {
    const {
      outputDir = './exports',
      baseFilename = 'salesforce_updates',
      separateFiles = true,
      includeTimestamp = true
    } = options;

    // Create output directory if it doesn't exist
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create output directory:', error);
      throw error;
    }

    const timestamp = includeTimestamp ? `_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}` : '';
    const exportResults = {
      files: [],
      totalRecords: 0,
      summary: updateResults
    };

    try {
      if (separateFiles) {
        // Export successful updates
        if (updateResults.successfulUpdates.length > 0) {
          const successFile = path.join(outputDir, `${baseFilename}_successful${timestamp}.csv`);
          const successColumns = [
            'recordId', 'objectType', 'timestamp', 'status',
            'updateData', 'metadata'
          ];
          
          const successCSV = CSVExporter.arrayToCSV(updateResults.successfulUpdates, successColumns);
          await fs.writeFile(successFile, successCSV, 'utf8');
          
          exportResults.files.push({
            type: 'successful',
            path: successFile,
            records: updateResults.successfulUpdates.length
          });
          
          console.log(`✅ Exported ${updateResults.successfulUpdates.length} successful updates to: ${successFile}`);
        }

        // Export failed updates
        if (updateResults.failedUpdates.length > 0) {
          const failedFile = path.join(outputDir, `${baseFilename}_failed${timestamp}.csv`);
          const failedColumns = [
            'recordId', 'objectType', 'timestamp', 'status', 'error',
            'updateData', 'metadata'
          ];
          
          const failedCSV = CSVExporter.arrayToCSV(updateResults.failedUpdates, failedColumns);
          await fs.writeFile(failedFile, failedCSV, 'utf8');
          
          exportResults.files.push({
            type: 'failed',
            path: failedFile,
            records: updateResults.failedUpdates.length
          });
          
          console.log(`❌ Exported ${updateResults.failedUpdates.length} failed updates to: ${failedFile}`);
        }

      } else {
        // Export all updates to single file
        const allUpdates = [
          ...updateResults.successfulUpdates.map(u => ({...u, result: 'success'})),
          ...updateResults.failedUpdates.map(u => ({...u, result: 'failed'}))
        ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        if (allUpdates.length > 0) {
          const allFile = path.join(outputDir, `${baseFilename}_all${timestamp}.csv`);
          const allColumns = [
            'result', 'recordId', 'objectType', 'timestamp', 'status',
            'updateData', 'metadata', 'error'
          ];
          
          const allCSV = CSVExporter.arrayToCSV(allUpdates, allColumns);
          await fs.writeFile(allFile, allCSV, 'utf8');
          
          exportResults.files.push({
            type: 'all',
            path: allFile,
            records: allUpdates.length
          });
          
          console.log(`📄 Exported ${allUpdates.length} total updates to: ${allFile}`);
        }
      }

      // Export summary file
      const summaryFile = path.join(outputDir, `${baseFilename}_summary${timestamp}.csv`);
      const summaryData = [{
        timestamp: new Date().toISOString(),
        totalProcessed: updateResults.totalProcessed,
        successful: updateResults.successful,
        failed: updateResults.failed,
        successRate: updateResults.successRate,
        files: exportResults.files.map(f => f.path).join('; ')
      }];
      
      const summaryCSV = CSVExporter.arrayToCSV(summaryData);
      await fs.writeFile(summaryFile, summaryCSV, 'utf8');
      
      exportResults.files.push({
        type: 'summary',
        path: summaryFile,
        records: 1
      });

      exportResults.totalRecords = exportResults.files.reduce((sum, file) => sum + file.records, 0);
      
      console.log(`📊 Export complete! ${exportResults.files.length} files created with ${exportResults.totalRecords} total records.`);
      
      return exportResults;

    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  }

  /**
   * Export custom data to CSV
   * @param {Array} data - Array of objects to export
   * @param {string} filePath - Full path for the output file
   * @param {Array} columns - Optional array of column names
   * @returns {Promise<Object>} Export result
   */
  static async exportCustomData(data, filePath, columns = null) {
    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      const csvContent = CSVExporter.arrayToCSV(data, columns);
      await fs.writeFile(filePath, csvContent, 'utf8');

      console.log(`📁 Exported ${data.length} records to: ${filePath}`);
      
      return {
        success: true,
        filePath,
        records: data.length,
        size: csvContent.length
      };

    } catch (error) {
      console.error('Custom export failed:', error);
      throw error;
    }
  }
}

module.exports = CSVExporter;