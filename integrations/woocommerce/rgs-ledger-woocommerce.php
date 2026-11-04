<?php
/**
 * Plugin Name: RGS Ledger Payment Gateway for WooCommerce
 * Plugin URI: https://rgsledger.com
 * Description: Accept UPI QR, UPI Intent (GPay, PhonePe, Paytm, BHIM), Cards, and NetBanking payments securely using RGS Ledger.
 * Version: 1.0.0
 * Author: RGS Ledger Fintech Team
 * Author URI: https://rgsledger.com
 * Text Domain: rgs-ledger-woocommerce
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * WC requires at least: 5.0
 * WC tested up to: 8.8
 */

if (!defined('ABSPATH')) {
    exit;
}

define('RGS_LEDGER_VERSION', '1.0.0');
define('RGS_LEDGER_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('RGS_LEDGER_PLUGIN_URL', plugin_dir_url(__FILE__));

// Hook into WooCommerce gateway registration
add_filter('woocommerce_payment_gateways', 'rgs_ledger_add_gateway_class');

function rgs_ledger_add_gateway_class($gateways) {
    $gateways[] = 'WC_Gateway_RGS_Ledger';
    return $gateways;
}

add_action('plugins_loaded', 'rgs_ledger_init_gateway_class');

function rgs_ledger_init_gateway_class() {
    if (!class_exists('WC_Payment_Gateway')) {
        return;
    }

    require_once RGS_LEDGER_PLUGIN_DIR . 'includes/class-rgs-ledger-api.php';
    require_once RGS_LEDGER_PLUGIN_DIR . 'includes/class-wc-gateway-rgs-ledger.php';
}
