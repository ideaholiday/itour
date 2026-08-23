import CheckoutClient from '@/components/checkout/CheckoutClient';

export default async function CheckoutPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return <CheckoutClient productId={productId} />;
}
