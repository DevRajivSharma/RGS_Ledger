/**
 * Shopify Payments App Extension Adapter
 * Implements Shopify Payments Apps API GraphQL mutations:
 * - paymentSessionResolve
 * - paymentSessionReject
 *
 * NOTE: As per Shopify specifications, public deployment as a live third-party
 * payment provider requires direct commercial approval and partner contract with Shopify.
 */

export interface ShopifyPaymentSessionRequest {
  id: string; // Shopify Payment Session ID (gid://shopify/PaymentSession/...)
  gid: string;
  amount: string; // Decimal string e.g. "499.00"
  currency: string;
  test: boolean;
  payment_method: {
    type: string;
  };
  customer: {
    email: string;
    phone_number?: string;
  };
}

export class ShopifyPaymentAdapter {
  private shopifyShop: string;
  private accessToken: string;

  constructor(shopifyShop: string, accessToken: string) {
    this.shopifyShop = shopifyShop;
    this.accessToken = accessToken;
  }

  /**
   * Resolves payment session in Shopify when customer successfully completes payment
   */
  async resolvePaymentSession(paymentSessionId: string, rgsPaymentId: string): Promise<boolean> {
    const mutation = `
      mutation PaymentSessionResolve($id: ID!) {
        paymentSessionResolve(id: $id) {
          paymentSession {
            id
            status {
              code
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await fetch(`https://${this.shopifyShop}/payments_apps/api/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.accessToken
        },
        body: JSON.stringify({
          query: mutation,
          variables: { id: paymentSessionId }
        })
      });

      const json = await response.json();
      return !json.errors && (!json.data?.paymentSessionResolve?.userErrors?.length);
    } catch {
      return false;
    }
  }

  /**
   * Rejects payment session in Shopify when payment is declined or expired
   */
  async rejectPaymentSession(paymentSessionId: string, reasonCode: string, message: string): Promise<boolean> {
    const mutation = `
      mutation PaymentSessionReject($id: ID!, $reason: PaymentSessionRejectionReasonInput!) {
        paymentSessionReject(id: $id, reason: $reason) {
          paymentSession {
            id
            status {
              code
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await fetch(`https://${this.shopifyShop}/payments_apps/api/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.accessToken
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            id: paymentSessionId,
            reason: { code: 'PROCESSING_ERROR', merchantMessage: message }
          }
        })
      });

      const json = await response.json();
      return !json.errors && (!json.data?.paymentSessionReject?.userErrors?.length);
    } catch {
      return false;
    }
  }
}
