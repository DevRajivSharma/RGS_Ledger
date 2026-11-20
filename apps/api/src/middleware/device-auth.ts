import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AndroidDeviceModel, findMerchantByIdDefensive } from '../database/models.js';

export interface AuthenticatedDeviceRequest extends Request {
  deviceId?: string;
  merchantId?: string;
  device?: any;
}

/**
 * Middleware enforcing device token authentication for Android Companion endpoints.
 */
export async function requireDeviceAuth(req: AuthenticatedDeviceRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const headerToken = req.headers['x-device-token'] as string;
    const authHeader = req.headers['authorization'];
    let token: string | undefined = headerToken;

    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Device bearer token is required for this endpoint.'
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const deviceTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const device = await AndroidDeviceModel.findOne({
      deviceTokenHash,
      status: 'PAIRED'
    });

    if (!device) {
      res.status(401).json({
        success: false,
        error: {
          code: 'DEVICE_UNAUTHORIZED',
          message: 'Device token is invalid, revoked, or device has been unpaired.'
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    // Verify merchant account status
    const merchant = (await findMerchantByIdDefensive(device.merchantId)) as any;
    if (!merchant) {
      res.status(404).json({
        success: false,
        error: {
          code: 'MERCHANT_NOT_FOUND',
          message: 'Merchant account not found. Device requests are rejected.'
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }
    if (merchant.status === 'SUSPENDED') {
      res.status(403).json({
        success: false,
        error: {
          code: 'MERCHANT_SUSPENDED',
          message: 'Merchant account is suspended. Device requests are rejected.'
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    // Update last heartbeat
    device.lastHeartbeatAt = new Date();
    device.save().catch(() => {});

    req.deviceId = device._id.toString();
    req.merchantId = device.merchantId.toString();
    req.device = device;

    next();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
}
