# Ecommerce Integrations Architecture

## 1. WooCommerce / WordPress Gateway Plugin
Located in `integrations/woocommerce/`.

### Architecture
- Extends WooCommerce core `WC_Payment_Gateway` class.
- Flow:
  1. Customer selects "RGS Ledger" at WooCommerce checkout.
  2. Plugin initiates order via RGS Ledger API (`POST /orders`).
  3. Generates short-lived checkout session (`POST /checkout/sessions`).
  4. Customer redirects to RGS Ledger Hosted Checkout.
  5. Upon capture, RGS Ledger delivers an asynchronous HMAC-SHA256 signed webhook (`payment.succeeded`) to `/?wc-api=wc_gateway_rgs_ledger`.
  6. Plugin verifies the cryptographic signature and marks WooCommerce order as `Processing` or `Completed`.
  7. Automated refunds initiated in WooCommerce invoke `POST /refunds` on RGS Ledger.

---

## 2. Shopify Payment App Integration
Located in `integrations/shopify/`.

### Architecture
- Complies with the Shopify Payments Apps API specification.
- Uses GraphQL mutations:
  - `paymentSessionResolve` when customer completes transaction.
  - `paymentSessionReject` when customer cancels or bank declines.
- Flow:
  1. Shopify initiates an offsite payment redirect request to `https://checkout.rgsledger.com/pay`.
  2. RGS Ledger Hosted Checkout renders UPI QR, UPI intent buttons, or Card payment.
  3. Upon verification, RGS Ledger backend issues `paymentSessionResolve` mutation to Shopify's GraphQL endpoint using the merchant access token.
  4. Customer is redirected back to Shopify's order confirmation page.

### Regulatory & Partner Approval Boundary
Shopify strictly restricts live payment processing to authorized payment partners who have completed commercial agreements with Shopify. The Shopify adapter architecture is implemented and ready for partner authorization.
