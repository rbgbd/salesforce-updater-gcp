const SalesforceAuthJWT = require("./salesforce-auth-jwt");

const auth = new SalesforceAuthJWT({
  clientId: process.env.SF_CLIENT_ID,
  username: process.env.SF_USERNAME,
  privateKeyPath: process.env.SF_PRIVATE_KEY_PATH,
  loginUrl: process.env.SF_LOGIN_URL,
});

await auth.authenticate();
