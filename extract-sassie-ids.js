// extract-sassie-ids.js
const fs = require("fs").promises;

/**
 * Extract SASSIE IDs from Vimeo sync results for pushing to SASSIE
 */
async function extractSassieIds(successfulUpdatesFile) {
  try {
    console.log("=".repeat(70));
    console.log("📋 EXTRACTING SASSIE IDs FROM SYNC RESULTS");
    console.log("=".repeat(70));

    // Read the successful updates CSV
    const content = await fs.readFile(successfulUpdatesFile, "utf8");
    const lines = content.trim().split("\n");

    if (lines.length < 2) {
      console.log("⚠️  No successful updates found in file");
      return [];
    }

    // Parse CSV
    const headers = lines[0]
      .split(",")
      .map((h) => h.trim().replace(/^"|"$/g, ""));
    const metadataIndex = headers.indexOf("metadata");

    if (metadataIndex === -1) {
      throw new Error("Metadata column not found in CSV");
    }

    const sassieData = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const metadataStr = values[metadataIndex];

      try {
        // Parse the metadata JSON
        const metadata = JSON.parse(metadataStr);

        if (metadata.sassieId) {
          sassieData.push({
            workOrderName: metadata.workOrderName,
            workOrderNumber: metadata.workOrderNumber,
            sassieId: metadata.sassieId,
            sassieSurveyName: metadata.sassieSurveyName || null,
            recordId: values[headers.indexOf("recordId")],
            timestamp: values[headers.indexOf("timestamp")],
          });
        }
      } catch (parseError) {
        console.log(`⚠️  Could not parse metadata for row ${i + 1}`);
      }
    }

    console.log(
      `\n✅ Found ${sassieData.length} Work Orders with SASSIE IDs\n`
    );

    // Display the data
    console.log("=".repeat(70));
    console.log("SASSIE IDs READY FOR PUSH");
    console.log("=".repeat(70));

    sassieData.forEach((item, index) => {
      console.log(`\n${index + 1}. Work Order: ${item.workOrderName}`);
      console.log(`   SASSIE ID: ${item.sassieId}`);
      console.log(`   Survey Name: ${item.sassieSurveyName || "N/A"}`);
      console.log(`   Salesforce Record ID: ${item.recordId}`);
    });

    // Export to JSON for easy use
    const outputFile = successfulUpdatesFile.replace(
      ".csv",
      "_sassie_ids.json"
    );
    await fs.writeFile(outputFile, JSON.stringify(sassieData, null, 2), "utf8");

    console.log("\n" + "=".repeat(70));
    console.log(`✅ Exported SASSIE IDs to: ${outputFile}`);
    console.log("=".repeat(70));

    return sassieData;
  } catch (error) {
    console.error("\n❌ Failed to extract SASSIE IDs:", error.message);
    throw error;
  }
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line) {
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

// Run if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node extract-sassie-ids.js <successful-updates-csv>");
    console.log("");
    console.log("Example:");
    console.log(
      "  node extract-sassie-ids.js ./exports/vimeo_salesforce_sync_successful_2024-10-23T10-30-00.csv"
    );
    process.exit(1);
  }

  const filePath = args[0];

  extractSassieIds(filePath)
    .then((data) => {
      console.log(`\n🎉 Ready to push ${data.length} records to SASSIE!`);
      process.exit(0);
    })
    .catch((error) => {
      process.exit(1);
    });
}

module.exports = extractSassieIds;
