// pages/_app.tsx - CORRECTED VERSION
import type { AppProps } from 'next/app';
import Head from 'next/head';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>AI Governance | EU AI Act &amp; VAISS</title>
        <meta name="description" content="Classify AI systems under the EU AI Act and align them with Australia's VAISS" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta charSet="utf-8" />
        <meta httpEquiv="x-ua-compatible" content="ie=edge" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
