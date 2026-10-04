import type { Metadata } from 'next'
import AnalyticsTrafficControl from './AnalyticsTrafficControl'
import styles from './AnalyticsSettings.module.css'

export const metadata: Metadata = {
    title: '社内確認用のアクセス設定',
    description: 'このブラウザーで行うOEMサイトの確認操作をアクセス集計から除外する設定です。',
    robots: { index: false, follow: false },
}

export default function AnalyticsSettingsPage() {
    return (
        <main className={styles.page}>
            <section className={styles.card}>
                <p className={styles.brand}>会津ブランド館・OEMサイト</p>
                <h1 className={styles.heading}>社内確認用のアクセス設定</h1>
                <p className={styles.lead}>
                    社内の確認操作を、お客様のアクセス数に含めないための設定です。
                    設定はこのブラウザーだけに保存され、他の端末やお客様には影響しません。
                </p>
                <AnalyticsTrafficControl />
                <p className={styles.note}>
                    別のブラウザー・プロファイル・端末ではそれぞれ登録してください。
                    ブラウザーの保存データを消すと設定も解除されます。
                    過去の集計データは変更しません。
                </p>
            </section>
        </main>
    )
}
