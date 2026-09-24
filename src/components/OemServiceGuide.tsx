import styles from './OemServiceGuide.module.css'

// Server-rendered copy for the OEM page only; quote rules remain in the BTO.
export function OemExplanation() {
  return (
    <section className={`${styles.panel} ${styles.intro}`} aria-labelledby="oem-service-title">
      <h1 id="oem-service-title"><span className={styles.headingLine}>あなたの農園・お店の</span><span className={styles.headingLine}><span className={styles.phrase}>オリジナル商品を</span><span className={styles.phrase}>作りませんか？</span></span></h1>
      <p>育てた農産物を加工品にしたい。自分の売り場だけの商品を作りたい。会津ブランド館が製造・包装を担い、あなたの農園名・店名で販売できる食品に仕上げます。</p>
      <p className={styles.definition}>こうした「自分のブランドの商品を、他社に製造してもらう仕組み」が <strong>OEM</strong> です。</p>
      <a className={styles.introButton} href="#bto-form"><span>作りたい商品を選んで、<wbr />概算費用を見る</span><span aria-hidden="true">→</span></a>
    </section>
  )
}

export function OemServiceQuestions() {
  return (
    <section className={styles.panel} aria-labelledby="oem-questions-title">
      <h2 id="oem-questions-title">食品の加工委託・商品づくりのよくあるご質問</h2>
      <p className={styles.note}>気になる項目を押すと、詳しい説明が開きます。</p>
      <div className={styles.questions}>
        <details className={styles.disclosure}>
          <summary>どんな食品を作れますか？</summary>
          <p>レトルトカレー、2食入りラーメン、たれ・ソース・ドレッシング、ふりかけ、ジャム・ご飯のお供などの瓶詰め、お茶のティーバッグに対応しています。商品と包装を選ぶと、概算費用を確認できます。</p>
        </details>
        <details className={styles.disclosure}>
          <summary>小ロットは何個ですか？</summary>
          <p>基本は1ロット約400個、ラーメンは2食入り約400セットです。製造数量は多少前後し、完成した全数をお買い取りいただき、実際の数量で精算します。お茶は「4包入り×400個」または「50包入り×100袋」の専用プランです。</p>
        </details>
        <details className={styles.disclosure} id="oem-materials">
          <summary>自分の農産物を持ち込めますか？</summary>
          <p>原料をご支給いただく商品づくりをご相談いただけます。種類・状態・数量により対応可否を確認します。お茶は原料のご支給が必須で、乾燥・必要に応じた焙煎も行いますが、乾燥をお引き受けできない食材もあります。</p>
          <p className={styles.followup}>ご相談時に、使いたい原料名・状態・用意できる量をお知らせください。原料は1種類まで、弊社への発送は元払いでお願いしています。必要な量や受け入れ方法は、原料を送る前にご確認ください。</p>
          <p className={styles.followup}>原料を支給した場合の価格調整は、自動見積もりには反映せず、正式見積もりで確認します。お茶以外は原料支給がなくてもご相談いただけますが、特殊な食材などは調達できない場合があります。キャップ付きパウチは、粘度が高すぎる配合では充填できません。</p>
        </details>
        <details className={styles.disclosure} id="oem-cost">
          <summary>食品OEMの費用には、何が含まれますか？</summary>
          <p>自動見積もりの金額は概算です。食材や仕様によって金額は変わり、正式見積もりで確定します。商品・包装の費用と送料・発送梱包手数料6,000円（税別・1注文につき）を含む内訳は、下の自動見積もりで確認できます。初回無料特典の対象・追加費用も見積もり画面に表示します。</p>
          <dl className={styles.costs}>
            <div><dt>商品・製造・包装</dt><dd>選んだ材料・包装と製造手数料を含みます。お茶は乾燥・必要に応じた焙煎・製造・包装を含む専用プランで、製造手数料の別途加算はありません。</dd></div>
            <div><dt>送料・発送梱包</dt><dd>1注文につき6,000円（税別）を概算総額に加算しています。支給原料を弊社へ送る送料は、お客様のご負担です。</dd></div>
            <div><dt>試作・表示・デザイン</dt><dd>通常は試作費（2回まで）10,000円、原材料表示作成5,000円、栄養成分表示作成（計算値）5,000円、簡易パッケージデザイン30,000円（すべて税別）。この合計50,000円が、1企業（個人は1名）につき初回1回のみ無料です。追加試作は1回3,000円（税別）、特典対象外の費用は別途となります。</dd></div>
          </dl>
          <p className={styles.note}>初回無料は上記の試作・表示・デザイン費が対象です。商品の製造代金や送料まで無料になる特典ではありません。</p>
        </details>
        <details className={styles.disclosure}>
          <summary>道の駅・ふるさと納税向けの商品も相談できますか？</summary>
          <p>それらの販売先を想定した商品の製造をご相談いただけます。販路について多少のアドバイスはできますが、道の駅への商談・紹介、ふるさと納税への登録代行は行っていません。</p>
        </details>
      <details className={styles.disclosure} id="oem-process">
      <summary>ご相談から製造・納品までの流れ</summary>
      <ol className={styles.process}>
        <li><h3>概算を見る</h3><p>商品・材料・包装を選び、ご予算の目安を確認します。この時点では発注になりません。</p></li>
        <li><h3>商品について相談</h3><p>使いたい原料、目指す味、販売する場所、希望時期をお知らせください。対応できる内容を確認します。</p></li>
        <li><h3>試作で味を確認</h3><p>商品の方向性を相談し、試作で味を確認します。試作費と初回無料の適用条件も確認します。</p></li>
        <li><h3>仕様・見積もりを確定</h3><p>味・包装・表示内容と正式見積もりを確認し、製造する内容と納品予定を決めます。</p></li>
        <li><h3>前金のお支払い・製造</h3><p>正式発注後、正式見積金額の50％を前金としてお支払いいただきます。ご入金確認後、確定した仕様で製造・包装します。</p></li>
        <li><h3>残額の精算・出荷</h3><p>完成した全数をお買い取りいただき、実際の製造数量で金額を確定します。前金を差し引いた残額を出荷前にご精算いただきます。</p></li>
      </ol>
      <p className={styles.note}>納期は、試作・原料の準備・包装仕様・製造状況によって異なります。販売したい時期が決まっている場合は、ご相談時にお知らせください。</p>
      </details>
      </div>
      <a className={styles.link} href="#bto-form">商品・包装を選んで、概算見積もりへ →</a>
    </section>
  )
}
