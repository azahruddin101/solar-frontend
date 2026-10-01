export const PAYMENT_MODE_LABEL = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank transfer (NEFT / RTGS / IMPS)',
  cheque: 'Cheque',
  card: 'Card',
  other: 'Other',
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n) => `${n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${below100(n % 100)}`;

function wordsOf(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  for (const [size, label] of [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']]) {
    if (n >= size) {
      parts.push(`${wordsOf(Math.floor(n / size))} ${label}`);
      n %= size;
    }
  }
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}

export function amountInWords(amount, currency = 'INR') {
  if (currency !== 'INR') return '';
  const total = Math.round((Number(amount) || 0) * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  return `Rupees ${wordsOf(rupees)}${paise ? ` and ${wordsOf(paise)} Paise` : ''} Only`;
}

export function amountInWordsInr(amount) {
  const rupees = Math.round(Number(amount) || 0);
  if (!rupees) return 'INR Zero Only';
  return `INR ${wordsOf(rupees)} Only`;
}

export const fmtPdfDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export const pdfSlug = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
