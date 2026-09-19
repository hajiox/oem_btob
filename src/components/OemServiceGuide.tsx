import styles from './OemServiceGuide.module.css'

// Server-rendered copy for the OEM page only; quote rules remain in the BTO.
export function OemExplanation() {
  return (
    <section className={styles.panel} aria-labelledby="oem-service-title">
      <h1 id="oem-service-title">福島の食品OEM・農産物の加工委託</h1>
      <p className={styles.lead}>地域の素材を、あなたの農園・売り場のオリジナル商品に。</p>
      <h2>OEMとは？</h2>
      <p>あなたのブランドの商品を、代わりに製造することです。会津ブランド館が食品の製造を担い、あなたの農園名・店名・ブランド名で販売できる商品に仕上げます。</p>
      <div className={styles.audiences}>
        <div>
          <h3>育てた農産物を商品にしたい方</h3>
          <p>福島の農家・農園の皆さまへ。例えば、桃などの果物をジャムやドレッシングに。支給いただく原料の特徴に合わせて、小ロットでの商品化をご相談いただけます。</p>
        </div>
        <div>
          <h3>自分の売り場の商品を作りたい方</h3>
          <p>道の駅・観光施設のおみやげ売り場、地域のお店の皆さまへ。ご当地カレーやたれ、ご飯のお供など、自店で販売するオリジナル食品の製造をお手伝いします。</p>
        </div>
      </div>
      <p className={styles.note}>素材によって加工方法や対応可否が異なります。まずは下の商品・包装例をご覧ください。</p>
      <a className={styles.link} href="#bto-form">作りたい商品を選んで、概算費用を見る →</a>
    </section>
  )
}

export function OemServiceQuestions() {
  return (
    <section className={styles.panel} aria-labelledby="oem-questions-title">
      <h2 id="oem-questions-title">食品の加工委託・商品づくりのよくあるご質問</h2>
      <div className={styles.questions}>
        <div>
          <h3>どんな食品を作れますか？</h3>
          <p>レトルトカレー、2食入りラーメン、たれ・ソース・ドレッシング、ふりかけ、ジャム・ご飯のお供などの瓶詰め、お茶のティーバッグに対応しています。商品と包装を選ぶと、概算費用を確認できます。</p>
        </div>
        <div>
          <h3>小ロットは何個ですか？</h3>
          <p>基本は1ロット約400個、ラーメンは2食入り約400セットです。製造数量は多少前後し、完成した全数をお買い取りいただき、実際の数量で精算します。お茶は「4包入り×400個」または「50包入り×100袋」の専用プランです。</p>
        </div>
        <div>
          <h3>自分の農産物を持ち込めますか？</h3>
          <p>原料をご支給いただく商品づくりをご相談いただけます。種類・状態・数量により対応可否を確認します。お茶は原料のご支給が必須で、乾燥・必要に応じた焙煎も行いますが、乾燥をお引き受けできない食材もあります。</p>
        </div>
        <div>
          <h3>表示される見積もりは確定金額ですか？</h3>
          <p>概算です。食材や仕様によって金額は変わり、正式見積もりで確定します。商品・包装の費用と送料・発送梱包手数料6,000円（税別・1注文につき）を含む内訳は、下の自動見積もりで確認できます。初回無料特典の対象・追加費用も見積もり画面に表示します。</p>
        </div>
        <div>
          <h3>道の駅での販売や、ふるさと納税向けの商品も相談できますか？</h3>
          <p>それらの販売先を想定した商品の製造をご相談いただけます。販路について多少のアドバイスはできますが、道の駅への商談・紹介、ふるさと納税への登録代行は行っていません。</p>
        </div>
      </div>
      <a className={styles.link} href="#bto-form">商品・包装を選んで、概算見積もりへ →</a>
    </section>
  )
}
