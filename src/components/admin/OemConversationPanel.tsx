"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OemReplyAssistant } from "@/components/admin/OemReplyAssistant";
import type { ReplyContextStamp } from "@/lib/oem-reply-assist-shared";
type Attachment = { id: string; name: string; size: number };
type Message = {
  id: string;
  direction: string;
  subject: string;
  text: string;
  from: string;
  to: string;
  sentAt: string;
  status?: string;
  requestId?: string;
  attachments: Attachment[];
  reviewedAt?: string | null;
  handledAt?: string | null;
  handledBy?: string | null;
  replyClosedAt?: string | null;
  replyToId?: string | null;
};
type MailboxData = {
  messages: Message[];
  draft: { subject: string; text: string; updatedAt: string; replyContext: ReplyContextStamp | null } | null;
  hasMore: boolean;
  nextCursor?: string;
  connected: boolean;
  hasUnresolved?: boolean;
  newestPendingReplyId?: string;
};
type Upload = { name: string; type: string; base64: string; size: number };
const MAX_BYTES = 3 * 1024 * 1024,
  MAX_FILES = 10,
  CHANGED = "oem-conversation-changed";
const ALLOWED = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "txt",
  "csv",
  "docx",
  "xlsx",
]);
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
async function api(action: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/oem/mail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const error = new Error(
      typeof data.error === "string"
        ? data.error
        : "メール操作に失敗しました。",
    ) as Error & { noSend?: boolean };
    error.noSend = data.status === "not_sent";
    throw error;
  }
  return data;
}
const changed = () => window.dispatchEvent(new Event(CHANGED));
export function OemConversationPanel({
  leadId,
  leadEmail,
}: {
  leadId: string;
  leadEmail: string;
}) {
  const [data, setData] = useState<MailboxData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [subject, setSubject] = useState(""),
    [text, setText] = useState(""),
    [files, setFiles] = useState<Upload[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<{
      subject: string;
      text: string;
      files: Upload[];
      replyToMessageId?: string;
    } | null>(null),
    [sendRequestId, setSendRequestId] = useState<string | null>(null),
    [sendState, setSendState] = useState("idle"),
    [syncCursor, setSyncCursor] = useState<string>(),
    [syncHasMore, setSyncHasMore] = useState(false),
    [appliedReply, setAppliedReply] = useState<ReplyContextStamp | null>(null),
    [reloadDraft, setReloadDraft] = useState(false);
  const sendRef = useRef<string | null>(null),
    dirty = useRef(false),
    draftStamp = useRef<string | null>(null),
    reviewed = useRef(new Set<string>()),
    inputRef = useRef<HTMLInputElement>(null),
    totalBytes = useMemo(() => files.reduce((n, f) => n + f.size, 0), [files]);
  const locked =
    !!data?.hasUnresolved ||
    !!data?.messages.some((m) =>
      ["pending", "sending", "unknown"].includes(m.status || ""),
    ) ||
    ["sending", "pending", "unknown"].includes(sendState);
  const list = useCallback(
    async (cursor?: string, preserve = true) => {
      const result = (await api("list", {
        leadId,
        ...(cursor ? { cursor } : {}),
      })) as unknown as MailboxData;
      setData((old) =>
        cursor && old
          ? {
              ...result,
              messages: [
                ...old.messages,
                ...result.messages.filter(
                  (m) => !old.messages.some((x) => x.id === m.id),
                ),
              ],
            }
          : result,
      );
      const reconciled = result.messages.find(
        (m) =>
          sendRef.current &&
          m.requestId === sendRef.current &&
          m.status === "sent",
      );
      if (reconciled) {
        setSendState("sent");
        setPreview(null);
        setFiles([]);
        setSendRequestId(null);
        sendRef.current = null;
        setSubject("");
        setText("");
        dirty.current = false;
        draftStamp.current = null;
        setAppliedReply(null);
      }
      if (!preserve && !dirty.current) {
        setSubject(result.draft?.subject || "");
        setText(result.draft?.text || "");
        draftStamp.current = result.draft?.updatedAt || null;
        setAppliedReply(result.draft?.replyContext || null);
      }
    },
    [leadId],
  );
  useEffect(() => {
    let active = true;
    void list(undefined, false)
      .catch(
        (e) =>
          active &&
          setError(
            e instanceof Error ? e.message : "会話を読み込めませんでした。",
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [list]);
  useEffect(() => {
    const ids =
      data?.messages
        .filter(
          (m) =>
            m.direction === "inbound" &&
            !m.reviewedAt &&
            !reviewed.current.has(m.id),
        )
        .map((m) => m.id) || [];
    if (!ids.length) return;
    const batch = ids.slice(0, 50);
    batch.forEach((id) => reviewed.current.add(id));
    void api("review", { leadId, messageIds: batch })
      .then(() => {
        setData((old) =>
          old
            ? {
                ...old,
                messages: old.messages.map((m) =>
                  batch.includes(m.id)
                    ? { ...m, reviewedAt: new Date().toISOString() }
                    : m,
                ),
              }
            : old,
        );
        changed();
      })
      .catch(() => batch.forEach((id) => reviewed.current.delete(id)));
  }, [data?.messages, leadId]);
  async function sync(cursor?: string) {
    setBusy(true);
    try {
      const r = await api("sync", { leadId, ...(cursor ? { cursor } : {}) });
      setSyncCursor(r.nextCursor as string | undefined);
      setSyncHasMore(Boolean(r.hasMore));
      setNotice(String(r.message || "同期しました。"));
      changed();
      await list();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "同期できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  async function handle(message: Message, handled: boolean) {
    setBusy(true);
    try {
      await api("handle", { leadId, messageId: message.id, handled });
      await list();
      changed();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "状態を更新できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      const r = await api("draft", { leadId, subject, text, expectedUpdatedAt: draftStamp.current, replyContext: appliedReply });
      setNotice(
        r.success
          ? "下書きを保存しました。"
          : String(r.error || "下書きを保存できませんでした。"),
      );
      if (r.success) {
        dirty.current = false;
        draftStamp.current = String(r.updatedAt);
        setSubject(String(r.subject));
      }
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "下書きを保存できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!preview || !sendRequestId) return;
    setBusy(true);
    try { if (appliedReply) await validateAppliedReply(appliedReply); }
    catch (e) { setNotice(e instanceof Error ? e.message : "返信案を再確認してください。"); setBusy(false); return; }
    setSendState("sending");
    try {
      const r = await api("send", {
        leadId,
        subject: preview.subject,
        text: preview.text,
        requestId: sendRequestId,
        replyToMessageId: preview.replyToMessageId,
        replyContext: appliedReply,
        attachments: preview.files.map(({ name, type, base64 }) => ({
          name,
          type,
          base64,
        })),
      });
      const status = String(r.status || (r.success ? "sent" : "unknown"));
      setSendState(status);
      setNotice(
        r.success
          ? "送信しました。"
          : String(r.error || "送信結果を確認できません。"),
      );
      if (status === "sent") {
        changed();
        setPreview(null);
        setFiles([]);
        setSendRequestId(null);
        sendRef.current = null;
        setSubject("");
        setText("");
        dirty.current = false;
        draftStamp.current = null;
        setAppliedReply(null);
        await list();
      }
    } catch (e) {
      const notSent = (e as Error & { noSend?: boolean })?.noSend;
      setSendState(notSent ? "idle" : "unknown");
      if (notSent) { setPreview(null); setSendRequestId(null); sendRef.current = null; }
      setNotice(
        e instanceof Error
          ? `${e.message}${notSent ? ' メールは送信していません。' : ' 再送せず同期してください。'}`
          : "送信結果を確認できません。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function validateAppliedReply(candidate: ReplyContextStamp) {
    const response = await fetch("/api/oem/reply-assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "validate", leadId, ...candidate }) });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.error || "返信案を再準備してください。");
  }
  async function preparePreview() {
    setBusy(true);
    try {
      if (appliedReply) await validateAppliedReply(appliedReply);
      const id = globalThis.crypto?.randomUUID?.();
      if (!id) throw new Error("安全な送信IDを生成できません。");
      setSendRequestId(id); sendRef.current = id;
      setPreview({ subject: subject || (pending ? `Re: ${pending.subject}` : ""), text, files: [...files], replyToMessageId: pending?.id });
    } catch (e) { setNotice(e instanceof Error ? e.message : "返信案を再確認してください。"); }
    finally { setBusy(false); }
  }
  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length) return;
    if (files.length + selected.length > MAX_FILES) {
      setNotice(`添付は合計${MAX_FILES}ファイルまでです。`);
      return;
    }
    const invalid = selected.find(
        (f) => !ALLOWED.has(f.name.split(".").pop()?.toLowerCase() || ""),
      ),
      size = selected.reduce((n, f) => n + f.size, 0);
    if (invalid || totalBytes + size > MAX_BYTES) {
      setNotice(
        invalid
          ? "添付できる形式を確認してください。"
          : "添付ファイルの合計サイズは3MB以下にしてください。",
      );
      return;
    }
    try {
      const uploads = await Promise.all(
        selected.map(
          (file) =>
            new Promise<Upload>((resolve, reject) => {
              const reader = new FileReader(),
                ext = file.name.split(".").pop()?.toLowerCase() || "";
              reader.onload = () =>
                resolve({
                  name: file.name,
                  type: MIME[ext],
                  base64: String(reader.result).split(",")[1] || "",
                  size: file.size,
                });
              reader.onerror = () =>
                reject(new Error("添付ファイルを読み込めませんでした。"));
              reader.readAsDataURL(file);
            }),
        ),
      );
      setFiles((old) => [...old, ...uploads]);
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "添付ファイルを読み込めませんでした。",
      );
    }
  }
  const pending = data?.newestPendingReplyId
    ? data.messages.find((m) => m.id === data.newestPendingReplyId)
    : data?.messages
        .filter(
          (m) => m.direction === "inbound" && !m.replyClosedAt && !m.handledAt,
        )
        .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))[0];
  const pendingUnavailable = Boolean(data?.newestPendingReplyId && !pending);
  const download = (messageId: string, attachmentId: string) => {
    window.location.href = `/api/oem/mail/attachment?leadId=${encodeURIComponent(leadId)}&messageId=${encodeURIComponent(messageId)}&attachmentId=${encodeURIComponent(attachmentId)}`;
  };
  return (
    <section
      onClick={(e) => e.stopPropagation()}
      aria-labelledby={`conversation-${leadId}`}
      style={{
        marginTop: 24,
        borderTop: "1px solid var(--admin-border)",
        paddingTop: 24,
      }}
    >
      <h4
        id={`conversation-${leadId}`}
        style={{ margin: "0 0 14px", fontSize: 17 }}
      >
        顧客メールスレッド
      </h4>
      {loading && <p>会話を読み込み中…</p>}
      {error && (
        <p role="alert" style={{ color: "#fca5a5" }}>
          {error}
        </p>
      )}
      {!loading && data && (
        <>
          {data.messages.length === 0 ? (
            <p>この案件のメールはまだありません。</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {data.messages.map((m) => (
                <article
                  key={m.id}
                  style={{
                    padding: 14,
                    border: "1px solid var(--admin-border)",
                    borderRadius: 6,
                    background: "var(--admin-card)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "var(--admin-text-muted)",
                    }}
                  >
                    <span>
                      {m.direction === "inbound"
                        ? m.handledAt || m.replyClosedAt
                          ? `受信 · ${m.reviewedAt ? "" : "未確認 · "}対応済み`
                          : `受信 · ${m.reviewedAt ? "" : "未確認 · "}返信待ち`
                        : m.status === "sent"
                          ? "送信済み"
                          : m.status === "failed"
                            ? "送信失敗"
                            : m.status === "unknown"
                              ? "結果未確認"
                              : m.status || "送信待ち"}
                    </span>
                    <time dateTime={m.sentAt}>
                      {new Date(m.sentAt).toLocaleString("ja-JP")}
                    </time>
                  </div>
                  <strong style={{ display: "block", marginTop: 6 }}>
                    {m.subject || "(件名なし)"}
                  </strong>
                  <p
                    style={{
                      margin: "8px 0",
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {m.text}
                  </p>
                  {m.direction === "inbound" &&
                    !m.replyClosedAt &&
                    (!m.handledAt || m.handledBy) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handle(m, !m.handledAt)}
                        style={button}
                      >
                        {m.handledAt ? "返信待ちに戻す" : "対応済みにする"}
                      </button>
                    )}
                  {m.attachments?.map((file) => (
                    <button
                      type="button"
                      key={file.id || file.name}
                      disabled={!file.id}
                      onClick={() => download(m.id, file.id)}
                      style={button}
                    >
                      {file.name}
                    </button>
                  ))}
                </article>
              ))}
            </div>
          )}
          <div
            style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}
          >
            {data.hasMore && data.nextCursor && (
              <button
                type="button"
                onClick={() => void list(data.nextCursor)}
                disabled={busy}
                style={button}
              >
                以前の会話を読み込む
              </button>
            )}
            <button
              type="button"
              onClick={() => void sync()}
              disabled={busy}
              style={button}
            >
              メールを同期
            </button>
            {syncHasMore && syncCursor && (
              <button
                type="button"
                onClick={() => void sync(syncCursor)}
                disabled={busy}
                style={button}
              >
                同期の続きを取得
              </button>
            )}
          </div>
          {pendingUnavailable && (
            <p role="status" style={{ color: "#fbbf24" }}>
              返信待ちのメールがあります。以前の会話を読み込んで確認してください。
            </p>
          )}
          {pending && (
            <p style={{ color: "#fbbf24" }}>
              最新の返信待ち：{pending.subject || "(件名なし)"}{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() => void handle(pending, true)}
                style={button}
              >
                返信不要・対応済みにする
              </button>
            </p>
          )}
          {!data.connected && (
            <p role="status" style={{ color: "#fbbf24" }}>
              メールボックス未接続のため、返信はできません。
            </p>
          )}
          {data.connected && !locked && (
            <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
              <OemReplyAssistant leadId={leadId} disabled={busy || !!preview || pendingUnavailable} composerKey={JSON.stringify({ subject, text, draftStamp: draftStamp.current })} hasExistingText={!!subject.trim() || !!text.trim()} onApply={(candidate) => { if (!candidate.contextSnapshot) { setNotice("返信案を再準備してください。"); return; } setSubject(candidate.subject); setText(candidate.text); dirty.current = true; setAppliedReply({ templateId: candidate.templateId, contextSnapshot: candidate.contextSnapshot }); setPreview(null); setSendRequestId(null); sendRef.current = null; setNotice("返信案を反映しました。内容を確認・編集してください。未送信です。"); }} />
              <label>
                宛先
                <input value={leadEmail} readOnly style={inputStyle} />
              </label>
              <label>
                件名
                <input
                  disabled={busy || !!preview}
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    dirty.current = true;
                  }}
                  style={inputStyle}
                />
              </label>
              <label>
                返信本文
                <textarea
                  disabled={busy || !!preview}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    dirty.current = true;
                  }}
                  rows={6}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </label>
              <input
                ref={inputRef}
                type="file"
                hidden
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx"
                onChange={(e) => void choose(e)}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy || !!preview}
                style={button}
              >
                ファイルを添付（{files.length}）
              </button>
              {files.map((file) => (
                <button
                  key={file.name}
                  type="button"
                  onClick={() =>
                    setFiles((old) =>
                      old.filter((item) => item.name !== file.name),
                    )
                  }
                  disabled={!!preview}
                  style={button}
                >
                  {file.name} ×
                </button>
              ))}
              <div>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy || !!preview}
                  style={button}
                >
                  下書きを保存
                </button>
                <button
                  type="button"
                  onClick={() => void preparePreview()}
                  disabled={busy || !!preview || !text.trim() || pendingUnavailable}
                  style={sendButton}
                >
                  送信内容を確認
                </button>
              </div>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 13 }}>共有下書きの再読み込み</summary>
                <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}><input type="checkbox" checked={reloadDraft} onChange={(e) => setReloadDraft(e.target.checked)} disabled={busy || !!preview} /> 未保存の件名・本文を、保存済みの共有下書きで置き換える</label>
                <button type="button" disabled={busy || !!preview || !reloadDraft} style={button} onClick={async () => { setBusy(true); try { const result = await api("list", { leadId }) as unknown as MailboxData; setSubject(result.draft?.subject || ""); setText(result.draft?.text || ""); draftStamp.current = result.draft?.updatedAt || null; dirty.current = false; setAppliedReply(result.draft?.replyContext || null); setReloadDraft(false); setNotice("共有下書きを読み込みました。"); } catch (e) { setNotice(e instanceof Error ? e.message : "下書きを読み込めません。"); } finally { setBusy(false); } }}>共有下書きを読み込む</button>
              </details>
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          {preview && (
            <div
              style={{
                marginTop: 14,
                padding: 16,
                border: "1px solid var(--admin-accent)",
                borderRadius: 6,
              }}
            >
              <h5>送信前プレビュー</h5>
              <p>宛先：{leadEmail}</p>
              <p>返信対象：{preview.replyToMessageId ? data?.messages.find(m => m.id === preview.replyToMessageId)?.subject || "選択した受信メール" : "新規のご案内（特定の受信メールへの返信ではありません）"}</p>
              <p>{preview.subject || "(件名なし)"}</p>
              <p style={{ whiteSpace: "pre-wrap" }}>{preview.text}</p>
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || locked}
                style={sendButton}
              >
                {busy ? "送信処理中…" : "この内容で送信"}
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={busy}
                style={{ ...button, marginLeft: 8 }}
              >
                戻る
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: 5,
  padding: "10px 12px",
  background: "var(--admin-card)",
  color: "var(--admin-text)",
  border: "1px solid var(--admin-border)",
  borderRadius: 5,
  fontSize: 15,
};
const button = {
  padding: "7px 11px",
  border: "1px solid var(--admin-border)",
  borderRadius: 5,
  background: "transparent",
  color: "var(--admin-text)",
  cursor: "pointer",
};
const sendButton = {
  ...button,
  background: "var(--admin-accent)",
  color: "#fff",
  fontWeight: 700,
};
