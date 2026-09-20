import { rankingMarkets } from '@/data/oem-ranking-achievements'
import styles from './OemRankingProof.module.css'

export default function OemRankingProof() {
  return (
    <section className={styles.section} aria-labelledby="oem-ranking-heading">
      <h2 id="oem-ranking-heading">自社商品で培った味づくりを、あなたの商品にも。</h2>
      <p className={styles.intro}>楽天市場・Yahoo!ショッピングでのランキング実績をご紹介します。</p>

      <details className={styles.details}>
        <summary>ランキング実績を見る（楽天・Yahoo! 各5商品）</summary>
        <div className={styles.marketGrid}>
          {rankingMarkets.map((market) => (
            <section className={styles.market} key={market.name} aria-labelledby={`ranking-market-${market.name}`}>
              <h3 id={`ranking-market-${market.name}`}>{market.name}</h3>
              <ol className={styles.items}>
                {market.items.map((item) => (
                  <li className={styles.item} key={`${item.name}-${item.date}`}>
                    <div className={styles.itemHeading}>
                      {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.name}</a> : <span>{item.name}</span>}
                    </div>
                    <div className={styles.meta}>
                      <span className={styles.ranking}>{item.ranking}</span>
                      <span>{item.category}</span>
                      <span>{item.date}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <p className={styles.note}>当社販売商品の過去のカテゴリランキング実績の一例です。OEM商品の評価・販売順位を保証するものではありません。</p>
      </details>
    </section>
  )
}
