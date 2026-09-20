import Image from 'next/image'
import styles from './OemRankingProof.module.css'

const achievements = [
  {
    image: '/images/btob/oem-ranking-curry-v2.webp',
    alt: 'Yahoo!ショッピング 悪魔のBUTAカレー カテゴリランキング1位獲得の実績紹介',
    category: '食品 ＞ 惣菜、料理 ＞ カレー、ハヤシライス',
    ranking: 'デイリーランキング 1位',
    date: '2026年7月4日更新',
  },
  {
    image: '/images/btob/oem-ranking-tsukemen-v2.webp',
    alt: '楽天市場 特濃つけ麺 カテゴリランキング1位獲得の実績紹介',
    category: '食品 ＞ 麺類 ＞ つけ麺',
    ranking: 'リアルタイムランキング 1位',
    date: '2026年9月12日23:55更新',
  },
]

export default function OemRankingProof() {
  return (
    <section className={styles.section} aria-labelledby="oem-ranking-heading">
      <h2 id="oem-ranking-heading">自社商品で磨いてきた味づくりを、あなたの商品にも。</h2>
      <div className={styles.grid}>
        {achievements.map((item) => (
          <figure className={styles.card} key={item.image}>
            <Image src={item.image} alt={item.alt} width={1254} height={1254}
              sizes="(max-width: 640px) calc(100vw - 40px), (max-width: 896px) calc((100vw - 64px) / 2), 416px" />
            <figcaption>
              <p>{item.category}</p>
              <p className={styles.ranking}>{item.ranking}</p>
              <p>{item.date}</p>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className={styles.note}>※当社販売商品の過去のランキング実績です。OEM商品の評価・販売順位を保証するものではありません。</p>
    </section>
  )
}
