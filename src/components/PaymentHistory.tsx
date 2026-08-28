import React, { useEffect, useState } from 'react';
import { listPayments, PaymentReply } from '../api/payment';
import { statusClassName } from '../utils/payment-status';
import './Payment.css';

export const PaymentHistory = () => {
  const [payments, setPayments] = useState<PaymentReply[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listPayments()
      .then((result) => {
        if (!cancelled) setPayments(result.payments);
      })
      .catch(() => {
        if (!cancelled) setError('결제 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="payment-history-status">불러오는 중...</p>;
  }

  if (error) {
    return <p className="payment-history-status payment-history-status--error">{error}</p>;
  }

  if (!payments || payments.length === 0) {
    return <p className="payment-history-status">아직 결제 내역이 없습니다.</p>;
  }

  return (
    <div className="payment-history-list">
      {payments.map((payment) => (
        <div key={payment.paymentId} className="payment-history-row glass-panel">
          <div className="receipt-row">
            <span>결제 ID</span>
            <strong>{payment.paymentId}</strong>
          </div>
          <div className="receipt-row">
            <span>상품 코드</span>
            <strong>{payment.productId}</strong>
          </div>
          <div className="receipt-row">
            <span>결제 금액</span>
            <strong>
              {payment.amount.toLocaleString()} {payment.currency}
            </strong>
          </div>
          <div className="receipt-row">
            <span>결제 상태</span>
            <span className={statusClassName(payment.status)}>{payment.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
