import LoanDetail from '@/components/loans/LoanDetail';

export default async function Page({ params }) {
  const { id } = await params;
  return <LoanDetail id={id} basePath="/agent/loans" clientsPath="/agent/clients" designsPath="/agent/designs" />;
}
