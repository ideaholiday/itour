import CheckoutClient from '@/components/checkout/CheckoutClient';

export default function CheckoutPage({ params }: { params: { productId: string } }) {
  return <CheckoutClient productId={params.productId} />;
}
