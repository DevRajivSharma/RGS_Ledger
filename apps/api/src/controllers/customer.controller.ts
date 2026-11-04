import { Request, Response, NextFunction } from 'express';
import { Customer } from '../database/models';
import { generateRandomId } from '@rgs-ledger/shared';

export class CustomerController {
  static async createCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const customer = await Customer.create({
        _id: generateRandomId('cust'),
        merchantId,
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone
      });

      res.status(201).json({ success: true, data: customer });
    } catch (err) {
      next(err);
    }
  }

  static async getCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customer = await Customer.findOne({ _id: req.params.id, merchantId: req.merchantId }).exec();
      if (!customer) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
        return;
      }
      res.status(200).json({ success: true, data: customer });
    } catch (err) {
      next(err);
    }
  }

  static async listCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '20', 10)));
      const skip = (page - 1) * limit;

      const query: any = { merchantId };
      if (req.query.search) {
        query.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { email: { $regex: req.query.search, $options: 'i' } }
        ];
      }

      const [customers, total] = await Promise.all([
        Customer.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
        Customer.countDocuments(query).exec()
      ]);

      res.status(200).json({
        success: true,
        data: customers,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (err) {
      next(err);
    }
  }
}
