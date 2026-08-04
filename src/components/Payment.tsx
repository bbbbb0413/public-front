import React, { useState } from 'react';
import { createPayment, getPayment, PaymentReply } from '../api/payment';
import './Payment.css';

interface Product {
  productId: string;
  name: string;
  amount: number;
  currency: string;
  description: string;
}

const PRODUCTS: Product[] = [
  {
    productId: 'gold_100',
    name: '100 Gold Coins',
    amount: 1000,
    currency: 'KRW',
    description: '기본적인 코인 팩으로 게임에서 유용하게 사용해보세요.',
  },
  {
    productId: 'gold_500',
    name: '500 Gold Coins',
    amount: 4500,
    currency: 'KRW',
    description: '보너스 코인이 추가 지급되는 인기 있는 상품 팩입니다.',
  },
  {
    productId: 'gold_1000',
    name: '1000 Gold Coins',
    amount: 8000,
    currency: 'KRW',
    description: '최대 할인이 적용되어 대량 충전에 유리한 벌크 팩입니다.',
  },
];

export const Payment = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<PaymentReply | null>(null);

  const [queryId, setQueryId] = useState('');
  const [queryResult, setQueryResult] = useState<PaymentReply | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState('');

  const handleQuery = async () => {
    const id = parseInt(queryId, 10);
    if (!queryId.trim() || isNaN(id)) {
      setQueryError('유효한 결제 ID를 입력하세요.');
      return;
    }
    setQueryLoading(true);
    setQueryError('');
    setQueryResult(null);
    try {
      const result = await getPayment(id);
      setQueryResult(result);
    } catch {
      setQueryError('해당 결제 정보를 찾을 수 없습니다.');
    } finally {
      setQueryLoading(false);
    }
  };

  const handlePurchase = async (product: Product) => {
    setLoading(true);
    setError('');
    setReceipt(null);
    try {
      const result = await createPayment(product.amount, product.currency, product.productId);
      setReceipt(result);
    } catch (err) {
      setError('결제 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="payment-wrapper">
      <h2 className="payment-main-title">Premium Shop</h2>
      <p className="payment-main-subtitle">아이템을 구매하여 게임 플레이를 강화해 보세요.</p>

      {error && <div className="payment-error-toast">{error}</div>}

      <div className="products-grid">
        {PRODUCTS.map((product) => (
          <div key={product.productId} className="product-card glass-panel">
            <h3 className="product-name">{product.name}</h3>
            <p className="product-desc">{product.description}</p>
            <div className="product-price">
              {product.amount.toLocaleString()} {product.currency}
            </div>
            <button
              onClick={() => handlePurchase(product)}
              disabled={loading}
              className="purchase-button"
            >
              {loading ? '처리 중...' : '구매하기'}
            </button>
          </div>
        ))}
      </div>

      {receipt && (
        <div className="receipt-overlay">
          <div className="receipt-modal glass-panel">
            <h3 className="receipt-title">결제가 완료되었습니다!</h3>
            <p className="receipt-desc">주문 상세 정보는 아래와 같습니다.</p>
            <div className="receipt-details">
              <div className="receipt-row">
                <span>결제 ID</span>
                <strong>{receipt.paymentId}</strong>
              </div>
              <div className="receipt-row">
                <span>상품 코드</span>
                <strong>{receipt.productId}</strong>
              </div>
              <div className="receipt-row">
                <span>결제 금액</span>
                <strong>
                  {receipt.amount.toLocaleString()} {receipt.currency}
                </strong>
              </div>
              <div className="receipt-row">
                <span>결제 상태</span>
                <span className="status-success">{receipt.status}</span>
              </div>
            </div>
            <button onClick={() => setReceipt(null)} className="receipt-close-btn">
              닫기
            </button>
          </div>
        </div>
      )}

      <div className="payment-query-section">
        <h3 className="payment-query-title">결제 조회</h3>
        <div className="payment-query-row">
          <input
            type="number"
            value={queryId}
            onChange={(e) => setQueryId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
            placeholder="결제 ID 입력"
            className="payment-query-input"
          />
          <button
            onClick={handleQuery}
            disabled={queryLoading}
            className="payment-query-btn"
          >
            {queryLoading ? '조회 중...' : '조회'}
          </button>
        </div>
        {queryError && <p className="payment-query-error">{queryError}</p>}
        {queryResult && (
          <div className="payment-query-result glass-panel">
            <div className="receipt-row">
              <span>결제 ID</span>
              <strong>{queryResult.paymentId}</strong>
            </div>
            <div className="receipt-row">
              <span>계정 ID</span>
              <strong>{queryResult.accountId}</strong>
            </div>
            <div className="receipt-row">
              <span>상품 코드</span>
              <strong>{queryResult.productId}</strong>
            </div>
            <div className="receipt-row">
              <span>결제 금액</span>
              <strong>{queryResult.amount.toLocaleString()} {queryResult.currency}</strong>
            </div>
            <div className="receipt-row">
              <span>결제 상태</span>
              <span className="status-success">{queryResult.status}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
