import ProductDetail from '@/components/dashboard/ProductDetail';

export default async function Page({ params }) {
  const { id } = await params;
  return <ProductDetail id={id} />;
}
