'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, KeyRound, Plug, Trash2, Save, CheckCircle2, XCircle } from 'lucide-react';
import { AI_FEATURES, AI_FEATURE_LABELS, AI_MODELS, type AiFeature, type AiModel, type AiSettingsDto } from '@pharmaos/shared';
import { useAiSettings, useSetAiKey, useRemoveAiKey, useTestAi, useUpdateAiSettings } from '@/features/ai/api';
import { usePermission } from '@/features/auth/permissions';
import { useAssistant } from '@/stores/assistant';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Checkbox, Switch } from '@/components/ui/input';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Badge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function AiSettingsPage() {
  const settings = useAiSettings();
  const canManage = usePermission('ai.manage');
  if (settings.isPending) return <Spinner />;
  if (settings.isError) return <ErrorState message={errorMessage(settings.error)} onRetry={() => settings.refetch()} />;
  const s = settings.data;
  return (
    <>
      <PageHeader title="AI & Gemini" description="An optional assistant that answers from your own data, explains screens and prepares work for you to confirm. The pharmacy system never depends on it." />
      {!canManage ? <Alert variant="info" className="mb-4">Only administrators with the “Configure AI” permission can change these settings.</Alert> : null}
      <div className="space-y-5">
        <StatusCard s={s} canManage={canManage} />
        <KeyCard s={s} canManage={canManage} />
        <FeaturesCard s={s} canManage={canManage} />
        <ModelCard s={s} canManage={canManage} />
      </div>
    </>
  );
}

function StatusCard({ s, canManage }: { s: AiSettingsDto; canManage: boolean }) {
  const ask = useAssistant((s) => s.ask);
  const update = useUpdateAiSettings();
  const tokens = s.usage.inputTokens + s.usage.outputTokens;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary-600" /> AI status</CardTitle>
          <CardDescription>{s.connected && s.enabled ? 'Your AI assistant is ready to help across your pharmacy.' : s.connected ? 'A key is connected but AI is switched off.' : 'AI features are not connected. Add your Gemini API key below to enable your AI assistant.'}</CardDescription>
        </div>
        {s.connected && s.enabled ? <Badge variant="success" dot>Gemini AI connected</Badge> : <Badge variant="neutral" dot>Not connected</Badge>}
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {s.connected ? <label className="flex items-center gap-2 text-sm"><Switch checked={s.enabled} disabled={!canManage || update.isPending} onCheckedChange={(v) => update.mutate({ enabled: v }, { onSuccess: () => toast.success(v ? 'AI enabled' : 'AI disabled'), onError: (e) => toast.error(errorMessage(e)) })} aria-label="Enable AI" /> AI enabled for this organization</label> : null}
        {s.connected && s.enabled ? <Button size="sm" onClick={() => ask("Give me today's pharmacy summary.")}><Sparkles className="h-3.5 w-3.5" /> Test AI</Button> : null}
        <span className="text-[12px] text-fg-subtle">This month: {s.usage.requests} requests · {tokens.toLocaleString('en-IN')} tokens{s.monthlyTokenLimit ? ` of ${s.monthlyTokenLimit.toLocaleString('en-IN')}` : ''}{s.usage.limitReached ? ' · limit reached' : ''}</span>
      </CardContent>
    </Card>
  );
}

function KeyCard({ s, canManage }: { s: AiSettingsDto; canManage: boolean }) {
  const setKey = useSetAiKey();
  const remove = useRemoveAiKey();
  const test = useTestAi();
  const [apiKey, setApiKey] = useState('');
  const [removing, setRemoving] = useState(false);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Gemini API key</CardTitle><CardDescription>Create a key in Google AI Studio and paste it here. It is checked with Google before saving, stored encrypted on the server, and never shown again or sent to the browser.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {s.keyMasked ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <code className="rounded bg-surface-subtle px-2 py-1 font-mono">{s.keyMasked}</code>
            <span className="text-[12px] text-fg-subtle">added {s.keyAddedAt ? formatDateTime(s.keyAddedAt) : '—'}</span>
            {s.lastTestedAt ? <span className={`flex items-center gap-1 text-[12px] ${s.lastTestOk ? 'text-success-700' : 'text-danger-600'}`}>{s.lastTestOk ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} {s.lastTestMessage} ({formatDateTime(s.lastTestedAt)})</span> : null}
          </div>
        ) : null}
        {canManage ? (
          <FormField label={s.keyMasked ? 'Replace key' : 'API key'} htmlFor="gemini-key" hint="Starts with “AIza…”. Only the last four characters are ever displayed.">
            <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIza…" />
          </FormField>
        ) : null}
      </CardContent>
      {canManage ? (
        <CardFooter>
          {s.keyMasked ? <Button variant="ghost" onClick={() => setRemoving(true)} disabled={remove.isPending}><Trash2 className="h-4 w-4" /> Remove key</Button> : null}
          {s.keyMasked ? <Button variant="secondary" loading={test.isPending} onClick={() => test.mutate(undefined, { onSuccess: (r) => (r.lastTestOk ? toast.success(r.lastTestMessage) : toast.error(r.lastTestMessage)), onError: (e) => toast.error(errorMessage(e)) })}><Plug className="h-4 w-4" /> Test connection</Button> : null}
          <Button loading={setKey.isPending} disabled={apiKey.trim().length < 20} onClick={() => setKey.mutate(apiKey.trim(), { onSuccess: () => { toast.success('Gemini AI connected ✓'); setApiKey(''); }, onError: (e) => toast.error(errorMessage(e)) })}><Save className="h-4 w-4" /> {s.keyMasked ? 'Replace & test' : 'Save & connect'}</Button>
        </CardFooter>
      ) : null}
      <ConfirmDialog open={removing} onOpenChange={setRemoving} title="Remove the Gemini API key?" description="AI features switch off immediately. The pharmacy system keeps working normally. You can add a key again any time." confirmLabel="Remove key" destructive loading={remove.isPending} onConfirm={() => remove.mutate(undefined, { onSuccess: () => { toast.success('Key removed, AI disabled'); setRemoving(false); }, onError: (e) => toast.error(errorMessage(e)) })} />
    </Card>
  );
}

function FeaturesCard({ s, canManage }: { s: AiSettingsDto; canManage: boolean }) {
  const update = useUpdateAiSettings();
  const [features, setFeatures] = useState<AiFeature[]>(s.features);
  useEffect(() => setFeatures(s.features), [s.features]);
  return (
    <Card>
      <CardHeader><CardTitle>AI features</CardTitle><CardDescription>Turn individual capabilities on or off. Each one still respects every user&apos;s normal permissions.</CardDescription></CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {AI_FEATURES.map((f) => (
          <label key={f} className="flex items-start gap-3 rounded-[var(--radius-control)] border border-border p-3">
            <Checkbox className="mt-0.5" checked={features.includes(f)} disabled={!canManage} onChange={(e) => setFeatures((cur) => (e.target.checked ? [...cur, f] : cur.filter((x) => x !== f)))} />
            <span><span className="block text-sm font-medium">{AI_FEATURE_LABELS[f].label}</span><span className="block text-[12px] text-fg-subtle">{AI_FEATURE_LABELS[f].description}</span></span>
          </label>
        ))}
      </CardContent>
      {canManage ? <CardFooter><Button loading={update.isPending} onClick={() => update.mutate({ features }, { onSuccess: () => toast.success('AI features saved'), onError: (e) => toast.error(errorMessage(e)) })}><Save className="h-4 w-4" /> Save features</Button></CardFooter> : null}
    </Card>
  );
}

function ModelCard({ s, canManage }: { s: AiSettingsDto; canManage: boolean }) {
  const update = useUpdateAiSettings();
  const [form, setForm] = useState({ model: s.model, liteModel: s.liteModel, temperature: s.temperature, maxOutputTokens: s.maxOutputTokens, timeoutMs: s.timeoutMs, monthlyTokenLimit: s.monthlyTokenLimit, language: s.language });
  useEffect(() => setForm({ model: s.model, liteModel: s.liteModel, temperature: s.temperature, maxOutputTokens: s.maxOutputTokens, timeoutMs: s.timeoutMs, monthlyTokenLimit: s.monthlyTokenLimit, language: s.language }), [s]);
  return (
    <Card>
      <CardHeader><CardTitle>Model, language & limits</CardTitle><CardDescription>Cheaper model for quick help, stronger model for reading invoices and analysis. A monthly token limit keeps cost predictable.</CardDescription></CardHeader>
      <CardContent>
        <FormGrid className="sm:grid-cols-3">
          <FormField label="Main model" htmlFor="ai-model" hint="Chat, reports, invoice reading."><Select value={form.model} disabled={!canManage} onChange={(e) => setForm({ ...form, model: e.target.value as AiModel })}>{AI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}</Select></FormField>
          <FormField label="Light model" htmlFor="ai-lite" hint="“What is this?” help and short lookups."><Select value={form.liteModel} disabled={!canManage} onChange={(e) => setForm({ ...form, liteModel: e.target.value as AiModel })}>{AI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}</Select></FormField>
          <FormField label="Reply language" htmlFor="ai-lang"><Select value={form.language} disabled={!canManage} onChange={(e) => setForm({ ...form, language: e.target.value as AiSettingsDto['language'] })}><option value="auto">Match the user (auto)</option><option value="en">Simple English</option><option value="hi">Hindi</option><option value="hinglish">Hinglish</option></Select></FormField>
          <FormField label="Creativity (temperature)" htmlFor="ai-temp" hint="Keep low for factual answers."><Input type="number" min={0} max={1} step={0.1} value={form.temperature} disabled={!canManage} onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })} /></FormField>
          <FormField label="Max reply tokens" htmlFor="ai-max"><Input type="number" min={256} max={8192} step={256} value={form.maxOutputTokens} disabled={!canManage} onChange={(e) => setForm({ ...form, maxOutputTokens: Number(e.target.value) })} /></FormField>
          <FormField label="Timeout (seconds)" htmlFor="ai-timeout"><Input type="number" min={5} max={120} value={Math.round(form.timeoutMs / 1000)} disabled={!canManage} onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) * 1000 })} /></FormField>
          <FormField label="Monthly token limit" htmlFor="ai-limit" hint="0 = no limit. Requests stop when reached."><Input type="number" min={0} step={10000} value={form.monthlyTokenLimit} disabled={!canManage} onChange={(e) => setForm({ ...form, monthlyTokenLimit: Number(e.target.value) })} /></FormField>
        </FormGrid>
      </CardContent>
      {canManage ? <CardFooter><Button loading={update.isPending} onClick={() => update.mutate(form, { onSuccess: () => toast.success('AI configuration saved'), onError: (e) => toast.error(errorMessage(e)) })}><Save className="h-4 w-4" /> Save configuration</Button></CardFooter> : null}
    </Card>
  );
}
