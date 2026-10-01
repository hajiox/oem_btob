"use client";

import { useEffect, useRef, useState } from "react";
import {
  REPLY_TEMPLATES,
  type PreparedReply,
  type ReplySuggestion,
  type ReplyTemplateId,
} from "@/lib/oem-reply-assist-shared";

type Props = {
  leadId: string;
  disabled: boolean;
  composerKey: string;
  hasExistingText: boolean;
  onApply: (candidate: ReplySuggestion) => void;
};

type Action = "prepare" | "generate" | "validate";
type RequestPayload = Record<string, unknown>;
type AssistFailure = Error & { unknownDelivery?: boolean };
const DEFAULT_INSTRUCTION = "確認済みの事実と定型文に沿って、簡潔で丁寧な返信案を作ってください。未確認の条件は約束せず、確認してご案内する表現にしてください。";

async function callAssist(action: Action, payload: RequestPayload) {
  let response: Response;
  try {
    response = await fetch("/api/oem/reply-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    const failure = new Error("通信結果を確認できません。再送せず、同じ内容で結果を確認してください。") as AssistFailure;
    failure.unknownDelivery = true;
    throw failure;
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "返信案の処理に失敗しました。");
  }
  if ((action === "prepare" && !body.prepared) || (action === "generate" && !body.candidate)) {
    const failure = new Error("返信案の応答を確認できません。再送せず、同じ内容で結果を確認してください。") as AssistFailure;
    failure.unknownDelivery = true;
    throw failure;
  }
  return body;
}

function requestId() {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new Error("安全な返信案IDを生成できません。");
  return id;
}

export function OemReplyAssistant({ leadId, disabled, composerKey, hasExistingText, onApply }: Props) {
  const [templateId, setTemplateId] = useState<ReplyTemplateId>(REPLY_TEMPLATES[0].id);
  const [prepared, setPrepared] = useState<PreparedReply | null>(null);
  const [candidate, setCandidate] = useState<ReplySuggestion | null>(null);
  const [question, setQuestion] = useState("");
  const [instruction, setInstruction] = useState("");
  const [consent, setConsent] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [notice, setNotice] = useState("");
  const [unknown, setUnknown] = useState<Action | null>(null);
  const preparedKey = useRef(composerKey);
  const sequence = useRef(0);
  const busyRef = useRef<Action | null>(null);
  const composerKeyRef = useRef(composerKey);
  const disabledRef = useRef(disabled);
  const lastRequest = useRef<{ action: Action; payload: RequestPayload } | null>(null);

  composerKeyRef.current = composerKey;
  disabledRef.current = disabled;

  useEffect(() => {
    sequence.current += 1;
    preparedKey.current = composerKeyRef.current;
    setPrepared(null);
    setCandidate(null);
    setQuestion("");
    setInstruction("");
    setConsent(false);
    setReplaceExisting(false);
    setBusy(null);
    busyRef.current = null;
    setUnknown(null);
    setNotice("");
  }, [leadId]);

  function changedInput() {
    setConsent(false);
    setCandidate(null);
    setNotice("");
  }

  function changeTemplate(value: ReplyTemplateId) {
    setTemplateId(value);
    setPrepared(null);
    setCandidate(null);
    setQuestion("");
    setInstruction("");
    setConsent(false);
    setNotice("");
  }

  async function run(action: Action, payload: RequestPayload) {
    if (busyRef.current) return null;
    const current = sequence.current;
    const requestStartKey = composerKeyRef.current;
    busyRef.current = action;
    setBusy(action);
    setUnknown(null);
    setNotice("");
    lastRequest.current = { action, payload };
    try {
      const result = await callAssist(action, payload);
      if (current !== sequence.current) return;
      busyRef.current = null;
      setBusy(null);
      if (requestStartKey !== composerKeyRef.current) {
        setNotice("会話が変わりました。返信案の結果は適用していません。再準備してください。");
        return null;
      }
      if (action === "prepare") {
        const next = result.prepared as PreparedReply;
        setPrepared(next);
        setCandidate(next);
        setQuestion(next.question || "");
        setInstruction(DEFAULT_INSTRUCTION);
        preparedKey.current = composerKeyRef.current;
        setConsent(false);
      } else if (action === "generate") {
        setCandidate(result.candidate as ReplySuggestion);
      }
      return result;
    } catch (error) {
      if (current !== sequence.current) return;
      setBusy(null);
      busyRef.current = null;
      const failure = error as AssistFailure;
      if (failure.unknownDelivery) setUnknown(action);
      setNotice(failure.message || "返信案の処理に失敗しました。");
      return null;
    }
  }

  async function prepare() {
    try {
      await run("prepare", { leadId, templateId });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "定型文を準備できません。");
    }
  }

  async function generate() {
    if (!prepared || !consent || !question.trim()) return;
    try {
      const id = requestId();
      await run("generate", {
        leadId,
        templateId,
        snapshot: prepared.snapshot,
        question,
        instruction: instruction.trim() || DEFAULT_INSTRUCTION,
        consentConfirmed: true,
        requestId: id,
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "安全な返信案IDを生成できません。");
    }
  }

  async function retryGenerate() {
    const request = lastRequest.current;
    if (!request || request.action !== "generate") return;
    await run("generate", request.payload);
  }

  async function apply() {
    if (!candidate || busy || busyRef.current || unknown || disabledRef.current || preparedKey.current !== composerKeyRef.current) {
      if (candidate && preparedKey.current !== composerKeyRef.current) setNotice("会話が変わりました。返信案を再準備してください。");
      return;
    }
    if (hasExistingText && !replaceExisting) return;
    const current = sequence.current;
    busyRef.current = "validate";
    setBusy("validate");
    setNotice("");
    try {
      await callAssist("validate", { leadId, templateId, snapshot: candidate.snapshot });
      if (current !== sequence.current || preparedKey.current !== composerKeyRef.current || disabledRef.current) {
        setNotice("会話が変わりました。返信案を再準備してください。");
        return;
      }
      onApply(candidate);
      setNotice("返信本文に反映しました。送信は行っていません。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "返信案の有効性を確認できません。");
      setCandidate(null);
    } finally {
      if (current === sequence.current) {
        busyRef.current = null;
        setBusy(null);
      }
    }
  }

  async function retryPrepare() {
    const request = lastRequest.current;
    if (!request || request.action !== "prepare") return;
    await run("prepare", request.payload);
  }

  const controlsDisabled = disabled || !!busy || !!unknown;
  const aiUnknown = unknown === "generate";
  const aiData = prepared as (PreparedReply & { aiTemplateText?: string; aiFacts?: string[] }) | null;
  return (
    <details style={box}>
      <summary style={summary}>定型文・AI返信案</summary>
      <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
        <label>
          定型文
          <select value={templateId} onChange={(e) => changeTemplate(e.target.value as ReplyTemplateId)} disabled={controlsDisabled} style={input}>
            {REPLY_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void prepare()} disabled={controlsDisabled} style={button}>{busy === "prepare" ? "準備中…" : "定型文を準備"}</button>
        {unknown === "prepare" && <button type="button" onClick={() => void retryPrepare()} disabled={!!busy} style={button}>同じ内容で再試行</button>}
        {prepared && <>
          <label>
            問い合わせ文（AIへの質問）
            <textarea value={question} maxLength={6000} onChange={(e) => { setQuestion(e.target.value); changedInput(); }} disabled={controlsDisabled} rows={4} style={input} />
          </label>
          <label>
            追加指示（任意）
            <textarea value={instruction} maxLength={1000} onChange={(e) => { setInstruction(e.target.value); changedInput(); }} disabled={controlsDisabled} rows={2} style={input} />
          </label>
          <p style={muted}>AIに送る定型文：{aiData?.aiTemplateText || "（未設定）"}</p>
          <p style={muted}>AIに送る案件情報：{aiData?.aiFacts?.length ? aiData.aiFacts.join("／") : "なし"}</p>
          <p style={muted}>Googleに送る本文から宛名・署名は除きます。匿名化は保証できないため、送信内容を確認してください。</p>
          <label style={check}><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={controlsDisabled} />表示した問い合わせ文・定型文・案件情報をGoogle Geminiに送ることを確認しました</label>
          <button type="button" onClick={() => void generate()} disabled={controlsDisabled || aiUnknown || !prepared.aiConfigured || !consent || !question.trim()} style={button}>{busy === "generate" ? "AI返信案を作成中…" : "Google Geminiで返信案を作成"}</button>
          {!prepared.aiConfigured && <p style={muted}>AI返信案は未設定です。定型文候補は利用できます。</p>}
          {aiUnknown && <button type="button" onClick={() => void retryGenerate()} disabled={!!busy} style={button}>生成結果を確認（同じID）</button>}
          <p style={muted}>AI案は確認用の下書きです。自動保存・自動送信は行いません。</p>
        </>}
        {candidate && <div style={preview}>
          <strong>{candidate.source === "ai" ? "AI返信案" : "定型文候補"}</strong>
          <p>{candidate.subject || "(件名なし)"}</p>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{candidate.text}</p>
          {candidate.warnings.map((warning) => <p key={warning} style={warningStyle}>注意：{warning}</p>)}
          {hasExistingText && <label style={check}><input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} disabled={!!busy || !!unknown} />現在の件名・本文を置き換える</label>}
          <button type="button" onClick={() => void apply()} disabled={controlsDisabled || (hasExistingText && !replaceExisting)} style={primary}>{busy === "validate" ? "確認中…" : "返信本文に反映"}</button>
        </div>}
        {notice && <p role="status" style={noticeStyle}>{notice}</p>}
      </div>
    </details>
  );
}

const box = { marginTop: 12, padding: 12, border: "1px solid var(--admin-border)", borderRadius: 6 };
const summary = { cursor: "pointer", fontWeight: 700 };
const input = { display: "block", width: "100%", marginTop: 5, padding: "8px 10px", background: "var(--admin-card)", color: "var(--admin-text)", border: "1px solid var(--admin-border)", borderRadius: 5, fontSize: 14 };
const button = { padding: "7px 11px", border: "1px solid var(--admin-border)", borderRadius: 5, background: "transparent", color: "var(--admin-text)", cursor: "pointer" };
const primary = { ...button, background: "var(--admin-accent)", color: "#fff", fontWeight: 700 };
const preview = { padding: 12, border: "1px solid var(--admin-accent)", borderRadius: 5 };
const muted = { margin: 0, color: "var(--admin-text-muted)", fontSize: 12 };
const warningStyle = { color: "#fbbf24", margin: "6px 0" };
const noticeStyle = { margin: 0, color: "var(--admin-text-muted)" };
const check = { display: "flex", gap: 7, alignItems: "flex-start", fontSize: 13 };
