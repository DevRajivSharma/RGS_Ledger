/**
 * Complete OpenAPI 3.0.3 Specification for RGS Ledger API
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'RGS Ledger Developer API',
    version: '1.0.0',
    description: `Production-oriented UPI QR payment evidence and verification platform.

### Core Philosophy
- **Non-Custodial**: Money flows directly from the payer's UPI application (GPay, PhonePe, Paytm, BHIM) to the merchant's bank account via standard NPCI UPI rails. RGS Ledger does not hold customer funds or maintain merchant wallets.
- **Dual-Source Evidence**: Payment \`SUCCESS\` signifies that both independent evidence channels (**Email bank alert** + **Android Companion in-device push notification**) have verified the same underlying bank transaction (UTR) and payment request.
- **Strict Tenant Isolation**: All resources are strictly scoped by \`merchantId\`. Cross-tenant access is forbidden.`,
    contact: {
      name: 'RGS Ledger Developer Support',
      email: 'support@rgsledger.com'
    }
  },
  servers: [
    {
      url: 'http://localhost:4000/api/v1',
      description: 'Local Development Server'
    },
    {
      url: 'https://api.rgsledger.com/api/v1',
      description: 'Production API Rail'
    }
  ],
  tags: [
    { name: 'Authentication', description: 'Merchant registration, login, and JWT session refresh' },
    { name: 'Developer Keys', description: 'API Key generation, rotation, and revocation' },
    { name: 'Payments', description: 'Creation, queries, and status transitions for UPI payment requests' },
    { name: 'Payment Links', description: 'Reusable and single-use payment links (fixed and open amount)' },
    { name: 'Public Checkout', description: 'Customer checkout sessions and link payment initiation' },
    { name: 'Webhooks', description: 'HMAC-signed webhook endpoints, deliveries, and test dispatch' },
    { name: 'Reconciliation', description: 'Dispute management and exception resolution' },
    { name: 'Health', description: 'Service health and status monitoring' }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'Your public API Key ID (e.g. `rgs_live_...` or `rgs_test_...`)'
      },
      ApiSecretAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Secret',
        description: 'Your private API Key secret (e.g. `rgs_sec_live_...` or `rgs_sec_test_...`)'
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Session access token acquired from `/auth/login`'
      }
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        required: ['success'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object' },
          message: { type: 'string', example: 'Operation completed successfully' },
          meta: {
            type: 'object',
            properties: {
              timestamp: { type: 'string', format: 'date-time' },
              requestId: { type: 'string' }
            }
          }
        }
      },
      ErrorEnvelope: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Amount must be at least 100 paise (₹1.00)' },
              details: { type: 'object' }
            }
          },
          meta: {
            type: 'object',
            properties: {
              timestamp: { type: 'string', format: 'date-time' }
            }
          }
        }
      },
      PaymentStatus: {
        type: 'string',
        enum: ['PENDING', 'PARTIAL_SUCCESS', 'SUCCESS', 'REVIEW_REQUIRED', 'EXPIRED', 'RECONCILIATION_REQUIRED', 'CANCELLED'],
        description: `Lifecycle statuses:
- \`PENDING\`: QR generated, awaiting payer transfer.
- \`PARTIAL_SUCCESS\`: Exactly ONE evidence source (Email OR Android notification) matched.
- \`SUCCESS\`: BOTH independent Email AND Android Companion evidence verified the same bank transaction.
- \`REVIEW_REQUIRED\`: Conflicting data detected (amount mismatch or contradictory info).
- \`EXPIRED\`: 15-minute payment window elapsed without confirmation.
- \`RECONCILIATION_REQUIRED\`: Evidence arrived after expiration or requires manual intervention.`
      },
      CreatePaymentRequest: {
        type: 'object',
        required: ['amountPaise', 'orderId'],
        properties: {
          amountPaise: { type: 'integer', minimum: 100, example: 50000, description: 'Amount in paise (50000 = ₹500.00)' },
          orderId: { type: 'string', minLength: 1, maxLength: 100, example: 'INV-2026-001', description: 'Unique merchant order identifier' },
          description: { type: 'string', maxLength: 255, example: 'Annual Web Hosting Subscription' },
          bankAccountId: { type: 'string', example: '674b0c7410f9b329c011e4f2', description: 'Optional specific collection bank account ObjectId' },
          expiresAt: { type: 'string', format: 'date-time', description: 'Custom expiration timestamp' },
          metadata: { type: 'object', example: { customerId: 'cust_9872' } }
        }
      },
      PaymentResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          orderId: { type: 'string' },
          amountPaise: { type: 'integer' },
          amountRupees: { type: 'number' },
          currency: { type: 'string', example: 'INR' },
          status: { $ref: '#/components/schemas/PaymentStatus' },
          upiUri: { type: 'string', example: 'upi://pay?pa=merchant@yespop&pn=Merchant&am=500.00&tr=INV-001&cu=INR' },
          qrDataUrl: { type: 'string', example: 'data:image/png;base64,...' },
          checkoutReference: { type: 'string', example: 'chk_9f81a7b82c1e4d2a' },
          checkoutUrl: { type: 'string', example: 'http://localhost:3002/?ref=chk_9f81a7b82c1e4d2a' },
          expiresAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          evidenceSummary: {
            type: 'object',
            properties: {
              hasEmailEvidence: { type: 'boolean' },
              hasAndroidEvidence: { type: 'boolean' },
              utr: { type: 'string', example: '532412984712' },
              matchedAmountPaise: { type: 'integer' },
              verifiedAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      },
      CreatePaymentLinkRequest: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 2, maxLength: 120, example: 'Freelance Design Retainer' },
          description: { type: 'string', maxLength: 500, example: 'Monthly digital design deliverables' },
          amountPaise: { type: 'integer', minimum: 100, nullable: true, example: 100000, description: 'Amount in paise. Leave null for customer-defined open amount.' },
          isReusable: { type: 'boolean', default: true, description: 'Allows multiple customer checkouts without reusing payment records' },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
          metadata: { type: 'object' }
        }
      },
      PaymentLinkResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          linkReference: { type: 'string', example: 'plink_7a8b9c0d1e2f3a4b' },
          title: { type: 'string' },
          description: { type: 'string' },
          amountPaise: { type: 'integer', nullable: true },
          amountRupees: { type: 'number', nullable: true },
          isOpenAmount: { type: 'boolean', example: false },
          isReusable: { type: 'boolean', example: true },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'EXPIRED', 'REVOKED'] },
          paymentsCount: { type: 'integer', example: 4 },
          totalCollectedPaise: { type: 'integer', example: 400000 },
          totalCollectedRupees: { type: 'number', example: 4000.00 },
          checkoutUrl: { type: 'string', example: 'http://localhost:3002/?link=plink_7a8b9c0d1e2f3a4b' },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      CreateApiKeyRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100, example: 'Staging Integration Server' },
          environment: { type: 'string', enum: ['PRODUCTION', 'SANDBOX'], default: 'SANDBOX' },
          scopes: {
            type: 'array',
            items: { type: 'string' },
            example: ['payments:read', 'payments:write', 'links:read', 'links:write', 'webhooks:read', 'webhooks:write'],
            description: 'Permissions granted to this key. Use `*` for full account access.'
          }
        }
      },
      ApiKeyResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          keyId: { type: 'string', example: 'rgs_test_84b7291a0c4f' },
          environment: { type: 'string', example: 'SANDBOX' },
          scopes: { type: 'array', items: { type: 'string' } },
          isActive: { type: 'boolean', example: true },
          lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      CreateWebhookEndpointRequest: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri', example: 'https://api.yourdomain.com/webhooks/rgs' },
          events: {
            type: 'array',
            items: { type: 'string' },
            example: ['payment.success', 'payment.partial_success', 'payment_link.paid'],
            description: 'Subscribed event types. Use `*` to subscribe to all events.'
          },
          description: { type: 'string', example: 'Order management ERP connector' },
          secret: { type: 'string', minLength: 8, maxLength: 128, description: 'Optional custom HMAC signing secret' }
        }
      },
      WebhookDeliveryResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          endpointId: { type: 'string' },
          eventId: { type: 'string' },
          eventType: { type: 'string', example: 'payment.success' },
          statusCode: { type: 'integer', example: 200 },
          responseBody: { type: 'string', example: '{"received":true}' },
          errorMessage: { type: 'string', nullable: true },
          latencyMs: { type: 'integer', example: 142 },
          attempts: { type: 'integer', example: 1 },
          status: { type: 'string', enum: ['SUCCESS', 'FAILED', 'DEAD_LETTER'] },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  },
  security: [
    {
      ApiKeyAuth: [],
      ApiSecretAuth: []
    },
    {
      BearerAuth: []
    }
  ],
  paths: {
    '/payments': {
      post: {
        tags: ['Payments'],
        summary: 'Create dynamic UPI payment request',
        description: 'Generates an isolated payment request, complete with NPCI UPI intent URI and base64 QR code.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreatePaymentRequest' }
            }
          }
        },
        responses: {
          '201': {
            description: 'Payment request created successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            payment: { $ref: '#/components/schemas/PaymentResponse' },
                            upiUri: { type: 'string' },
                            qrDataUrl: { type: 'string' },
                            checkoutUrl: { type: 'string' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          '400': { description: 'Validation error (e.g. amount < 100 paise)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
          '401': { description: 'Invalid or missing API key/secret', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
          '403': { description: 'Missing `payments:write` scope', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } }
        }
      },
      get: {
        tags: ['Payments'],
        summary: 'List payment requests',
        description: 'Returns paginated payment requests for the authenticated merchant with optional status and order ID filters.',
        parameters: [
          { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/PaymentStatus' } },
          { name: 'orderId', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
          { name: 'skip', in: 'query', schema: { type: 'integer', default: 0 } }
        ],
        responses: {
          '200': {
            description: 'List of payments returned',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            payments: { type: 'array', items: { $ref: '#/components/schemas/PaymentResponse' } },
                            total: { type: 'integer' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    },
    '/payments/{id}': {
      get: {
        tags: ['Payments'],
        summary: 'Get payment details by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': {
            description: 'Payment details returned',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            payment: { $ref: '#/components/schemas/PaymentResponse' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          '404': { description: 'Payment not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } }
        }
      }
    },
    '/payment-links': {
      post: {
        tags: ['Payment Links'],
        summary: 'Create payment link',
        description: 'Generates a reusable or single-use payment link supporting fixed or customer-defined open amounts.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreatePaymentLinkRequest' }
            }
          }
        },
        responses: {
          '201': {
            description: 'Payment link created',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            link: { $ref: '#/components/schemas/PaymentLinkResponse' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      },
      get: {
        tags: ['Payment Links'],
        summary: 'List payment links',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'EXPIRED', 'REVOKED'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'skip', in: 'query', schema: { type: 'integer', default: 0 } }
        ],
        responses: {
          '200': {
            description: 'Payment links list returned',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            links: { type: 'array', items: { $ref: '#/components/schemas/PaymentLinkResponse' } },
                            total: { type: 'integer' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    },
    '/payment-links/{id}': {
      get: {
        tags: ['Payment Links'],
        summary: 'Get payment link details and history',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': {
            description: 'Payment link details and recent transactions',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            link: { $ref: '#/components/schemas/PaymentLinkResponse' },
                            recentPayments: { type: 'array', items: { type: 'object' } }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    },
    '/payment-links/{id}/revoke': {
      post: {
        tags: ['Payment Links'],
        summary: 'Revoke active payment link',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': { description: 'Payment link revoked', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } }
        }
      }
    },
    '/checkout/{reference}': {
      get: {
        tags: ['Public Checkout'],
        summary: 'Get public checkout session details',
        security: [], // Public endpoint
        parameters: [
          { name: 'reference', in: 'path', required: true, schema: { type: 'string', example: 'chk_9f81a7b82c1e4d2a' } }
        ],
        responses: {
          '200': { description: 'Public checkout session returned with QR code and status' }
        }
      }
    },
    '/checkout/link/{linkRef}': {
      get: {
        tags: ['Public Checkout'],
        summary: 'Get public payment link details',
        security: [], // Public endpoint
        parameters: [
          { name: 'linkRef', in: 'path', required: true, schema: { type: 'string', example: 'plink_7a8b9c0d1e2f3a4b' } }
        ],
        responses: {
          '200': { description: 'Public link details returned' }
        }
      }
    },
    '/checkout/link/{linkRef}/initiate': {
      post: {
        tags: ['Public Checkout'],
        summary: 'Initiate payment session from public link',
        security: [], // Public endpoint
        parameters: [
          { name: 'linkRef', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  amountPaise: { type: 'integer', description: 'Required only if open-amount link' },
                  customerName: { type: 'string' },
                  customerPhone: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: 'New isolated payment session initiated' }
        }
      }
    },
    '/developer/keys': {
      get: {
        tags: ['Developer Keys'],
        summary: 'List configured API keys',
        responses: {
          '200': {
            description: 'List of active API keys',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            keys: { type: 'array', items: { $ref: '#/components/schemas/ApiKeyResponse' } }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Developer Keys'],
        summary: 'Generate a new API key',
        description: 'Creates an API key and returns the raw secret. **The secret is revealed once and cannot be retrieved again.**',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateApiKeyRequest' }
            }
          }
        },
        responses: {
          '201': {
            description: 'Key created and raw secret returned once',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            apiKey: { $ref: '#/components/schemas/ApiKeyResponse' },
                            rawSecret: { type: 'string', example: 'rgs_sec_test_9fa7b2c418de...' },
                            warning: { type: 'string' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    },
    '/developer/keys/{id}/rotate': {
      post: {
        tags: ['Developer Keys'],
        summary: 'Rotate API key secret',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': { description: 'Key rotated with new secret generated' }
        }
      }
    },
    '/developer/keys/{id}': {
      delete: {
        tags: ['Developer Keys'],
        summary: 'Revoke an API key',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': { description: 'API key revoked' }
        }
      }
    },
    '/webhooks/endpoints': {
      get: {
        tags: ['Webhooks'],
        summary: 'List registered webhook endpoints',
        responses: {
          '200': { description: 'Registered webhook endpoints returned' }
        }
      },
      post: {
        tags: ['Webhooks'],
        summary: 'Register webhook endpoint',
        description: 'Registers an HTTPS destination URL with SSRF protection against private IP ranges and internal network domains.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateWebhookEndpointRequest' }
            }
          }
        },
        responses: {
          '201': { description: 'Webhook endpoint registered successfully' }
        }
      }
    },
    '/webhooks/endpoints/{id}': {
      delete: {
        tags: ['Webhooks'],
        summary: 'Delete webhook endpoint',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': { description: 'Webhook endpoint deleted' }
        }
      }
    },
    '/webhooks/endpoints/{id}/test': {
      post: {
        tags: ['Webhooks'],
        summary: 'Send immediate test ping event',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': { description: 'Ping response details including latency and status code' }
        }
      }
    },
    '/webhooks/deliveries': {
      get: {
        tags: ['Webhooks'],
        summary: 'List recent webhook delivery attempts',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }
        ],
        responses: {
          '200': {
            description: 'Delivery logs returned',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            deliveries: { type: 'array', items: { $ref: '#/components/schemas/WebhookDeliveryResponse' } }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    },
    '/webhooks/deliveries/{id}/retry': {
      post: {
        tags: ['Webhooks'],
        summary: 'Manually re-authorize webhook delivery',
        description: 'Allows an authenticated merchant to trigger immediate manual re-delivery of a failed or dead-letter webhook event.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': { description: 'Manual retry executed and result returned' }
        }
      }
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Service health check',
        security: [],
        responses: {
          '200': { description: 'System healthy' }
        }
      }
    }
  }
};
