// components/wizard/TriStateQuestion.tsx
import { useState } from 'react';
import { Textarea } from '@/components/ui';
import ClarifyChat, { ChatState, EMPTY_CHAT } from '@/components/wizard/ClarifyChat';
import { MIN_JUSTIFICATION_LENGTH } from '@/lib/assessment-flow';
import type { ScreeningQuestion, TriState, WizardAnswers } from '@/lib/assessment-flow';

interface Props {
  question: ScreeningQuestion;
  value: TriState | undefined;
  onChange: (value: TriState) => void;
  /** Reasons the current "No" contradicts other answers (empty when none). */
  signals: string[];
  justification: string;
  onJustification: (text: string) => void;
  llmEnabled: boolean;
  answers: WizardAnswers;
  sessionId: string | null;
  chats: Record<string, ChatState>;
  onChat: (key: string, state: ChatState) => void;
  /** True when the current answer was pre-filled by the LLM suggestion. */
  suggested?: boolean;
}

const OPTIONS: { value: TriState; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Unsure' },
];

export default function TriStateQuestion({
  question,
  value,
  onChange,
  signals,
  justification,
  onJustification,
  llmEnabled,
  answers,
  sessionId,
  chats,
  onChat,
  suggested = false,
}: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const challenged = value === 'no' && signals.length > 0;
  const clarifyKey = `clarify:${question.id}`;
  const challengeKey = `challenge:${question.id}`;
  const justificationOk = justification.trim().length >= MIN_JUSTIFICATION_LENGTH;

  return (
    <fieldset className="rounded-lg border bg-white p-4 space-y-3" data-testid={`question-${question.id}`}>
      <legend className="sr-only">{question.label}</legend>
      <div>
        <p className="font-medium">
          {question.text}
          {suggested && (
            <span className="ml-2 align-middle rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800">
              Suggested - please confirm
            </span>
          )}
        </p>
        <p className="text-xs text-gray-600 mt-1">{question.helpText}</p>
        {question.examples.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">Examples: {question.examples.join(', ')}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={question.label}>
        {OPTIONS.map(o => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`px-4 py-1.5 rounded-md border text-sm font-medium transition ${
              value === o.value
                ? o.value === 'unsure'
                  ? 'bg-amber-500 border-amber-500 text-white'
                  : 'bg-gray-900 border-gray-900 text-white'
                : 'bg-white border-gray-300 hover:bg-gray-100'
            }`}
          >
            {o.label}
          </button>
        ))}
        {llmEnabled && (
          <button
            type="button"
            onClick={() => setHelpOpen(o => !o)}
            className="ml-2 text-sm text-blue-700 hover:underline"
          >
            {helpOpen ? 'Hide help' : 'Not sure? Get help'}
          </button>
        )}
      </div>

      {value === 'unsure' && (
        <p className="text-xs text-amber-800">
          Unsure answers are treated pessimistically in the result and added to your checklist to resolve.
        </p>
      )}

      {llmEnabled && helpOpen && (
        <ClarifyChat
          mode="clarify"
          questionId={question.id}
          answers={answers}
          sessionId={sessionId}
          state={chats[clarifyKey] ?? EMPTY_CHAT}
          onState={s => onChat(clarifyKey, s)}
          onSetAnswer={v => {
            onChange(v);
            setHelpOpen(false);
          }}
          onClose={() => setHelpOpen(false)}
        />
      )}

      {challenged && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-3" data-testid="challenge">
          <div className="text-sm">
            <p className="font-semibold text-amber-900">This "No" conflicts with other information you gave</p>
            <ul className="list-disc ml-5 mt-1 text-amber-900">
              {signals.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          {llmEnabled && (
            <ClarifyChat
              mode="challenge"
              questionId={question.id}
              answers={answers}
              sessionId={sessionId}
              state={chats[challengeKey] ?? EMPTY_CHAT}
              onState={s => onChat(challengeKey, s)}
              onSetAnswer={onChange}
            />
          )}

          {!llmEnabled && (
            <div className="flex gap-2 text-sm">
              <button type="button" className="underline" onClick={() => onChange('yes')}>
                Change to Yes
              </button>
              <button type="button" className="underline" onClick={() => onChange('unsure')}>
                Mark unsure
              </button>
            </div>
          )}

          <div>
            <label className="text-sm font-medium" htmlFor={`just-${question.id}`}>
              To keep "No", explain why (at least {MIN_JUSTIFICATION_LENGTH} characters)
            </label>
            <Textarea
              id={`just-${question.id}`}
              rows={2}
              value={justification}
              onChange={e => onJustification(e.target.value)}
              placeholder="Why the evidence above does not apply to this system"
            />
            {!justificationOk && (
              <p className="text-xs text-amber-900 mt-1">A written justification is required to continue with "No".</p>
            )}
          </div>
        </div>
      )}
    </fieldset>
  );
}
