// describe-work-orders.js
require("dotenv").config();
const SalesforceAuthJWT = require("./cloud/salesforce-auth-jwt");
const axios = require("axios");

/**
 * Describe the Work_Order__c object to see available fields
 */
async function describeWorkOrders() {
  try {
    console.log("=".repeat(70));
    console.log("🔍 DESCRIBING WORK_ORDERS__C OBJECT");
    console.log("=".repeat(70));

    // Authenticate
    const auth = new SalesforceAuthJWT({
      clientId: process.env.SF_CLIENT_ID,
      username: process.env.SF_USERNAME,
      privateKeyPath: process.env.SF_PRIVATE_KEY_PATH,
      loginUrl:
        process.env.SF_LOGIN_URL ||
        "https://realitybasedgroup.my.salesforce.com",
    });

    await auth.authenticate();

    // Describe the object
    const describeUrl = `${auth.instanceUrl}/services/data/v58.0/sobjects/Work_Order__c/describe`;

    console.log("\n📡 Fetching object metadata...\n");

    const response = await axios.get(describeUrl, {
      headers: auth.getAuthHeaders(),
    });

    const objectMetadata = response.data;

    console.log("📋 Object Information:");
    console.log(`   Label: ${objectMetadata.label}`);
    console.log(`   API Name: ${objectMetadata.name}`);
    console.log(`   Updateable: ${objectMetadata.updateable}`);
    console.log(`   Total Fields: ${objectMetadata.fields.length}`);

    console.log("\n" + "=".repeat(70));
    console.log("📝 UPDATEABLE FIELDS");
    console.log("=".repeat(70));

    // Filter and display updateable fields
    const updateableFields = objectMetadata.fields
      .filter((field) => field.updateable)
      .sort((a, b) => a.label.localeCompare(b.label));

    console.log(`\nFound ${updateableFields.length} updateable fields:\n`);

    updateableFields.forEach((field, index) => {
      console.log(
        `${(index + 1).toString().padStart(3)}. ${field.label.padEnd(
          40
        )} | API: ${field.name.padEnd(40)} | Type: ${field.type}`
      );

      // Show picklist values if applicable
      if (field.type === "picklist" && field.picklistValues.length > 0) {
        const values = field.picklistValues
          .filter((v) => v.active)
          .map((v) => v.value)
          .join(", ");
        console.log(`       Values: ${values}`);
      }
    });

    // Show some common fields you might want to update
    console.log("\n" + "=".repeat(70));
    console.log("💡 COMMONLY UPDATED FIELDS (EXAMPLES)");
    console.log("=".repeat(70));

    const commonFields = [
      "Status__c",
      "Description__c",
      "Notes__c",
      "Completion_Date__c",
      "Assigned_To__c",
    ];

    commonFields.forEach((fieldName) => {
      const field = objectMetadata.fields.find((f) => f.name === fieldName);
      if (field) {
        console.log(`\n✓ ${field.label} (${field.name})`);
        console.log(`  Type: ${field.type}`);
        console.log(`  Updateable: ${field.updateable}`);
        if (field.type === "picklist") {
          const values = field.picklistValues
            .filter((v) => v.active)
            .map((v) => v.value);
          console.log(`  Values: ${values.join(", ")}`);
        }
      }
    });

    // Show Work Order Number field details
    console.log("\n" + "=".repeat(70));
    console.log("🔢 WORK ORDER NUMBER FIELD");
    console.log("=".repeat(70));

    const woNumberField = objectMetadata.fields.find(
      (f) => f.name === "Work_Order_Number__c"
    );
    if (woNumberField) {
      console.log(`\n✓ ${woNumberField.label} (${woNumberField.name})`);
      console.log(`  Type: ${woNumberField.type}`);
      console.log(`  Unique: ${woNumberField.unique}`);
      console.log(`  External ID: ${woNumberField.externalId}`);
    }

    console.log("\n" + "=".repeat(70));
    console.log("✅ Description complete!");
    console.log("=".repeat(70));
  } catch (error) {
    console.error("\n❌ Failed to describe Work_Order__c:");
    console.error(error.message);

    if (error.response) {
      console.error("\nSalesforce API Response:");
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the description
describeWorkOrders();
