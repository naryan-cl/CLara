import { LoginForm } from "@/components/LoginForm";
import { safeNextPath } from "@/lib/access/safe-next-path";

type Props = {
  searchParams?: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const nextPath = safeNextPath(params.next);

  return <LoginForm nextPath={nextPath} />;
}
