// Create test-password.js
require("dotenv").config();

console.log("=== Password Test ===");
console.log("Password from env:", JSON.stringify(process.env.SF_PASSWORD));
console.log("Password length:", process.env.SF_PASSWORD?.length || 0);
console.log("Has apostrophe:", process.env.SF_PASSWORD?.includes("'") || false);
console.log("Has spaces:", process.env.SF_PASSWORD?.includes(" ") || false);

// Show the combined password + token that gets sent to Salesforce
if (process.env.SF_PASSWORD && process.env.SF_SECURITY_TOKEN) {
  const combined = process.env.SF_PASSWORD + process.env.SF_SECURITY_TOKEN;
  console.log("Combined password + token length:", combined.length);
} else {
  console.log("❌ Missing password or security token");
}
