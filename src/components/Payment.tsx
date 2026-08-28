import React, { useRef, useState } from 'react';
import {
  classifyPaymentError,
  createIdempotencyKey,
  createPayment,
  getPayment,
  PaymentReply,
} from '../api/payment';
import { PaymentHistory } from './PaymentHistory';
import { TERMINAL_STATUSES, statusClassName } from '../utils/payment-status';
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

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 10;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const receiptTitleClassName = (status: string): string => {
  if (status === 'COMPLETED') return 'receipt-title receipt-title--success';
  if (status === 'FAILED') return 'receipt-title receipt-title--failed';
  return 'receipt-title receipt-title--pending';
};

const receiptCopy = (status: string): { title: string; desc: string } => {
  if (status === 'COMPLETED') {
    return { title: '결제가 완료되었습니다!', desc: '주문 상세 정보는 아래와 같습니다.' };
  }
  if (status === 'FAILED') {
    return {
      title: '결제에 실패했습니다',
      desc: '결제가 정상적으로 처리되지 않았습니다. 다시 시도해 주세요.',
    };
  }
  return {
    title: '결제를 확인하고 있습니다',
    desc: '잠시만 기다려 주세요. 확인이 끝나면 자동으로 갱신됩니다.',
  };
};

const purchaseErrorMessage = (error: unknown): string => {
  switch (classifyPaymentError(error)) {
    case 'validation':
      return '결제 요청 정보를 확인해 주세요.';
    case 'conflict':
      return '이미 처리 중인 결제입니다. 잠시 후 조회해 주세요.';
    default:
      return '결제 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.';
  }
};

type PaymentTab = 'shop' | 'history';

const Shop = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<PaymentReply | null>(null);

  // 응답을 받지 못한(네트워크 오류 등) 시도에 한해 같은 멱등키를 재사용하기 위한 참조.
  // 서버 응답을 확정적으로 받으면(성공/실패 무관) 다음 구매는 새 시도로 간주해 초기화한다.
  const pendingAttemptRef = useRef<{ productId: string; idempotencyKey: string } | null>(null);
  const activePaymentIdRef = useRef<number | null>(null);

  const pollForFinalStatus = async (paymentId: number): Promise<PaymentReply | null> => {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
      await wait(POLL_INTERVAL_MS);
      if (activePaymentIdRef.current !== paymentId) {
        return null; // 사용자가 다른 결제를 시작해 이 폴링은 더 이상 유효하지 않다.
      }
      try {
        const latest = await getPayment(paymentId);
        if (TERMINAL_STATUSES.has(latest.status)) {
          return latest;
        }
      } catch {
        // 조회 실패는 무시하고 다음 폴링에서 재시도한다.
      }
    }
    return null;
  };

  const handlePurchase = async (product: Product) => {
    const idempotencyKey =
      pendingAttemptRef.current?.productId === product.productId
        ? pendingAttemptRef.current.idempotencyKey
        : createIdempotencyKey();
    pendingAttemptRef.current = { productId: product.productId, idempotencyKey };

    setLoading(true);
    setError('');
    setReceipt(null);
    try {
      const result = await createPayment(product.amount, product.currency, product.productId, idempotencyKey);
      // 서버로부터 확정 응답을 받았으므로, 다음 클릭은 새로운 시도로 취급한다.
      pendingAttemptRef.current = null;
      activePaymentIdRef.current = result.paymentId;
      setReceipt(result);

      if (!TERMINAL_STATUSES.has(result.status)) {
        const final = await pollForFinalStatus(result.paymentId);
        if (activePaymentIdRef.current === result.paymentId) {
          if (final) {
            setReceipt(final);
          } else {
            setError('결제 확인이 지연되고 있습니다. 결제 내역에서 최종 상태를 확인해 주세요.');
          }
        }
      }
    } catch (err) {
      // 요청 자체가 응답 없이 실패했을 수 있으므로 pendingAttemptRef를 유지해, 재시도 시 같은 멱등키를 사용한다.
      setError(purchaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
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
            <h3 className={receiptTitleClassName(receipt.status)}>{receiptCopy(receipt.status).title}</h3>
            <p className="receipt-desc">{receiptCopy(receipt.status).desc}</p>
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
                <span className={statusClassName(receipt.status)}>{receipt.status}</span>
              </div>
            </div>
            <button
              onClick={() => {
                activePaymentIdRef.current = null;
                setReceipt(null);
              }}
              className="receipt-close-btn"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const Payment = () => {
  const [tab, setTab] = useState<PaymentTab>('shop');

  return (
    <div className="payment-wrapper">
      <h2 className="payment-main-title">{tab === 'shop' ? 'Premium Shop' : '결제 내역'}</h2>
      <p className="payment-main-subtitle">
        {tab === 'shop'
          ? '아이템을 구매하여 게임 플레이를 강화해 보세요.'
          : '내가 결제한 내역을 확인할 수 있습니다.'}
      </p>

      <div className="payment-tabs">
        <button
          onClick={() => setTab('shop')}
          className={`payment-tab-button ${tab === 'shop' ? 'active' : ''}`}
        >
          구매
        </button>
        <button
          onClick={() => setTab('history')}
          className={`payment-tab-button ${tab === 'history' ? 'active' : ''}`}
        >
          결제 내역
        </button>
      </div>

      <div className="payment-tab-content">
        {tab === 'shop' ? <Shop /> : <PaymentHistory />}
      </div>
    </div>
  );
};
