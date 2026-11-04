=== RGS Ledger Payment Gateway for WooCommerce ===
Contributors: rgsledger
Tags: woocommerce, payment gateway, upi, qr code, gpay, phonepe, paytm, credit card, netbanking, india
Requires at least: 5.8
Tested up to: 8.8
Stable tag: 1.0.0
License: MIT

Accept UPI QR, UPI Intent (GPay, PhonePe, Paytm, BHIM), Cards, and NetBanking payments securely using RGS Ledger.

== Description ==

RGS Ledger Payment Gateway for WooCommerce seamlessly connects your WordPress store with RGS Ledger's fintech payment engine.

= Features =
* Direct UPI Intent deep-linking (Google Pay, PhonePe, Paytm, BHIM)
* Dynamic Real-time UPI QR Code with auto-polling
* Credit & Debit Cards (Visa, Mastercard, RuPay)
* NetBanking across all major Indian banks
* Automated double-entry refund processing from the WooCommerce dashboard
* Replay-protected HMAC-SHA256 asynchronous webhook synchronization

== Installation ==

1. Upload the plugin files to the `/wp-content/plugins/rgs-ledger-woocommerce` directory, or install the plugin through the WordPress plugins screen directly.
2. Activate the plugin through the 'Plugins' screen in WordPress.
3. Go to WooCommerce -> Settings -> Payments -> RGS Ledger.
4. Enable the gateway and enter your RGS Ledger API Secret Key (`rl_test_sk_...` or `rl_live_sk_...`) and Webhook Secret (`whsec_...`).
5. Configure your webhook endpoint in the RGS Ledger Merchant Dashboard: `https://yourstore.com/?wc-api=wc_gateway_rgs_ledger`.
6. Save changes and start accepting payments.
