// pages/assess.tsx
// Multi-step assessment wizard (REQUIREMENTS.md 3.1). Step order, branching and completeness
// rules live in lib/assessment-flow.ts; progress is saved to a QASession on every step change.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { requireAuthSSR, type AuthedUser } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@/components/ui';
import ResultView, { ResultData } from '@/components/ResultView';
import TriStateQuestion from '@/components/wizard/TriStateQuestion';
import type { ChatState } from '@/components/wizard/ClarifyChat';
import {
  GEOGRAPHY_OPTIONS,
  INDUSTRY_OPTIONS,
  PRODUCT_TYPES,
  ROLE_OPTIONS,
  SECTOR_QUESTIONS,
  VULNERABLE_GROUP_OPTIONS,
  buildAssessmentInput,
  firstIncompleteStep,
  getActiveAnnex3Categories,
  getAnswer,
  getAnswerRows,
  getChallengedAnswers,
  getContradictionSignals,
  getScreeningQuestions,
  getVisibleSteps,
  isGpaiComputeVisible,
  isStepComplete,
  setAnswer,
} from '@/lib/assessment-flow';
import {
  AUSTRALIA_DISCLAIMER,
  AUSTRALIA_PRACTICES,
  AUSTRALIA_STANDARD,
  getAustraliaQuestions,
  getAustraliaSignals,
} from '@/lib/australia-alignment';
import type { ScreeningQuestion, StepId, TriState, WizardAnswers, WizardRules } from '@/lib/assessment-flow';

export const getServerSideProps: GetServerSideProps = async ctx => requireAuthSSR(ctx);

interface DraftSummary {
  id: string;
  answers: WizardAnswers;
  currentStep: string;
  updatedAt: string;
}

const INITIAL_ANSWERS: WizardAnswers = { geographies: ['EU'], vulnerableGroups: [], role: [] };

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const l = list ?? [];
  return l.includes(value) ? l.filter(v => v !== value) : [...l, value];
}

function CheckboxList({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (o: string) => void }) {
  return (
    <div className="space-y-2 mt-2">
      {options.map(o => (
        <label key={o} className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="w-4 h-4" checked={selected.includes(o)} onChange={() => onToggle(o)} />
          {o}
        </label>
      ))}
    </div>
  );
}

export default function AssessPage({ user }: { user: AuthedUser }) {
  const router = useRouter();
  const [rules, setRules] = useState<WizardRules | null>(null);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [answers, setAnswers] = useState<WizardAnswers>(INITIAL_ANSWERS);
  const [stepId, setStepId] = useState<StepId>('gate');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [chats, setChats] = useState<Record<string, ChatState>>({});
  const [suggested, setSuggested] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);
  const [notInScope, setNotInScope] = useState(false);

  // Load rules once, then either resume ?session=<id> or list drafts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rulesRes = await fetch('/api/rules');
        const rulesData = await rulesRes.json();
        if (!rulesRes.ok) throw new Error(rulesData.error || 'Failed to load rules');
        if (cancelled) return;
        setRules(rulesData.rules);
        setLlmEnabled(!!rulesData.llmEnabled);

        const sid = typeof router.query.session === 'string' ? router.query.session : null;
        if (sid) {
          const res = await fetch(`/api/sessions/${sid}`);
          const data = await res.json();
          if (res.ok && !cancelled) {
            const restored = { ...INITIAL_ANSWERS, ...data.session.answers } as WizardAnswers;
            setAnswers(restored);
            setSessionId(data.session.id);
            setStepId(firstIncompleteStep(restored, rulesData.rules));
            setMessage({ kind: 'info', text: 'Draft restored. Continue where you left off.' });
          } else if (!cancelled) {
            setMessage({ kind: 'error', text: 'That draft could not be found.' });
          }
        } else {
          const res = await fetch('/api/sessions');
          const data = await res.json();
          if (res.ok && !cancelled) setDrafts(data.sessions);
        }
      } catch (err) {
        if (!cancelled) setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to load' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const steps = useMemo(() => getVisibleSteps(answers), [answers]);
  const stepIndex = Math.max(0, steps.findIndex(s => s.id === stepId));
  const step = steps[stepIndex] ?? steps[0];

  const update = (patch: Partial<WizardAnswers>) => setAnswers(prev => ({ ...prev, ...patch }));

  const setQuestionAnswer = (questionId: string, value: TriState) =>
    setAnswers(prev => {
      let next = setAnswer(prev, questionId, value);
      // A justification only applies to a challenged "No"
      if (value !== 'no' && prev.justifications?.[questionId] !== undefined) {
        const { [questionId]: _removed, ...rest } = prev.justifications;
        next = { ...next, justifications: rest };
      }
      return next;
    });

  const saveDraft = useCallback(
    async (currentStep: string, toSave: WizardAnswers): Promise<string | null> => {
      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: sessionId ?? undefined, answers: toSave, currentStep }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Draft not saved');
        if (!sessionId) {
          setSessionId(data.session.id);
          router.replace({ pathname: '/assess', query: { session: data.session.id } }, undefined, { shallow: true });
        }
        return data.session.id as string;
      } catch (err) {
        setMessage({ kind: 'error', text: `Progress could not be saved: ${err instanceof Error ? err.message : 'unknown error'}` });
        return null;
      }
    },
    [router, sessionId]
  );

  const goTo = async (target: StepId) => {
    setMessage(null);
    setStepId(target);
    await saveDraft(target, answers);
    window.scrollTo({ top: 0 });
  };

  const next = async () => {
    if (!rules) return;
    if (stepId === 'gate' && answers.isAISystem === false) {
      await saveDraft('not_in_scope', answers);
      setNotInScope(true);
      return;
    }
    const target = steps[stepIndex + 1];
    if (target) await goTo(target.id);
  };

  const back = async () => {
    const target = steps[stepIndex - 1];
    if (target) await goTo(target.id);
  };

  const suggest = async () => {
    if (!rules) return;
    setSuggesting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/intake/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemName: answers.systemName, description: answers.description, sessionId: sessionId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Suggestion failed');
      const s: WizardAnswers = data.suggestions ?? {};
      const applied: string[] = [];
      setAnswers(prev => {
        const next: WizardAnswers = { ...prev };
        const fill = <K extends keyof WizardAnswers>(key: K, label: string, empty: boolean) => {
          if (s[key] !== undefined && empty) {
            next[key] = s[key];
            applied.push(label);
          }
        };
        fill('productType', 'productType', !prev.productType);
        fill('primaryFunction', 'primaryFunction', !prev.primaryFunction?.trim());
        fill('role', 'role', !prev.role?.length);
        fill('industry', 'industry', !prev.industry);
        fill('geographies', 'geographies', true);
        fill('vulnerableGroups', 'vulnerableGroups', !prev.vulnerableGroups?.length);
        fill('fundamentalRightsImpact', 'fundamentalRightsImpact', prev.fundamentalRightsImpact === undefined);
        fill('crossBorderImpact', 'crossBorderImpact', prev.crossBorderImpact === undefined);
        fill('generatesOrInteractsWithPeople', 'generatesOrInteractsWithPeople', prev.generatesOrInteractsWithPeople === undefined);
        fill('annex1Answer', 'annex1', prev.annex1Answer === undefined);
        for (const [group, prefix] of [
          ['annex3Answers', 'annex3'],
          ['article5Answers', 'article5'],
          ['exemptionAnswers', 'exemption'],
        ] as const) {
          for (const [id, v] of Object.entries((s[group] ?? {}) as Record<string, TriState>)) {
            if ((prev[group] as Record<string, TriState> | undefined)?.[id] === undefined) {
              next[group] = { ...(next[group] as object), [id]: v } as never;
              applied.push(`${prefix}.${id}`);
            }
          }
        }
        setSuggested(applied);
        return next;
      });
      setMessage({ kind: 'info', text: 'Suggested answers were filled in and marked "Suggested". Review every one before continuing.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Suggestion failed' });
    } finally {
      setSuggesting(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...answers, ...buildAssessmentInput(answers), sessionId: sessionId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error([data.error, data.details].filter(Boolean).join(' - '));
      setResult({ ...data.assessment, systemName: answers.systemName });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Submission failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    setAnswers(INITIAL_ANSWERS);
    setStepId('gate');
    setSessionId(null);
    setChats({});
    setSuggested([]);
    setResult(null);
    setNotInScope(false);
    setMessage(null);
    router.replace('/assess', undefined, { shallow: true });
  };

  // ---- rendering helpers -------------------------------------------------

  const renderQuestion = (q: ScreeningQuestion) => (
    <TriStateQuestion
      key={q.id}
      question={q}
      value={getAnswer(answers, q.id)}
      onChange={v => {
        // Once the user chooses an answer themselves it is no longer just a suggestion
        setSuggested(prev => prev.filter(id => id !== q.id));
        setQuestionAnswer(q.id, v);
      }}
      signals={rules ? getContradictionSignals(q.id, answers, rules) : []}
      justification={answers.justifications?.[q.id] ?? ''}
      onJustification={text => update({ justifications: { ...answers.justifications, [q.id]: text } })}
      llmEnabled={llmEnabled}
      answers={answers}
      sessionId={sessionId}
      chats={chats}
      onChat={(key, s) => setChats(prev => ({ ...prev, [key]: s }))}
      suggested={suggested.includes(q.id)}
    />
  );

  const renderStep = () => {
    if (!rules) return <p className="text-sm text-gray-600">Loading...</p>;
    const questions = getScreeningQuestions(rules);

    switch (step.id) {
      case 'gate':
        return (
          <div className="space-y-4">
            <p className="text-sm">
              The EU AI Act defines an AI system (Article 3(1)) as a machine-based system designed to operate with varying levels of
              autonomy that, for explicit or implicit objectives, infers from the input it receives how to generate outputs such as
              predictions, content, recommendations or decisions that can influence physical or virtual environments.
            </p>
            <p className="text-sm text-gray-600">
              Examples that usually qualify: machine-learning classifiers, recommender systems, generative models. Usually not: fixed
              rule-based calculators or simple statistical formulas with no learning or inference.
            </p>
            <p className="font-medium">Does your system fit this definition?</p>
            <div className="flex gap-2">
              {[
                { label: 'Yes', value: true },
                { label: 'No', value: false },
              ].map(o => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => update({ isAISystem: o.value })}
                  aria-pressed={answers.isAISystem === o.value}
                  className={`px-4 py-1.5 rounded-md border text-sm font-medium ${
                    answers.isAISystem === o.value ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {drafts.length > 0 && (
              <div className="pt-4 border-t space-y-2">
                <p className="text-sm font-medium">Resume a draft</p>
                {drafts.map(d => (
                  <a
                    key={d.id}
                    href={`/assess?session=${d.id}`}
                    className="block border rounded-lg p-3 text-sm hover:bg-gray-50"
                  >
                    <span className="font-medium">{d.answers?.systemName || 'Untitled assessment'}</span>
                    <span className="text-gray-600"> - last edited {new Date(d.updatedAt).toLocaleString()}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        );

      case 'product':
        return (
          <div className="space-y-5">
            <div>
              <Label htmlFor="systemName">System name *</Label>
              <Input id="systemName" value={answers.systemName ?? ''} onChange={e => update({ systemName: e.target.value })} placeholder="e.g. CV screening assistant" />
            </div>
            <div>
              <Label htmlFor="description">Describe the system and its purpose *</Label>
              <Textarea
                id="description"
                rows={5}
                value={answers.description ?? ''}
                onChange={e => update({ description: e.target.value })}
                placeholder="What it does, what data it uses, who uses it and who it affects."
              />
              <p className="text-xs text-gray-500 mt-1">
                Used as supporting context, and to flag answers that don't fit what you wrote. It never decides the classification on its own.
              </p>
              {llmEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={suggesting || (answers.description ?? '').trim().length < 20}
                  onClick={suggest}
                >
                  {suggesting ? 'Suggesting...' : 'Suggest answers from this description'}
                </Button>
              )}
            </div>
            <div>
              <Label>Product type *</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                {PRODUCT_TYPES.map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm border rounded-md p-2">
                    <input type="radio" name="productType" checked={answers.productType === p.id} onChange={() => update({ productType: p.id })} />
                    {p.label}
                  </label>
                ))}
              </div>
              {suggested.includes('productType') && <p className="text-xs text-blue-700 mt-1">Suggested</p>}
            </div>
            <div>
              <Label htmlFor="primaryFunction">Primary function *</Label>
              <Input id="primaryFunction" value={answers.primaryFunction ?? ''} onChange={e => update({ primaryFunction: e.target.value })} placeholder="e.g. Ranks job applicants" />
            </div>
            <div>
              <Label htmlFor="affectedParties">Who or what does it affect?</Label>
              <Input id="affectedParties" value={answers.affectedParties ?? ''} onChange={e => update({ affectedParties: e.target.value })} placeholder="e.g. Job applicants, hiring managers" />
            </div>
          </div>
        );

      case 'role':
        return (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Select every role your organisation has for this system.</p>
            {ROLE_OPTIONS.map(r => (
              <label key={r.id} className="flex items-start gap-2 text-sm border rounded-md p-3">
                <input
                  type="checkbox"
                  className="w-4 h-4 mt-0.5"
                  checked={answers.role?.includes(r.id) ?? false}
                  onChange={() => update({ role: toggle(answers.role, r.id) })}
                />
                {r.label}
              </label>
            ))}
            {suggested.includes('role') && <p className="text-xs text-blue-700">Suggested</p>}
          </div>
        );

      case 'sector': {
        const active = getActiveAnnex3Categories(answers);
        return (
          <div className="space-y-4">
            {questions.filter(q => q.step === 'sector').map(renderQuestion)}
            {active.map(cat => {
              const catName = rules.annexIII.find(c => c.id === cat)?.name ?? cat;
              return (
                <div key={cat} className="space-y-3 border-l-4 border-blue-200 pl-4">
                  <p className="text-sm font-semibold">More about "{catName}"</p>
                  {(SECTOR_QUESTIONS[cat] ?? []).map(sq =>
                    renderSectorQuestion(sq.id, sq.text)
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      case 'article5': {
        const anyYes = Object.values(answers.article5Answers ?? {}).includes('yes');
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">These practices are prohibited under Article 5. Answer honestly; "unsure" is safer than a guess.</p>
            {questions.filter(q => q.step === 'article5').map(renderQuestion)}
            {anyYes && (
              <Alert variant="destructive">
                <AlertDescription>
                  A Yes here classifies the system as UNACCEPTABLE RISK (prohibited). You can still complete the record.
                </AlertDescription>
              </Alert>
            )}
          </div>
        );
      }

      case 'exemption':
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Because your system may fall in an Annex III high-risk area, Article 6(3) lets it avoid the high-risk label in narrow cases. Claiming
              this exemption must be documented and justified.
            </p>
            {questions.filter(q => q.step === 'exemption').map(renderQuestion)}
          </div>
        );

      case 'context':
        return (
          <div className="space-y-5">
            <div>
              <Label htmlFor="industry">Industry *</Label>
              <select
                id="industry"
                className="mt-1 block w-full h-10 rounded-md border border-gray-200 bg-white px-2 text-sm"
                value={answers.industry ?? ''}
                onChange={e => update({ industry: e.target.value })}
              >
                <option value="" disabled>
                  Select an industry
                </option>
                {INDUSTRY_OPTIONS.map(i => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Geographies *</Label>
              <CheckboxList options={GEOGRAPHY_OPTIONS} selected={answers.geographies ?? []} onToggle={o => update({ geographies: toggle(answers.geographies, o) })} />
            </div>
            <div>
              <Label>Vulnerable groups affected</Label>
              <CheckboxList options={VULNERABLE_GROUP_OPTIONS} selected={answers.vulnerableGroups ?? []} onToggle={o => update({ vulnerableGroups: toggle(answers.vulnerableGroups, o) })} />
            </div>
            <div className="space-y-2">
              {[
                ['fundamentalRightsImpact', 'May impact fundamental rights'],
                ['crossBorderImpact', 'May have cross-border impact'],
                ['generatesOrInteractsWithPeople', 'Interacts directly with people or generates synthetic audio, image, video or text'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={!!(answers as Record<string, unknown>)[key]}
                    onChange={e => update({ [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(['riskSeverity', 'riskLikelihood'] as const).map(key => (
                <div key={key}>
                  <Label htmlFor={key}>{key === 'riskSeverity' ? 'Risk severity (1-5, optional)' : 'Risk likelihood (1-5, optional)'}</Label>
                  <Input
                    id={key}
                    type="number"
                    min={1}
                    max={5}
                    value={answers[key] ?? ''}
                    onChange={e => update({ [key]: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                </div>
              ))}
            </div>
            {isGpaiComputeVisible(answers) && (
              <div className="space-y-3 border-l-4 border-blue-200 pl-4">
                <div>
                  <Label htmlFor="gpaiCompute">Training compute (FLOPs), if known</Label>
                  <Input
                    id="gpaiCompute"
                    placeholder="e.g. 1e25"
                    value={answers.gpaiTrainingComputeFLOPs ?? ''}
                    onChange={e => update({ gpaiTrainingComputeFLOPs: e.target.value === '' || Number.isNaN(Number(e.target.value)) ? undefined : Number(e.target.value) })}
                  />
                  <p className="text-xs text-gray-500 mt-1">10^25 FLOPs or more presumes systemic risk under Article 51.</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={!!answers.gpaiSystemicRiskDesignation}
                    onChange={e => update({ gpaiSystemicRiskDesignation: e.target.checked })}
                  />
                  The Commission has designated the model as having systemic risk
                </label>
              </div>
            )}
          </div>
        );

      case 'australia':
        return (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                <span className="font-medium">Best effort, expert review required.</span> {AUSTRALIA_DISCLAIMER}
              </AlertDescription>
            </Alert>
            <p className="text-sm text-gray-600">
              You selected Australia. These questions follow the {AUSTRALIA_STANDARD.name} ({AUSTRALIA_STANDARD.published.slice(0, 4)}), which
              replaced the 10-guardrail Voluntary AI Safety Standard with six essential practices. It is voluntary. Your answers decide whether the
              system is treated as aligned with it and how it lines up with the EU AI Act. "Unsure" is never counted as aligned.
            </p>
            {AUSTRALIA_PRACTICES.map(p => (
              <div key={p.id} className="space-y-3">
                <p className="text-sm font-semibold">
                  Practice {p.number}: {p.name}
                </p>
                {getAustraliaQuestions()
                  .filter(q => q.article === `Australia: ${p.name}`)
                  .map(renderAustraliaQuestion)}
              </div>
            ))}
          </div>
        );

      case 'review': {
        const rows = getAnswerRows(answers, rules);
        const sections = Array.from(new Set(rows.map(r => r.section)));
        const challenged = getChallengedAnswers(answers, rules);
        const unsure = [...questions, ...(steps.some(s => s.id === 'australia') ? getAustraliaQuestions() : [])].filter(
          q => getAnswer(answers, q.id) === 'unsure'
        );
        return (
          <div className="space-y-4">
            {(unsure.length > 0 || challenged.length > 0) && (
              <Alert>
                <AlertDescription>
                  {unsure.length > 0 && <p>{unsure.length} unsure answer(s) will be treated pessimistically and added to your checklist.</p>}
                  {challenged.length > 0 && <p>{challenged.length} "No" answer(s) conflict with other information and will be flagged for evidence.</p>}
                </AlertDescription>
              </Alert>
            )}
            {sections.map(section => (
              <div key={section}>
                <p className="text-sm font-semibold mb-1">{section}</p>
                <dl className="text-sm space-y-1">
                  {rows.filter(r => r.section === section).map((r, i) => (
                    <div key={i} className="flex gap-2">
                      <dt className="text-gray-600 min-w-40">{r.label}</dt>
                      <dd>{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            <div>
              <Label htmlFor="notes">Additional notes (optional)</Label>
              <Textarea id="notes" rows={3} value={answers.additionalNotes ?? ''} onChange={e => update({ additionalNotes: e.target.value })} />
            </div>
          </div>
        );
      }
    }
  };

  // Australia questions reuse the tri-state UI. The LLM helper is off (it only knows the EU questions),
  // and a "Yes" that other answers contradict is flagged here and evidenced in the result.
  function renderAustraliaQuestion(q: ScreeningQuestion) {
    const key = q.id.slice('australia.'.length);
    const signals = getAustraliaSignals(key, answers);
    return (
      <div key={q.id} className="space-y-1">
        <TriStateQuestion
          question={q}
          value={getAnswer(answers, q.id)}
          onChange={v => setQuestionAnswer(q.id, v)}
          signals={[]}
          justification=""
          onJustification={() => undefined}
          llmEnabled={false}
          answers={answers}
          sessionId={sessionId}
          chats={chats}
          onChat={() => undefined}
        />
        {signals.map((s, i) => (
          <p key={i} className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded px-2 py-1">
            This "Yes" may not hold: {s} It will be flagged for evidence in the result.
          </p>
        ))}
      </div>
    );
  }

  function renderSectorQuestion(id: string, text: string) {
    const fake: ScreeningQuestion = { id, step: 'sector', label: text, text, helpText: '', examples: [], article: '' };
    return (
      <TriStateQuestion
        key={id}
        question={fake}
        value={answers.sectorAnswers?.[id]}
        onChange={v => update({ sectorAnswers: { ...answers.sectorAnswers, [id]: v } })}
        signals={[]}
        justification=""
        onJustification={() => undefined}
        llmEnabled={false}
        answers={answers}
        sessionId={sessionId}
        chats={chats}
        onChat={() => undefined}
      />
    );
  }

  // ---- page --------------------------------------------------------------

  const complete = rules ? isStepComplete(step.id, answers, rules) : false;
  const isReview = step.id === 'review';

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>New assessment | AI Governance</title>
      </Head>
      <AppHeader user={user} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">New assessment</h1>
          <Link href="/dashboard" className="text-sm text-blue-700 hover:underline">
            Back to dashboard
          </Link>
        </div>

        {message && (
          <Alert variant={message.kind === 'error' ? 'destructive' : 'default'} className="mb-4">
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {result ? (
          <div className="space-y-4">
            <ResultView result={result} />
            <Button onClick={restart}>Start a new assessment</Button>
          </div>
        ) : notInScope ? (
          <Card>
            <CardHeader>
              <CardTitle>Not in scope</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>
                Based on your answer, this system does not meet the Article 3(1) definition of an AI system, so the EU AI Act classification
                does not apply. Your answer has been saved as a draft record.
              </p>
              <Button onClick={restart}>Start a new assessment</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <ol className="flex flex-wrap gap-2 mb-6" aria-label="Progress">
              {steps.map((s, i) => (
                <li
                  key={s.id}
                  aria-current={s.id === step.id ? 'step' : undefined}
                  className={`text-xs px-3 py-1 rounded-full border ${
                    s.id === step.id ? 'bg-gray-900 text-white border-gray-900' : i < stepIndex ? 'bg-green-100 text-green-800 border-green-200' : 'bg-white text-gray-600'
                  }`}
                >
                  {i + 1}. {s.title}
                </li>
              ))}
            </ol>

            <Card>
              <CardHeader>
                <CardTitle>
                  Step {stepIndex + 1} of {steps.length}: {step.title}
                </CardTitle>
                <p className="text-sm text-gray-600">{step.description}</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {renderStep()}

                <div className="flex justify-between pt-4 border-t">
                  <Button type="button" variant="outline" onClick={back} disabled={stepIndex === 0}>
                    Back
                  </Button>
                  {isReview ? (
                    <Button type="button" onClick={submit} disabled={submitting || !rules}>
                      {submitting ? 'Classifying...' : 'Classify system'}
                    </Button>
                  ) : (
                    <Button type="button" onClick={next} disabled={!complete}>
                      {step.id === 'gate' && answers.isAISystem === false ? 'Finish' : 'Next'}
                    </Button>
                  )}
                </div>
                {!complete && !isReview && (
                  <p className="text-xs text-gray-500">Answer every question on this step to continue.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
