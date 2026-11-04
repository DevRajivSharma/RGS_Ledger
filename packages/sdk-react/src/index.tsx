import React, { useEffect, useCallback } from 'react';

export interface RgsCheckoutOptions {
  checkoutUrl?: string; // e.g. http://localhost:5174
  sessionId: string;
  onSuccess?: (payment: { paymentId: string; orderId: string }) => void;
  onFailure?: (error: { code: string; message: string }) => void;
  onClose?: () => void;
}

export function useRgsCheckout(options: RgsCheckoutOptions) {
  const checkoutUrl = options.checkoutUrl || 'http://localhost:5174';

  const handleMessage = useCallback((event: MessageEvent) => {
    if (!event.data || typeof event.data !== 'object') return;
    
    if (event.data.type === 'RGS_PAYMENT_SUCCESS') {
      options.onSuccess?.(event.data.payload);
    } else if (event.data.type === 'RGS_PAYMENT_FAILURE') {
      options.onFailure?.(event.data.payload);
    } else if (event.data.type === 'RGS_CHECKOUT_CLOSE') {
      options.onClose?.();
    }
  }, [options]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const openCheckout = useCallback(() => {
    const url = `${checkoutUrl}/pay/${options.sessionId}`;
    window.location.href = url;
  }, [checkoutUrl, options.sessionId]);

  return { openCheckout };
}

export interface RgsCheckoutModalProps extends RgsCheckoutOptions {
  isOpen: boolean;
}

export const RgsCheckoutModal: React.FC<RgsCheckoutModalProps> = ({
  isOpen,
  sessionId,
  checkoutUrl = 'http://localhost:5174',
  onClose,
  onSuccess,
  onFailure
}) => {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'RGS_PAYMENT_SUCCESS') {
        onSuccess?.(event.data.payload);
      } else if (event.data.type === 'RGS_PAYMENT_FAILURE') {
        onFailure?.(event.data.payload);
      } else if (event.data.type === 'RGS_CHECKOUT_CLOSE') {
        onClose?.();
      }
    };

    if (isOpen) {
      window.addEventListener('message', handleMessage);
    }
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, onSuccess, onFailure, onClose]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(10, 25, 47, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '460px',
        height: '90vh',
        maxHeight: '700px',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: '#f1f5f9',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#64748b',
            zIndex: 10
          }}
          aria-label="Close"
        >
          ✕
        </button>
        <iframe
          src={`${checkoutUrl}/pay/${sessionId}?embedded=true`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="RGS Ledger Checkout"
          allow="payment"
        />
      </div>
    </div>
  );
};
