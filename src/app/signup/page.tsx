import AuthForm from "@/components/AuthForm";
import { checkoutReturnPath } from "@/lib/checkout-path";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  return <AuthForm mode="signup" next={checkoutReturnPath(params.next)} />;
}
