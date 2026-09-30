"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { OemConversationPanel } from "./OemConversationPanel";
export type ConversationAlert = {
  leadId: string;
  companyName: string;
  email?: string;
  unreadCount: number;
  awaitingReplyCount: number;
  lastInboundAt: string | null;
  preview: string;
  latestMessageId: string;
};
type Result = {
  success: boolean;
  alerts: ConversationAlert[];
  total: number;
  unreadCases: number;
  awaitingReplyCases: number;
  hasMore: boolean;
  nextOffset: number;
  sync?: {
    lastCompletedAt: string | null;
    lastRunAt: string | null;
    lastError: string | null;
    connected: boolean;
  };
};
const button = {
  padding: "7px 12px",
  background: "var(--admin-bg)",
  color: "var(--admin-text)",
  border: "1px solid var(--admin-border)",
  borderRadius: 6,
  cursor: "pointer",
};
export function OemConversationAlerts() {
  const [items, setItems] = useState<ConversationAlert[]>([]),
    [total, setTotal] = useState(0),
    [summary, setSummary] = useState({ unreadCases: 0, awaitingReplyCases: 0 }),
    [sync, setSync] = useState<Result["sync"]>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [offset, setOffset] = useState(0),
    [hasMore, setHasMore] = useState(false),
    [selected, setSelected] = useState<ConversationAlert | null>(null);
  const request = useRef(false);
  const load = useCallback(async (reset = false, startOffset = 0) => {
    if (request.current) return;
    request.current = true;
    try {
      const start = reset ? 0 : startOffset;
      const r = await fetch(`/api/oem/mail/attention?offset=${start}`, {
        cache: "no-store",
      });
      const data = (await r.json()) as Result;
      if (!r.ok || !data.success)
        throw new Error("メール注意案件を取得できませんでした。");
      setItems((old) =>
        reset
          ? data.alerts
          : [
              ...old,
              ...data.alerts.filter(
                (item) => !old.some((x) => x.leadId === item.leadId),
              ),
            ],
      );
      setOffset(data.nextOffset);
      setHasMore(Boolean(data.hasMore));
      setTotal(data.total);
      setSummary({
        unreadCases: data.unreadCases,
        awaitingReplyCases: data.awaitingReplyCases,
      });
      setSync(data.sync);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "メール注意案件を取得できませんでした。",
      );
    } finally {
      request.current = false;
      setLoading(false);
    }
  }, []);
  const refresh = useCallback(async () => {
    if (request.current) return;
    setBusy(true);
    request.current = true;
    try {
      const r = await fetch("/api/oem/mail/attention", {
        cache: "no-store",
      });
      const d = (await r.json()) as Result;
      if (!r.ok || !d.success) throw new Error("更新できませんでした。");
      setItems(d.alerts);
      setOffset(d.nextOffset);
      setHasMore(Boolean(d.hasMore));
      setTotal(d.total);
      setSummary({
        unreadCases: d.unreadCases,
        awaitingReplyCases: d.awaitingReplyCases,
      });
      setSync(d.sync);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新できませんでした。");
    } finally {
      request.current = false;
      setBusy(false);
    }
  }, []);
  const syncNow = useCallback(async () => {
    if (request.current) return;
    setBusy(true);
    request.current = true;
    try {
      const r = await fetch("/api/oem/mail/attention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const d = await r.json();
      if (!r.ok || !d.success)
        throw new Error(d.error || "メール同期を開始できませんでした。");
      request.current = false;
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "メール同期を開始できませんでした。",
      );
    } finally {
      request.current = false;
      setBusy(false);
    }
  }, [refresh]);
  useEffect(() => {
    void load(true).then(() => syncNow());
    const onChange = () => void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("oem-conversation-changed", onChange);
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncNow();
    }, 60000);
    const visibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("oem-conversation-changed", onChange);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load, refresh, syncNow]);
  return (
    <section
      aria-label="新着・返信待ちメール"
      style={{
        marginBottom: 24,
        padding: 20,
        border: "1px solid var(--admin-border)",
        borderRadius: 10,
        background: "var(--admin-card)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <h2 style={{ fontSize: 18, margin: 0 }}>
          新着・返信待ち{" "}
          {error ? "取得エラー" : loading ? "確認中…" : `${total}件`}
        </h2>
        <div>
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={busy}
            style={button}
          >
            {busy ? "同期中…" : "メールを同期"}
          </button>{" "}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            style={button}
          >
            更新
          </button>
        </div>
      </div>
      <p style={{ color: "var(--admin-text-muted)", fontSize: 13 }}>
        未確認 {summary.unreadCases}件・返信待ち {summary.awaitingReplyCases}件（ここでの確認状態です。Gmailの既読とは別です）
      </p>
      {sync?.connected === false && (
        <p role="status" style={{ color: "#fbbf24" }}>
          メールボックス未接続です。同期結果は確認できません。
        </p>
      )}
      {sync?.lastError && (
        <p role="alert" style={{ color: "#fbbf24" }}>
          同期エラー：{sync.lastError}
        </p>
      )}
      {sync?.lastCompletedAt && (
        <p style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>
          最終同期：{new Date(sync.lastCompletedAt).toLocaleString("ja-JP")}
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: "#fca5a5" }}>
          {error}
        </p>
      )}
      {!error && !loading && items.length === 0 && (
        <p style={{ color: "#4ade80" }}>確認が必要なメールはありません。</p>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => (
          <button
            key={item.leadId}
            type="button"
            onClick={() => setSelected(item)}
            style={{
              ...button,
              padding: 14,
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>
              <strong>{item.companyName}</strong>
              <small
                style={{
                  display: "block",
                  color: "var(--admin-text-muted)",
                  marginTop: 4,
                }}
              >
                {item.preview}
              </small>
            </span>
            <span
              style={{
                whiteSpace: "nowrap",
                color: item.awaitingReplyCount
                  ? "#fbbf24"
                  : "var(--admin-text-muted)",
              }}
            >
              未確認 {item.unreadCount} · 返信待ち {item.awaitingReplyCount}
            </span>
          </button>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => void load(false, offset)}
          disabled={busy}
          style={{ ...button, marginTop: 10 }}
        >
          さらに読み込む
        </button>
      )}
      {selected && (
        <div
          style={{
            marginTop: 18,
            border: "1px solid var(--admin-accent)",
            padding: 16,
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <strong>{selected.companyName}</strong>
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={button}
            >
              案件を閉じる
            </button>
          </div>
          <OemConversationPanel
            key={selected.leadId}
            leadId={selected.leadId}
            leadEmail={selected.email || ""}
          />
        </div>
      )}
    </section>
  );
}
