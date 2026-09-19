// components/wizard/ClarifyChat.tsx
// Inline per-question assistant. "clarify" explains the question and may PROPOSE an answer;
// "challenge" pushes back on a "No" that other evidence contradicts. The assistant never sets
// an answer: every outcome goes through onSetAnswer after an explicit user click.
import { useEffect, useRef, useState } from 'react';
import { Button, Textarea } from '@/components/ui';
import type { TriState, WizardAnswers } from '@/lib/assessment-flow';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatState {
  messages: ChatMessage[];
  proposedAnswer: 'yes' | 'no' | null;
  assessment: 'reasoning_sufficient' | 'reasoning_weak' | null;
  turnsRemaining: number;
}

export const EMPTY_CHAT: ChatState = { messages: [], proposedAnswer: null, assessment: null, turnsRemaining: 6 };

interface Props {
  mode: 'clarify' | 'challenge';
  questionId: string;
  answers: WizardAnswers;
  sessionId: string | null;
  state: ChatState;
  onState: (state: ChatState) => void;
  onSetAnswer: (value: TriState) => void;
  onClose?: () => void;
}

export default function ClarifyChat({ mode, questionId, answers, sessionId, state, onState, onSetAnswer, onClose }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const send = async (userMessage: string) => {
    const current = stateRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/intake/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          questionId,
          sessionId: sessionId ?? undefined,
          answers,
          history: current.messages,
          userMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The assistant is unavailable');
      onState({
        messages: [
          ...current.messages,
          ...(userMessage.trim() ? [{ role: 'user' as const, content: userMessage.trim() }] : []),
          { role: 'assistant' as const, content: data.reply },
        ],
        proposedAnswer: data.proposedAnswer ?? null,
        assessment: data.assessment ?? null,
        turnsRemaining: data.turnsRemaining,
      });
      setInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant is unavailable');
    } finally {
      setLoading(false);
    }
  };

  // Open the conversation automatically (explanation or challenge) if it hasn't started
  useEffect(() => {
    if (!started.current && stateRef.current.messages.length === 0) {
      started.current = true;
      send('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const outOfTurns = state.turnsRemaining <= 0;

  return (
    <div
      className={`mt-3 rounded-lg border p-4 space-y-3 ${mode === 'challenge' ? 'border-amber-300 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}
      data-testid={`chat-${mode}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{mode === 'challenge' ? 'Let us check that answer' : 'Help with this question'}</p>
        {onClose && (
          <button type="button" onClick={onClose} className="text-xs text-gray-600 hover:underline">
            Close
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {state.messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm rounded-md px-3 py-2 ${m.role === 'assistant' ? 'bg-white border' : 'bg-gray-900 text-white ml-8'}`}
          >
            {m.content}
          </div>
        ))}
        {loading && <p className="text-xs text-gray-600">Thinking...</p>}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {mode === 'clarify' && state.proposedAnswer && (
        <div className="rounded-md bg-white border p-3 text-sm space-y-2">
          <p>
            Based on what you said, this looks like <strong>{state.proposedAnswer === 'yes' ? 'Yes' : 'No'}</strong>. It is your
            call.
          </p>
          <Button size="sm" type="button" onClick={() => onSetAnswer(state.proposedAnswer as TriState)}>
            Confirm {state.proposedAnswer === 'yes' ? 'Yes' : 'No'}
          </Button>
        </div>
      )}

      {mode === 'challenge' && state.assessment && (
        <p className="text-xs text-gray-700">
          {state.assessment === 'reasoning_sufficient'
            ? 'The assistant thinks your reasoning addresses the evidence. Write it down below to keep "No".'
            : 'The assistant is not yet convinced. Consider changing your answer, or explain more.'}
        </p>
      )}

      {!outOfTurns ? (
        <div className="space-y-2">
          <Textarea
            aria-label="Your reply"
            rows={2}
            maxLength={1000}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={mode === 'challenge' ? 'Explain your reasoning...' : 'Tell the assistant about your system...'}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={loading || !input.trim()} onClick={() => send(input)}>
              Send
            </Button>
            <span className="text-xs text-gray-600 self-center">{state.turnsRemaining} replies left</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-amber-900">Reply limit reached. Choose an answer, or mark it as unsure.</p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {mode === 'challenge' && (
          <Button type="button" size="sm" variant="outline" onClick={() => onSetAnswer('yes')}>
            Change to Yes
          </Button>
        )}
        <Button type="button" size="sm" variant={outOfTurns ? 'default' : 'outline'} onClick={() => onSetAnswer('unsure')}>
          I am still unsure
        </Button>
      </div>
    </div>
  );
}
