import ExpenseDetail from '@/components/expenses/ExpenseDetail';

export default async function Page({ params }) {
  const { id } = await params;
  return <ExpenseDetail id={id} basePath="/agent/expenses" />;
}
