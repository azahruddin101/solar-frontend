import LoanDetail from '@/components/loans/LoanDetail';

export default async function Page({ params }) {
  const { id } = await params;
  return <LoanDetail id={id} />;
}
