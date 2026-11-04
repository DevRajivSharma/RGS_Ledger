<?php
/**
 * RGS Ledger API Client for WooCommerce
 */

if (!defined('ABSPATH')) {
    exit;
}

class RGS_Ledger_API {
    private $api_key_secret;
    private $base_url;

    public function __construct($api_key_secret, $sandbox = true) {
        $this->api_key_secret = trim($api_key_secret);
        $this->base_url = 'http://localhost:4000/api/v1';
    }

    public function request($endpoint, $method = 'POST', $data = []) {
        $url = $this->base_url . $endpoint;

        $args = [
            'method'  => $method,
            'headers' => [
                'Content-Type'  => 'application/json',
                'Authorization' => 'Bearer ' . $this->api_key_secret,
                'x-api-key'     => $this->api_key_secret
            ],
            'timeout' => 20
        ];

        if ($method === 'POST' || $method === 'PATCH') {
            $args['body'] = json_encode($data);
        }

        $response = wp_remote_request($url, $args);

        if (is_wp_error($response)) {
            return [
                'success' => false,
                'error'   => ['message' => $response->get_error_message()]
            ];
        }

        $body = wp_remote_retrieve_body($response);
        return json_decode($body, true);
    }

    public function create_order($amount_paise, $receipt, $customer = []) {
        return $this->request('/orders', 'POST', [
            'amount'   => (int) $amount_paise,
            'currency' => 'INR',
            'receipt'  => $receipt,
            'customer' => $customer
        ]);
    }

    public function create_checkout_session($order_id, $success_url, $cancel_url) {
        return $this->request('/checkout/sessions', 'POST', [
            'orderId'    => $order_id,
            'successUrl' => $success_url,
            'cancelUrl'  => $cancel_url
        ]);
    }

    public function process_refund($payment_id, $amount_paise, $reason) {
        return $this->request('/refunds', 'POST', [
            'paymentId' => $payment_id,
            'amount'    => (int) $amount_paise,
            'reason'    => $reason
        ]);
    }
}
