// pages/index.tsx - signed-in users land on the dashboard
import type { GetServerSideProps } from 'next';
import { getAuthedUser } from '@/lib/auth';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = await getAuthedUser(ctx.req);
  return { redirect: { destination: user ? '/dashboard' : '/login', permanent: false } };
};

export default function Home() {
  return null;
}
