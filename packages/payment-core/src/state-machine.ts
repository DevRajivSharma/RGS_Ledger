import { OrderStatus, PaymentStatus, RefundStatus } from '@rgs-ledger/shared';

export class InvalidStateTransitionError extends Error {
  constructor(entity: string, current: string, target: string) {
    super(`Illegal state transition for ${entity}: cannot transition from '${current}' to '${target}'`);
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * Valid state transitions for Orders
 */
const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.CREATED]: [OrderStatus.ATTEMPTED, OrderStatus.PROCESSING, OrderStatus.CANCELLED, OrderStatus.EXPIRED],
  [OrderStatus.ATTEMPTED]: [OrderStatus.PROCESSING, OrderStatus.AUTHORIZED, OrderStatus.CAPTURED, OrderStatus.FAILED, OrderStatus.EXPIRED],
  [OrderStatus.PROCESSING]: [OrderStatus.AUTHORIZED, OrderStatus.CAPTURED, OrderStatus.FAILED, OrderStatus.CANCELLED],
  [OrderStatus.AUTHORIZED]: [OrderStatus.CAPTURED, OrderStatus.FAILED, OrderStatus.CANCELLED],
  [OrderStatus.CAPTURED]: [OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED],
  [OrderStatus.PARTIALLY_REFUNDED]: [OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED],
  [OrderStatus.REFUNDED]: [],
  [OrderStatus.FAILED]: [OrderStatus.ATTEMPTED], // allow new attempt on failed order
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.EXPIRED]: []
};

/**
 * Valid state transitions for Payments
 */
const VALID_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.CREATED]: [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
  [PaymentStatus.PENDING]: [PaymentStatus.PROCESSING, PaymentStatus.SUCCESS, PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.EXPIRED],
  [PaymentStatus.PROCESSING]: [PaymentStatus.SUCCESS, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
  [PaymentStatus.SUCCESS]: [], // Final state
  [PaymentStatus.FAILED]: [],  // Final state
  [PaymentStatus.CANCELLED]: [],
  [PaymentStatus.EXPIRED]: []
};

/**
 * Valid state transitions for Refunds
 */
const VALID_REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  [RefundStatus.CREATED]: [RefundStatus.PENDING, RefundStatus.PROCESSED, RefundStatus.FAILED, RefundStatus.CANCELLED],
  [RefundStatus.PENDING]: [RefundStatus.PROCESSED, RefundStatus.FAILED, RefundStatus.CANCELLED],
  [RefundStatus.PROCESSED]: [],
  [RefundStatus.FAILED]: [],
  [RefundStatus.CANCELLED]: []
};

export class PaymentStateMachine {
  static assertOrderTransition(current: OrderStatus, target: OrderStatus): void {
    if (current === target) return;
    const allowed = VALID_ORDER_TRANSITIONS[current] || [];
    if (!allowed.includes(target)) {
      throw new InvalidStateTransitionError('Order', current, target);
    }
  }

  static canOrderTransition(current: OrderStatus, target: OrderStatus): boolean {
    if (current === target) return true;
    const allowed = VALID_ORDER_TRANSITIONS[current] || [];
    return allowed.includes(target);
  }

  static assertPaymentTransition(current: PaymentStatus, target: PaymentStatus): void {
    if (current === target) return;
    const allowed = VALID_PAYMENT_TRANSITIONS[current] || [];
    if (!allowed.includes(target)) {
      throw new InvalidStateTransitionError('Payment', current, target);
    }
  }

  static canPaymentTransition(current: PaymentStatus, target: PaymentStatus): boolean {
    if (current === target) return true;
    const allowed = VALID_PAYMENT_TRANSITIONS[current] || [];
    return allowed.includes(target);
  }

  static assertRefundTransition(current: RefundStatus, target: RefundStatus): void {
    if (current === target) return;
    const allowed = VALID_REFUND_TRANSITIONS[current] || [];
    if (!allowed.includes(target)) {
      throw new InvalidStateTransitionError('Refund', current, target);
    }
  }
}
