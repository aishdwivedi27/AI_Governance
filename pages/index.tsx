// pages/index.tsx - CORRECTED VERSION
import Link from 'next/link';
import { Button } from '@/components/ui';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold mb-4">EU AI Act Compliance Checker</h1>
        <p className="text-xl text-blue-100 mb-8">
          Internal tool for ensuring products meet regulatory requirements
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white/10 backdrop-blur p-6 rounded-lg">
            <div className="text-3xl mb-2">📋</div>
            <h3 className="font-semibold mb-2">No Database</h3>
            <p className="text-sm text-blue-100">Append-only JSON log for immutable records</p>
          </div>
          
          <div className="bg-white/10 backdrop-blur p-6 rounded-lg">
            <div className="text-3xl mb-2">🔒</div>
            <h3 className="font-semibold mb-2">Version Controlled</h3>
            <p className="text-sm text-blue-100">YAML rules tracked in git, always current</p>
          </div>
          
          <div className="bg-white/10 backdrop-blur p-6 rounded-lg">
            <div className="text-3xl mb-2">⚡</div>
            <h3 className="font-semibold mb-2">Fast & Simple</h3>
            <p className="text-sm text-blue-100">No infrastructure, just files and code</p>
          </div>
        </div>

        <Link href="/dashboard">
          <Button className="px-8 py-3 text-lg">
            Start Assessment →
          </Button>
        </Link>
      </div>
    </div>
  );
}
