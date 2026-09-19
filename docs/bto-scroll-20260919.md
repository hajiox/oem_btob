# BTO表示位置修正（2026-09-19）

原因: 質問切替後のscrollIntoViewがoverflow:hiddenのBTOセクションまでスクロールさせ、本番でsection.scrollTop=420となり商品名・見出しを切り取っていた。

修正: OEMのみセクションのoverflowをclipに変更。自動移動はwindow.scrollToでカード先頭（商品名含む）へ。質問パネルのプログラムフォーカスを維持しつつパネル自身のoutlineを除去。ボタン・入力欄のフォーカス表示は変更しない。

対象: InteractiveForm.tsx、[slug]/page.tsx。料金・DB・LPビルダーは変更なし。
検証: production build成功。公開後、たれ・ソース・ドレッシングの切替／戻る、セクションscrollTop=0と商品名の表示位置をChromeで確認する。
