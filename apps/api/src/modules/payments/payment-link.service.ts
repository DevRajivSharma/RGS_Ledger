import crypto from 'crypto';
import { PaymentLinkModel, PaymentRequestModel, MerchantBankAccountModel, AuditLogModel, findMerchantByIdDefensive } from '../../database/models.js';
import { CreatePaymentLinkSchema, InitiateLinkPaymentSchema } from '@rgs-ledger/validation';
import { PaymentLinkStatus, PaymentStatus } from '@rgs-ledger/shared-types';
import { PaymentLinkDto, PublicPaymentLinkDetails } from '@rgs-ledger/api-contracts';
import { UpiAdapterFactory } from '@rgs-ledger/upi-adapter';
import { buildIntentLinks } from 'upipay';
import { config } from '../../config/index.js';

export class PaymentLinkService {
  private upiAdapter = UpiAdapterFactory.getAdapter();

  /**
   * Creates a new Payment Link.
   * Can be fixed-amount or customer-defined (open amount), reusable or single-use.
   */
  public async createPaymentLink(merchantId: string, input: any, userId?: string): Promise<PaymentLinkDto> {
    const validated = CreatePaymentLinkSchema.parse(input);

    // Verify merchant existence
    const merchant = await findMerchantByIdDefensive(merchantId);
    if (!merchant) {
      throw new Error('Merchant account not found');
    }

    // Verify bank account if specified
    if (validated.bankAccountId) {
      const bankAccount = await MerchantBankAccountModel.findOne({
        _id: validated.bankAccountId,
        merchantId,
        isActive: true
      });
      if (!bankAccount) {
        throw new Error('Specified collection bank account not found or is disabled');
      }
    }

    // Generate unique link reference
    const linkRef = `plink_${crypto.randomBytes(8).toString('hex')}`;

    const linkDoc = await PaymentLinkModel.create({
      merchantId,
      linkReference: linkRef,
      title: validated.title.trim(),
      description: validated.description?.trim(),
      amountPaise: validated.amountPaise ?? null,
      currency: 'INR',
      bankAccountId: validated.bankAccountId || undefined,
      isReusable: validated.isReusable ?? true,
      status: PaymentLinkStatus.ACTIVE,
      expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : undefined,
      paymentsCount: 0,
      totalCollectedPaise: 0,
      metadata: validated.metadata || {}
    });

    await AuditLogModel.create({
      merchantId,
      userId,
      action: 'PAYMENT_LINK_CREATED',
      resource: 'payment_links',
      resourceId: linkDoc._id.toString(),
      details: {
        linkReference: linkRef,
        amountPaise: linkDoc.amountPaise,
        isReusable: linkDoc.isReusable
      }
    }).catch(() => {});

    return this.formatPaymentLinkDto(linkDoc);
  }

  /**
   * Retrieves a Payment Link by ID for the authenticated merchant.
   */
  public async getPaymentLinkById(merchantId: string, linkIdOrRef: string): Promise<{ link: PaymentLinkDto; recentPayments: any[] }> {
    const isObjectId = linkIdOrRef.match(/^[0-9a-fA-F]{24}$/);
    const linkDoc = await PaymentLinkModel.findOne({
      merchantId,
      $or: isObjectId ? [{ _id: linkIdOrRef }, { linkReference: linkIdOrRef }] : [{ linkReference: linkIdOrRef }]
    });

    if (!linkDoc) {
      throw new Error('Payment Link not found or access denied');
    }

    // Check expiry
    if (linkDoc.status === PaymentLinkStatus.ACTIVE && linkDoc.expiresAt && new Date() > new Date(linkDoc.expiresAt)) {
      linkDoc.status = PaymentLinkStatus.EXPIRED;
      await linkDoc.save();
    }

    // Fetch payments initiated via this link
    const recentPayments = await PaymentRequestModel.find({
      merchantId,
      paymentLinkRef: linkDoc.linkReference
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return {
      link: this.formatPaymentLinkDto(linkDoc),
      recentPayments: recentPayments.map((p: any) => ({
        id: p._id.toString(),
        orderId: p.orderId,
        checkoutReference: p.checkoutReference,
        amountPaise: p.amountPaise,
        amountRupees: p.amountPaise / 100,
        status: p.status,
        createdAt: p.createdAt
      }))
    };
  }

  /**
   * Public retrieval of Payment Link details (for Hosted Checkout).
   * Safe for public exposure without merchant secret leakage.
   */
  public async getPublicPaymentLink(linkReference: string): Promise<PublicPaymentLinkDetails> {
    const linkDoc = await PaymentLinkModel.findOne({ linkReference: linkReference.trim() });
    if (!linkDoc) {
      throw new Error('Payment link not found or has been revoked');
    }

    // Check expiry
    const isExpired =
      linkDoc.status === PaymentLinkStatus.EXPIRED ||
      (linkDoc.expiresAt ? new Date() > new Date(linkDoc.expiresAt) : false);

    if (linkDoc.status === PaymentLinkStatus.ACTIVE && isExpired) {
      linkDoc.status = PaymentLinkStatus.EXPIRED;
      await linkDoc.save();
    }

    const merchant = (await findMerchantByIdDefensive(linkDoc.merchantId)) as any;

    return {
      linkReference: linkDoc.linkReference,
      merchantName: merchant?.name || 'RGS Merchant',
      title: linkDoc.title,
      description: linkDoc.description,
      amountPaise: linkDoc.amountPaise,
      amountRupees: linkDoc.amountPaise ? linkDoc.amountPaise / 100 : null,
      isOpenAmount: linkDoc.amountPaise === null,
      currency: linkDoc.currency || 'INR',
      isReusable: linkDoc.isReusable,
      status: isExpired ? PaymentLinkStatus.EXPIRED : linkDoc.status,
      isExpired,
      expiresAt: linkDoc.expiresAt ? linkDoc.expiresAt.toISOString() : null
    };
  }

  /**
   * Initiates a payment from a payment link (called by Hosted Checkout).
   * Generates a completely isolated PaymentRequest with its own checkout session and QR code.
   */
  public async initiatePaymentFromLink(linkReference: string, input: any): Promise<any> {
    const validated = InitiateLinkPaymentSchema.parse(input);
    const linkDoc = await PaymentLinkModel.findOne({ linkReference: linkReference.trim() });

    if (!linkDoc) {
      throw new Error('Payment link not found');
    }

    if (linkDoc.status !== PaymentLinkStatus.ACTIVE) {
      throw new Error(`This payment link is ${linkDoc.status.toLowerCase()} and cannot accept payments`);
    }

    if (linkDoc.expiresAt && new Date() > new Date(linkDoc.expiresAt)) {
      linkDoc.status = PaymentLinkStatus.EXPIRED;
      await linkDoc.save();
      throw new Error('This payment link has expired');
    }

    // Determine amount
    let payableAmountPaise: number;
    if (linkDoc.amountPaise !== null && linkDoc.amountPaise > 0) {
      payableAmountPaise = linkDoc.amountPaise;
    } else {
      if (!validated.amountPaise || validated.amountPaise < 100) {
        throw new Error('Please specify an amount of at least ₹1.00 (100 paise)');
      }
      payableAmountPaise = validated.amountPaise;
    }

    const merchant = (await findMerchantByIdDefensive(linkDoc.merchantId)) as any;
    if (!merchant) {
      throw new Error('Merchant account not found');
    }

    // Resolve target bank account
    let targetVpa = merchant.upiConfig?.vpa;
    let bankName = merchant.upiConfig?.businessName || merchant.name;
    let accountSuffix: string | undefined;

    if (linkDoc.bankAccountId) {
      const bankAccount = await MerchantBankAccountModel.findOne({
        _id: linkDoc.bankAccountId,
        merchantId: linkDoc.merchantId,
        isActive: true
      });
      if (bankAccount) {
        targetVpa = bankAccount.upiId;
        bankName = bankAccount.bankName;
        accountSuffix = bankAccount.accountSuffix;
      }
    }

    if (!targetVpa) {
      throw new Error('Merchant has no active UPI VPA configured to receive payments');
    }

    // Generate unique order ID and checkout reference for this specific payment attempt
    const randomHex = crypto.randomBytes(6).toString('hex');
    const orderId = `PLINK-${Date.now()}-${randomHex}`;
    const checkoutReference = `chk_${crypto.randomBytes(12).toString('hex')}`;

    // Generate UPI URI and QR code
    const upiResult = await this.upiAdapter.generatePaymentQr({
      payeeVpa: targetVpa,
      payeeName: bankName,
      amountPaise: payableAmountPaise,
      orderId,
      note: linkDoc.title
    });

    const expiryMinutes = 15;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Create the independent PaymentRequest
    const payment = await PaymentRequestModel.create({
      merchantId: linkDoc.merchantId,
      orderId,
      amountPaise: payableAmountPaise,
      currency: 'INR',
      description: linkDoc.title,
      merchantVpa: targetVpa,
      merchantName: bankName,
      bankAccountId: linkDoc.bankAccountId || undefined,
      bankName,
      accountSuffix,
      upiUri: upiResult.upiUri,
      qrDataUrl: upiResult.qrDataUrl,
      checkoutReference,
      status: PaymentStatus.PENDING,
      paymentLinkRef: linkDoc.linkReference,
      expiresAt
    });

    // Update payment link metrics
    linkDoc.paymentsCount = (linkDoc.paymentsCount || 0) + 1;

    // Single-use link: Deactivate immediately once initiated/paid
    if (!linkDoc.isReusable) {
      linkDoc.status = PaymentLinkStatus.INACTIVE;
    }
    await linkDoc.save();

    const intentLinks = buildIntentLinks(upiResult.upiUri);

    return {
      paymentRequestId: payment._id.toString(),
      checkoutReference: payment.checkoutReference,
      orderId: payment.orderId,
      merchantName: payment.merchantName,
      amountPaise: payableAmountPaise,
      amountRupees: payableAmountPaise / 100,
      qrDataUrl: payment.qrDataUrl,
      upiUri: payment.upiUri,
      intentLinks: {
        generic: intentLinks.generic,
        phonepe: intentLinks.phonepe,
        gpay: intentLinks.gpay,
        paytm: intentLinks.paytm,
        bhim: intentLinks.bhim
      },
      status: payment.status,
      expiresAt: payment.expiresAt.toISOString(),
      checkoutUrl: `/checkout?ref=${payment.checkoutReference}`
    };
  }

  /**
   * Lists all Payment Links for a merchant with filtering & search.
   */
  public async listPaymentLinks(
    merchantId: string,
    filter?: { status?: string; search?: string; limit?: number; skip?: number }
  ): Promise<{ links: PaymentLinkDto[]; total: number }> {
    const query: any = { merchantId };

    if (filter?.status && filter.status !== 'ALL') {
      query.status = filter.status;
    }

    if (filter?.search) {
      const s = filter.search.trim();
      query.$or = [
        { title: { $regex: s, $options: 'i' } },
        { linkReference: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } }
      ];
    }

    const limit = filter?.limit || 50;
    const skip = filter?.skip || 0;

    const [docs, total] = await Promise.all([
      PaymentLinkModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      PaymentLinkModel.countDocuments(query)
    ]);

    return {
      links: docs.map((d) => this.formatPaymentLinkDto(d)),
      total
    };
  }

  /**
   * Revokes a Payment Link.
   */
  public async revokePaymentLink(merchantId: string, linkIdOrRef: string, userId?: string): Promise<PaymentLinkDto> {
    const isObjectId = linkIdOrRef.match(/^[0-9a-fA-F]{24}$/);
    const linkDoc = await PaymentLinkModel.findOne({
      merchantId,
      $or: isObjectId ? [{ _id: linkIdOrRef }, { linkReference: linkIdOrRef }] : [{ linkReference: linkIdOrRef }]
    });

    if (!linkDoc) {
      throw new Error('Payment Link not found or access denied');
    }

    linkDoc.status = PaymentLinkStatus.REVOKED;
    await linkDoc.save();

    await AuditLogModel.create({
      merchantId,
      userId,
      action: 'PAYMENT_LINK_REVOKED',
      resource: 'payment_links',
      resourceId: linkDoc._id.toString(),
      details: { linkReference: linkDoc.linkReference }
    }).catch(() => {});

    return this.formatPaymentLinkDto(linkDoc);
  }

  private formatPaymentLinkDto(doc: any): PaymentLinkDto {
    const rawHostedUrl = config.HOSTED_CHECKOUT_URL || 'http://localhost:3002';
    const baseUrl = rawHostedUrl.replace(/\/+$/, '');
    const cleanUrl = baseUrl.endsWith('/checkout') ? baseUrl : `${baseUrl}/checkout`;
    return {
      id: doc._id.toString(),
      merchantId: doc.merchantId.toString(),
      linkReference: doc.linkReference,
      title: doc.title,
      description: doc.description,
      amountPaise: doc.amountPaise ?? null,
      amountRupees: doc.amountPaise ? doc.amountPaise / 100 : null,
      currency: doc.currency || 'INR',
      bankAccountId: doc.bankAccountId ? doc.bankAccountId.toString() : null,
      isReusable: doc.isReusable !== false,
      status: doc.status || PaymentLinkStatus.ACTIVE,
      expiresAt: doc.expiresAt ? doc.expiresAt.toISOString() : null,
      paymentsCount: doc.paymentsCount || 0,
      totalCollectedPaise: doc.totalCollectedPaise || 0,
      totalCollectedRupees: (doc.totalCollectedPaise || 0) / 100,
      metadata: doc.metadata || {},
      checkoutUrl: `${cleanUrl}?link=${doc.linkReference}`,
      createdAt: doc.createdAt ? doc.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : new Date().toISOString()
    };
  }
}

export const defaultPaymentLinkService = new PaymentLinkService();
