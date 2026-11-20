import { Router, Request, Response } from 'express';
import { UpiAdapterFactory } from '@rgs-ledger/upi-adapter';

const upiAdapter = UpiAdapterFactory.getAdapter();
const router = Router();

router.post('/validate-vpa', (req: Request, res: Response) => {
  const { vpa } = req.body;
  const isValid = upiAdapter.validateVpa(vpa);
  res.json({ success: true, data: { vpa, isValid } });
});

export const upiRouter = router;
