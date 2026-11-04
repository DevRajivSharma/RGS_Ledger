<?php
/**
 * RGS Ledger WooCommerce Gateway Class
 */

if (!defined('ABSPATH')) {
    exit;
}

class WC_Gateway_RGS_Ledger extends WC_Payment_Gateway {
    private $api;

    public function __construct() {
        $this->id                 = 'rgs_ledger';
        $this->icon               = '';
        $this->has_fields         = false;
        $this->method_title       = __('RGS Ledger', 'rgs-ledger-woocommerce');
        $this->method_description = __('Accept UPI (Google Pay, PhonePe, Paytm, BHIM, QR), Cards, and NetBanking payments with instant reconciliation.', 'rgs-ledger-woocommerce');

        $this->supports = ['products', 'refunds'];

        $this->init_form_fields();
        $this->init_settings();

        $this->title       = $this->get_option('title');
        $this->description = $this->get_option('description');
        $this->enabled     = $this->get_option('enabled');
        $this->api_key_secret = $this->get_option('api_key_secret');
        $this->webhook_secret = $this->get_option('webhook_secret');
        $this->sandbox     = 'yes' === $this->get_option('sandbox');

        $this->api = new RGS_Ledger_API($this->api_key_secret, $this->sandbox);

        add_action('woocommerce_update_options_payment_gateways_' . $this->id, [$this, 'process_admin_options']);
        add_action('woocommerce_api_wc_gateway_rgs_ledger', [$this, 'webhook_handler']);
    }

    public function init_form_fields() {
        $this->form_fields = [
            'enabled' => [
                'title'   => __('Enable/Disable', 'rgs-ledger-woocommerce'),
                'type'    => 'checkbox',
                'label'   => __('Enable RGS Ledger Payment Gateway', 'rgs-ledger-woocommerce'),
                'default' => 'yes'
            ],
            'title' => [
                'title'       => __('Title', 'rgs-ledger-woocommerce'),
                'type'        => 'text',
                'description' => __('This controls the payment method title shown during checkout.', 'rgs-ledger-woocommerce'),
                'default'     => __('UPI / Cards / NetBanking (RGS Ledger)', 'rgs-ledger-woocommerce'),
                'desc_tip'    => true
            ],
            'description' => [
                'title'       => __('Description', 'rgs-ledger-woocommerce'),
                'type'        => 'textarea',
                'description' => __('Payment method description shown during checkout.', 'rgs-ledger-woocommerce'),
                'default'     => __('Pay securely via UPI QR, GPay, PhonePe, Paytm, Credit/Debit Cards, or NetBanking.', 'rgs-ledger-woocommerce')
            ],
            'sandbox' => [
                'title'   => __('Sandbox Mode', 'rgs-ledger-woocommerce'),
                'type'    => 'checkbox',
                'label'   => __('Enable Sandbox Mode (Test transactions)', 'rgs-ledger-woocommerce'),
                'default' => 'yes'
            ],
            'api_key_secret' => [
                'title'       => __('API Secret Key', 'rgs-ledger-woocommerce'),
                'type'        => 'password',
                'description' => __('Your RGS Ledger secret key (e.g. rl_test_sk_... or rl_live_sk_...).', 'rgs-ledger-woocommerce'),
                'default'     => ''
            ],
            'webhook_secret' => [
                'title'       => __('Webhook Signing Secret', 'rgs-ledger-woocommerce'),
                'type'        => 'password',
                'description' => __('Webhook signing secret (whsec_...) for HMAC signature verification.', 'rgs-ledger-woocommerce'),
                'default'     => ''
            ]
        ];
    }

    public function process_payment($order_id) {
        $order = wc_get_order($order_id);

        // Convert total amount to integer paise (₹100.50 -> 10050 paise)
        $amount_paise = round($order->get_total() * 100);

        // 1. Create order on RGS Ledger
        $rgs_order = $this->api->create_order($amount_paise, (string) $order_id, [
            'name'  => $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(),
            'email' => $order->get_billing_email(),
            'phone' => $order->get_billing_phone()
        ]);

        if (empty($rgs_order['success']) || empty($rgs_order['data']['_id'])) {
            wc_add_notice(__('Unable to initiate payment with RGS Ledger. ' . ($rgs_order['error']['message'] ?? ''), 'rgs-ledger-woocommerce'), 'error');
            return;
        }

        $rgs_order_id = $rgs_order['data']['_id'];
        $order->update_meta_data('_rgs_order_id', $rgs_order_id);
        $order->save();

        // 2. Generate Hosted Checkout Session
        $success_url = $this->get_return_url($order);
        $cancel_url  = $order->get_cancel_order_url();

        $session = $this->api->create_checkout_session($rgs_order_id, $success_url, $cancel_url);

        if (empty($session['success']) || empty($session['data']['checkoutUrl'])) {
            wc_add_notice(__('Unable to create checkout session.', 'rgs-ledger-woocommerce'), 'error');
            return;
        }

        return [
            'result'   => 'success',
            'redirect' => $session['data']['checkoutUrl']
        ];
    }

    public function process_refund($order_id, $amount = null, $reason = '') {
        $order = wc_get_order($order_id);
        $payment_id = $order->get_meta('_rgs_payment_id');

        if (!$payment_id) {
            return new WP_Error('rgs_error', __('No RGS Ledger Payment ID found for this order.', 'rgs-ledger-woocommerce'));
        }

        $amount_paise = round($amount * 100);
        $res = $this->api->process_refund($payment_id, $amount_paise, $reason ?: 'WooCommerce admin refund');

        if (!empty($res['success'])) {
            $order->add_order_note(sprintf(__('Refund of %s processed via RGS Ledger. Refund ID: %s', 'rgs-ledger-woocommerce'), wc_price($amount), $res['data']['_id']));
            return true;
        }

        return new WP_Error('rgs_error', $res['error']['message'] ?? __('Refund failed.', 'rgs-ledger-woocommerce'));
    }

    /**
     * Webhook Handler - Idempotently updates order when payment.succeeded is received
     */
    public function webhook_handler() {
        $raw_body = file_get_contents('php://input');
        $sig_header = $_SERVER['HTTP_X_RGS_SIGNATURE'] ?? '';

        if (empty($sig_header) || empty($raw_body)) {
            status_header(400);
            exit('Missing signature or body');
        }

        // Verify HMAC-SHA256 signature
        parse_str(str_replace(',', '&', $sig_header), $parts);
        $timestamp = $parts['t'] ?? 0;
        $v1        = $parts['v1'] ?? '';

        $expected_sig = hash_hmac('sha256', $timestamp . '.' . $raw_body, $this->webhook_secret);

        if (!hash_equals($expected_sig, $v1)) {
            status_header(400);
            exit('Invalid signature');
        }

        $event = json_decode($raw_body, true);
        if ($event && $event['event'] === 'payment.succeeded') {
            $order_id = $event['data']['receipt'] ?? null;
            if ($order_id) {
                $order = wc_get_order($order_id);
                if ($order && !$order->is_paid()) {
                    $order->update_meta_data('_rgs_payment_id', $event['data']['paymentId']);
                    $order->payment_complete($event['data']['paymentId']);
                    $order->add_order_note(sprintf(__('Payment verified and completed via RGS Ledger Webhook. Payment ID: %s', 'rgs-ledger-woocommerce'), $event['data']['paymentId']));
                }
            }
        }

        status_header(200);
        exit('OK');
    }
}
