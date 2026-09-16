'use client'

import Image from 'next/image'
import { useRef, type KeyboardEvent } from 'react'
import styles from './PackageShowcase.module.css'

const packages = [
  { id: 'curry-box', label: 'カレー化粧箱' },
  { id: 'sauce-pouch', label: 'たれ・キャップ付きパウチ' },
  { id: 'jar-small', label: 'ジャム・丸瓶小' },
  { id: 'ramen-bag', label: '2食入りラーメン' },
  { id: 'furikake-small', label: 'ふりかけ・小瓶35g' },
  { id: 'curry-pp', label: 'カレーPP袋包装' },
  { id: 'ramen-box', label: 'ラーメン化粧箱' },
  { id: 'sauce-square', label: '角型ソースボトル' },
  { id: 'sauce-round', label: '丸型ソースボトル' },
  { id: 'furikake-jar', label: 'ふりかけジャー容器' },
  { id: 'furikake-bag', label: 'ふりかけ袋包装' },
  { id: 'jar-large', label: 'ご飯のお供・丸瓶大' },
  { id: 'curry-bulk', label: 'カレー・バルク（ラベルなし）' },
  { id: 'tea-retail', label: '原料持ち込みのお茶 / 紙＋縦帯（4包入り）' },
] as const

export default function PackageShowcase() {
  const galleryRef = useRef<HTMLDivElement>(null)

  const moveGallery = (direction: 'next' | 'previous') => {
    const gallery = galleryRef.current
    if (!gallery) return
    gallery.scrollBy({
      left: direction === 'next' ? gallery.clientWidth * 0.82 : -gallery.clientWidth * 0.82,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }

  const handleGalleryKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      moveGallery(event.key === 'ArrowRight' ? 'next' : 'previous')
    }
  }

  return (
    <section className={styles.section} aria-labelledby="package-showcase-heading">
      <div className={styles.inner}>
        <h2 id="package-showcase-heading" className={styles.heading}><span>福島の素材から、</span><span>こんな商品に。</span></h2>
        <p className={styles.intro}>
          素材の魅力を活かした、商品づくりの一例です。パッケージの形や容量も、企画に合わせてご提案します。
        </p>

        <div className={styles.toolbar}>
          <p className={styles.hint}>← → スワイプしてご覧ください</p>
          <div className={styles.controls} aria-label="パッケージ一覧の操作">
            <button type="button" className={styles.control} onClick={() => moveGallery('previous')} aria-label="前のパッケージを見る">
              <span aria-hidden="true">←</span>
            </button>
            <button type="button" className={styles.control} onClick={() => moveGallery('next')} aria-label="次のパッケージを見る">
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <div ref={galleryRef} className={styles.gallery} tabIndex={0} role="region" aria-label="パッケージ形状のサンプル一覧" onKeyDown={handleGalleryKeyDown}>
          {packages.map(({ id, label }) => (
            <article className={styles.card} key={id}>
              <div className={styles.imageWrap}>
                <Image
                  className={styles.image}
                  src={`/images/package-samples/${id}-illustration.webp`}
                  alt={`${label}のイラスト`}
                  width={480}
                  height={480}
                  sizes="(max-width: 640px) 76vw, (max-width: 1160px) 22vw, 238px"
                />
              </div>
              <h3 className={styles.label}>{label}</h3>
            </article>
          ))}
        </div>

        <p className={styles.note}>サンプルイラストです。仕様・対応可否はご相談ください。お茶は原料のご支給が必要です。</p>
        <a className={styles.cta} href="#bto-form">包装を見て、概算を確認</a>
      </div>
    </section>
  )
}
