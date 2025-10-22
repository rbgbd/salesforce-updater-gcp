#!/bin/bash
# generate-keys.sh
# Helper script to generate certificate and private key for JWT Bearer flow

echo "🔐 Generating Salesforce JWT Certificate and Private Key"
echo "=========================================================="
echo ""

# Check if OpenSSL is installed
if ! command -v openssl &> /dev/null; then
    echo "❌ Error: OpenSSL is not installed"
    echo "Please install OpenSSL first:"
    echo "  - Ubuntu/Debian: sudo apt-get install openssl"
    echo "  - macOS: brew install openssl"
    echo "  - Windows: Download from https://slproweb.com/products/Win32OpenSSL.html"
    exit 1
fi

echo "✅ OpenSSL found: $(openssl version)"
echo ""

# Generate private key
echo "📝 Step 1: Generating private key..."
openssl genrsa -out salesforce-private.key 2048
echo "✅ Private key created: salesforce-private.key"
echo ""

# Generate CSR
echo "📝 Step 2: Generating certificate signing request..."
echo "   (You can press Enter to accept defaults for all prompts)"
openssl req -new -key salesforce-private.key -out salesforce.csr
echo "✅ CSR created: salesforce.csr"
echo ""

# Generate self-signed certificate
echo "📝 Step 3: Generating self-signed certificate (valid 1 year)..."
openssl x509 -req -days 365 -in salesforce.csr -signkey salesforce-private.key -out salesforce.crt
echo "✅ Certificate created: salesforce.crt"
echo ""

# Display certificate info
echo "📋 Certificate Information:"
echo "=========================================================="
openssl x509 -in salesforce.crt -text -noout | head -20
echo ""

# Create .gitignore reminder
echo "# Add to .gitignore" > .gitignore-reminder
echo "salesforce-private.key" >> .gitignore-reminder
echo "*.key" >> .gitignore-reminder

echo "=========================================================="
echo "🎉 Done! Files created:"
echo "   ✅ salesforce-private.key - KEEP SECRET! Store securely"
echo "   ✅ salesforce.crt - Upload this to Salesforce"
echo "   ✅ salesforce.csr - Can delete this"
echo ""
echo "⚠️  IMPORTANT: Add 'salesforce-private.key' to your .gitignore!"
echo ""
echo "📋 Next Steps:"
echo "   1. Go to: Setup → App Manager → Your App → Edit"
echo "   2. Enable 'Use digital signatures'"
echo "   3. Upload salesforce.crt"
echo "   4. Save"
echo ""
echo "   Then test with: node test-jwt-auth.js"
echo "=========================================================="
