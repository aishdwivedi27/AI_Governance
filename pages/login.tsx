// pages/login.tsx
'use client';
import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label } from '@/components/ui';
import { getAuthedUser } from '@/lib/auth';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = await getAuthedUser(ctx.req);
  if (user) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
  return { props: {} };
};

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      router.push('/dashboard');
    } catch (err) {
      setError('Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Head>
        <title>Sign in | AI Governance</title>
      </Head>
      <Banner />
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <p className="text-sm text-gray-500">Use your work account to open the assessment workspace.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// The four EU AI Act risk tiers, most to least restricted. Tier colours match the
// classification badges used inside the app so the banner previews the same vocabulary.
const TIERS = [
  { name: 'Unacceptable', rule: 'Prohibited practices', ref: 'Art. 5', bar: 'bg-red-500' },
  { name: 'High risk', rule: 'Conformity obligations before market', ref: 'Art. 6 · Annex III', bar: 'bg-orange-500' },
  { name: 'Limited risk', rule: 'Transparency duties', ref: 'Art. 50', bar: 'bg-yellow-500' },
  { name: 'Minimal risk', rule: 'No added obligations', ref: 'Voluntary codes', bar: 'bg-green-500' },
];

function Banner() {
  return (
    <section
      aria-labelledby="banner-title"
      className="border-b-4 border-brass-500 bg-gray-900 px-6 py-10 text-white sm:px-10 lg:flex lg:flex-col lg:justify-between lg:border-b-0 lg:border-r-4 lg:px-14 lg:py-14"
    >
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass-300">
          AI Governance · Requirements &amp; Understanding
        </p>
        <h1 id="banner-title" className="mt-5 max-w-xl text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
          Know which AI rules apply before you build.
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-gray-300">
          Answer a guided questionnaire about an AI system. Get its risk tier under the EU AI Act
          (Regulation 2024/1689), the obligations that follow, and how it lines up with
          Australia&rsquo;s Voluntary AI Safety Standard (VAISS).
        </p>
      </div>

      <ol className="mt-10 max-w-xl space-y-2 lg:mt-14" aria-label="EU AI Act risk tiers">
        {TIERS.map((t) => (
          <li key={t.name} className="flex items-stretch overflow-hidden rounded bg-white/5">
            <span className={`w-1.5 shrink-0 ${t.bar}`} aria-hidden="true" />
            <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 px-4 py-2.5">
              <div>
                <span className="font-semibold">{t.name}</span>
                <span className="ml-3 text-sm text-gray-300">{t.rule}</span>
              </div>
              <span className="font-mono text-xs text-gray-400">{t.ref}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
