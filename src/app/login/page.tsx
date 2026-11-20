import AuthForm from "@/components/AuthForm";
import { checkoutReturnPath } from "@/lib/checkout-path";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  return <AuthForm mode="login" next={checkoutReturnPath(params.next)} />;
}
