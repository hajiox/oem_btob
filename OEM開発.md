# B2B 食品OEM受発注システム (OEM BTOB) 開発ログ

## 📌 プロジェクト概要
- **ローカル開発パス**: `c:\作業用\oem_btob`
- **GitHub**: `hajioxs-projects/oem_btob`
- **本番用公開URL (Vercel)**: `https://v0-b2-b-food-oem-landing-page.vercel.app`
- **使用技術**: Next.js (App Router), React, Tailwind CSS, Framer Motion, Supabase (Auth, Database, RLS), Vercel, Vercel Blob, Google Gemini 2.0 Flash
- **目的**: 小ロットから対応可能なB2B向け食品OEMのランディングページ(LP)と、顧客が要望に合わせた構成を組んで概算見積もりを出せる動的BTO(Build To Order)フォーム、およびその管理ダッシュボードの構築。

---

## 🔑 アカウント・認証情報

### アプリケーション管理画面 (Vercel本番 / ローカル共通)
- **URL (本番)**: `https://v0-b2-b-food-oem-landing-page.vercel.app/admin/login`
- **URL (ローカル)**: `http://localhost:3000/admin/login`
- **ログインメール**: `staff@aizu-tv.com`
- **ログインパスワード**: `WAmas0831`

### Supabase プロジェクト
- **プロジェクト名**: `oem-btob`
- **Dash URL**: `https://supabase.com/dashboard/project/zfhswguzqyagmhhlpksq`
- **Project URL**: `https://zfhswguzqyagmhhlpksq.supabase.co`
- **データベースパスワード**: `xUNXcPDxV8zDKesJ`
- *(Anon Key と Service Role Key は `.env.local` および Vercel Environment Variables に設定済み)*

### Vercel Blob Storage
- プロジェクトに接続済み（`BLOB_READ_WRITE_TOKEN` を Vercel の `.env` で管理）
- LP画像のアップロード先として使用

### Gemini API (Google AI)
- **API Key**: `.env.local` の `GEMINI_API_KEY` に設定済み
- **Vercel環境変数**: 本番プロジェクトの Environment Variables に `GEMINI_API_KEY` を設定済み
- **モデル**: `gemini-2.0-flash`
- **用途**: LP画像アップロード時のテキスト自動読み取り・alt属性メタデータ自動生成

### Resend (メール配信サービス)
- **ダッシュボード**: https://resend.com/domains
- **API Key**: `.env.local` および Vercel Environment Variables に `RESEND_API_KEY` として設定済み
- **登録ドメイン**: `aizu-tv.com` (Tokyo / ap-northeast-1 リージョン)
- **DNS設定状況**: VALUE-DOMAIN (CORESERVER) に DKIM / SPF / MX / DMARC の4レコードを追加済み。Resend側で「Checking DNS」→「Verified」になり次第、送信元アドレスを `onboarding@resend.dev` から `staff@aizu-tv.com` に切り替える。
- **管理者通知先**: `staff@aizu-tv.com`
- **用途**: 見積もりフォーム送信時の自動確認メール（お客様宛）＋新規リード獲得通知（管理者宛）

---

## ✅ 実装完了フェーズ

### フェーズ 1: プロジェクト初期設定と基盤構築
- Next.js プロジェクトのセットアップ (Tailwind CSS 適用)
- ルーティング構造の設計 (`/`, `/admin/login`, `/admin/dashboard`, `/admin/form-editor` など)
- Supabase SSR / Middleware の組み込みによる認証保護機能の実装

### フェーズ 2: データベース設計とスキーマ定義 (Supabase)
以下のテーブルと Row Level Security (RLS) を構築:
- `lp_sections`: LPの各セクション情報を管理
- `form_steps`: BTOフォームのステップ（ページ区切り）
- `form_questions`: 各ステップ内の質問データ
- `form_options`: 質問に対する選択肢（価格ベース・価格追加ロジックを含む）
- `leads`: 送信されたお見積り・お問合せ顧客データ

### フェーズ 3: 動的フォームエディタ構築 (管理ダッシュボード)
- `/admin/form-editor` への GUI エディタの実装。
- ステップ、質問、選択肢の「追加」「削除」「並び替え（上下移動）」をリアルタイムで動作するUI (`Lucide React` アイコン利用)。
- 金額計算ロジック（基本料金の書き換え対応、およびオプション追加料金の設定）に対応。
- Server Actions による、Supabaseへの差分反映（UPSERT / DELETE）一括保存機能。

### フェーズ 4: 公開LP上のインタラクティブBTOフォーム実装
- `framer-motion` を用いたリッチなアニメーション付きの動的フォームコンポーネント。
- Supabase からの Form 定義 (ステップ・質問・選択肢) の読み込み。
- ユーザーの選択に合わせたリアルタイムの「概算お見積り金額」の算出。
- 全て入力後の顧客情報送信と、Supabase `leads` テーブルへのデータ永続化アクション。
- Vercel への本番自動デプロイ設定・反映。

### フェーズ 5: リード（受発注）管理とダッシュボードの実装
- Server Actions による `leads` テーブルからの受発注一覧データの取得とダッシュボード表示。
- Client Component (`LeadStatusSelect`) と Server Action を併用した非同期ステータス更新・プルダウン機能の実装。
- React Server Components のベストプラクティスを遵守し、Client Boundary を最小限に抑えた高速な画面遷移。

### フェーズ 5.5: BTO見積もりフォームのUX改善 (2026-03-08)
- **3ステップフロー**: 質問回答 → 見積もり結果表示 → 仮申込（顧客情報入力）の流れに変更。
- **障壁撤廃設計**: お客様情報は最後の最後（仮申込ボタンを押した後）まで一切入力させない。
- **リアルタイム見積もり**: 質問に回答するだけで概算金額を即座に表示。
- **プレミアムデザイン**: ダークテーマ、グラスモーフィズム、グラデーションを用いたモダンUI（Tailwind v4互換のためインラインスタイルに移行）。

### フェーズ 6: LPエディタ＋AI画像解析機能の実装 (2026-03-08)
- **管理画面**: `/admin/lp-editor` に画像管理用GUIエディタを実装。
- **Vercel Blob Storage 連携**: 画像をVercel Blobにアップロードし、DBにURLを保存する方式。
- **画像管理機能**:
  - 画像のアップロード（複数選択対応）
  - 画像の削除
  - ドラッグ＆ドロップまたは↑↓ボタンによる並び替え
  - タイトル/alt属性テキストの編集
  - 「初期画像を復元」ボタンによるデフォルト画像の一括復元
- **AI画像メタデータ自動生成 (Gemini 2.0 Flash)**:
  - 画像アップロード時に、AIが画像内のテキスト（キャッチコピー等）を自動で読み取り
  - SEOに適した1〜2文のalt属性用テキストを自動生成
  - 失敗時はファイル名をフォールバックとして使用
- **公開ページ連動**: DBに画像が登録されている場合はDB優先表示、未登録時はハードコードされたデフォルト画像をフォールバック表示。
- **関連ファイル**:
  - `src/actions/lpEditor.ts` — LP画像CRUD操作のServer Actions
  - `src/actions/lpEditorForceSeed.ts` — 初期画像の強制復元Server Action
  - `src/actions/imageMetadata.ts` — Gemini 2.0 Flash によるAI画像解析Server Action
  - `src/components/LpEditorClient.tsx` — LPエディタのクライアントコンポーネント
  - `src/app/admin/(dashboard)/lp-editor/page.tsx` — LPエディタページ
  - `src/app/api/upload-image/route.ts` — Vercel Blobへの画像アップロードAPIルート

---

## 🚀 直近の開発・機能追加 (2026-03-11 更新)

**フェーズ 7: 見積もりロジックとフォームUIの大幅改善**
- **OEM製造数指定ステップの実装**: フォームの先頭で「製造予定数量（400〜800個）」を入力させるステップを追加。
- **金額計算ロジックの刷新**: 選択肢の金額を「1個あたりの単価」として計算し、最後に「単価 × 数量 = 概算見積金額」となるように変更。あわせて内税（10%）の表示を追加。
- **ドロップダウンUIの洗練化（UX改善）**:
  - `select`, `select_text`, `select_number` の各入力形式に対し、選択項目ごとの「説明文（Description）」を美しくハイライト表示するUIを実装。
  - テキスト入力・数値入力エリアのデザイン（パディング調整、色味変更、不要なプレースホルダー削除等）を見直し。
  - データベースの `form_questions` の `input_type` 制約を更新し、新しい入力フォーマットに対応。
- **LP/フォームエディタの動線改善**: 「完成ページを見る（View Live URL）」ボタンをヘッダーに設置し、管理画面から実際の公開URLへ1クリックで遷移可能に。

**フェーズ 9: 自動メール送信機能とダッシュボード・UXの高度化 (2026-03-12 更新)**
- **自動メール通知の実装 (Resend 連携)**:
  - 見積もりフォーム送信時に、お客様へ「【自動回答】お見積り依頼を承りました」という確認メールを自動送信。
  - 管理者 (`staff@aizu-tv.com`) へも、新規リード獲得を知らせる通知メールを即座に送信するように実装。
  - サーバーサイドの Server Action (`submitLead`) 内で Resend API を活用した非同期送信。
- **販売プランシミュレーターの強化**:
  - 見積もり結果画面にて、利益率 30%, 40%, 50% の3パターンにおける「想定売価」と「1個あたりの粗利益」を自動計算して一覧表示する機能を追加。
  - クライアントがその場で「いくらで売ればどれだけ儲かるか」をイメージできる体験を構築。
- **管理ダッシュボードのUX刷新**:
  - リード一覧のテーブルに行の展開（アコーディオン）機能を実装。
  - 行をクリックするだけで、そのリードの「BTO回答詳細（どの質問にどう答えたか）」や「電話番号・備考事項」をその場で確認できる直感的なUIに改善。
  - テーブル全体の余白（パディング）を見直し、よりモダンで情報の詰まりを感じさせないデザインへ。
- **リード削除機能の追加**:
  - ダッシュボードから個別のリード（テストデータ等）を削除できるゴミ箱ボタンを実装。削除前の確認ダイアログ付き。
- **フォームの堅牢性向上（バグ修正）**:
  - クライアント側でのレンダリング時に、質問データや選択肢が不足している場合に発生しうるクラッシュを防止する防御コード（Optional Chaining / Fallback logic）を全域に適用。

---

## 🎯 次回の開発に向けて (ネクストステップ)
- **【最優先】Resend ドメイン認証の確認**: Resendダッシュボード (https://resend.com/domains) で `aizu-tv.com` のステータスが「Verified」になっているか確認。認証完了していたら、`src/actions/publicForm.ts` 内の `from:` アドレスを `onboarding@resend.dev` → `staff@aizu-tv.com` (または `noreply@aizu-tv.com` 等) に書き換えてデプロイ。
- **メール送信のテスト**: ドメイン認証完了後、フォームからテスト送信を行い、お客様宛・管理者宛の両方のメールが正常に届くことを確認。
- **多言語対応やLPテキストの完全動的化**: ユーザーの要望に応じて、フォームの中身だけでなくLP上のキャッチコピーなども管理画面から変更できるように拡張を検討。
- **SEO/OGP の詳細設定**: 各ページの SNS シェア時の見栄え（OGP画像自動生成など）を AI を活用してブラッシュアップ。

---
*Updated by Antigravity Assistant (2026-03-12)*
